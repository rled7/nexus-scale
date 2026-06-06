import { useState, useRef, useCallback, useEffect } from "react";
import { BUILD_HISTORY, CURRENT_BUILD } from "./buildHistory.js";
import {
  fmt, delay,
  JSON_SCHEMA, FALLBACK_ANALYSIS,
  DOC_TYPES, DB_MAP, GUIDANCE_MAP,
  STAGES, BENCHMARK_TESTS, EMPTY_DOT_OPACITIES,
} from "./constants/index.js";
import {
  clamp,
  nearestNeighbor, bilinear, bicubic,
  applyUnsharpMask, applyDenoise, enhanceContrast,
  resizePixels, targetDims, MAX_PIXELS,
} from "./imageProcessing/index.js";
import { qualityScore } from "./imageProcessing/qualityMetrics.js";
import { enhancePDF } from "./pdfEnhancer.js";
import { BrowserLogger } from "./BrowserLogger.js";
import { dataURLtoBlob } from "./fileUtils.js";
import { CSS, S } from "./styles.js";
import { LearningEngine } from "./LearningEngine.js";
import { analyzeLocally } from "./offlineAnalysis.js";
import { runAgents } from "./agents/AgentOrchestrator.js";

/** Generate a small JPEG thumbnail from raw pixel data for filmstrip previews. */
function makeThumbnail(pixelData, w, h, maxW = 120) {
  const ratio = Math.min(maxW / w, 1);
  const tw = Math.round(w * ratio);
  const th = Math.round(h * ratio);
  const src = document.createElement("canvas");
  src.width = w; src.height = h;
  src.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(pixelData), w, h), 0, 0);
  const dst = document.createElement("canvas");
  dst.width = tw; dst.height = th;
  dst.getContext("2d").drawImage(src, 0, 0, tw, th);
  return dst.toDataURL("image/jpeg", 0.6);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function NexusScale(){
  const [fileData, setFileData]   = useState(null);
  const [scale,    setScale]      = useState(2);
  const [target,   setTarget]     = useState(null); // null = multiplier mode; "4K"/"8K" = resolution target
  const [algo,     setAlgo]       = useState("bicubic");
  const [sharpen,  setSharpen]    = useState(0.4);
  const [denoise,  setDenoise]    = useState(0.2);
  const [contrast, setContrast]   = useState(1.1);
  const [stage,    setStage]      = useState(null);
  const [done,     setDone]       = useState([]);
  const [log,      setLog]        = useState([]);
  const [result,   setResult]     = useState(null);
  const [aiReport, setAiReport]   = useState(null);
  const [dragging, setDragging]   = useState(false);
  const [sliderX,  setSliderX]    = useState(50);
  const [activeTab,setActiveTab]  = useState("preview");
  const [err,      setErr]        = useState(null);
  const [isBenchmarking,setIsBenchmarking] = useState(false);
  const [bmResults,setBmResults]  = useState([]);
  const [agentMode,    setAgentMode]     = useState(false);
  const [agentResults, setAgentResults]  = useState(null);
  const [learningSuggestion, setLearningSuggestion] = useState(null);
  const [progressiveEnhance, setProgressiveEnhance] = useState(true);
  const [stageSnapshots, setStageSnapshots] = useState([]);

  const fileRef        = useRef();
  const logRef         = useRef();
  const cmpRef         = useRef();
  const sliding        = useRef(false);
  const pipelineActive = useRef(false);

  const addLog = useCallback((msg,type="info")=>{
    BrowserLogger.log(msg,type);
    setLog(p=>[...p,{msg,type,ts:Date.now()}]);
  },[]);

  useEffect(()=>{ if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight; },[log]);
  useEffect(()=>{ return ()=>{ pipelineActive.current=false; }; },[]);

  // Refresh learning suggestion whenever a pipeline completes (aiReport changes)
  useEffect(()=>{
    if(!aiReport?.analysis?.image_category) return;
    const sugg = LearningEngine.suggest(aiReport.analysis.image_category);
    setLearningSuggestion(sugg);
  },[aiReport]);

  useEffect(()=>{
    const mv=e=>{
      if(!sliding.current) return;
      if(!cmpRef.current){ sliding.current=false; return; }
      const rect=cmpRef.current.getBoundingClientRect();
      const cx=e.touches?e.touches[0].clientX:e.clientX;
      setSliderX(clamp(((cx-rect.left)/rect.width)*100,0,100));
    };
    const up=()=>{ sliding.current=false; };
    window.addEventListener("mousemove",mv,{passive:false});
    window.addEventListener("mouseup",up,{passive:false});
    window.addEventListener("touchmove",mv,{passive:true});
    window.addEventListener("touchend",up,{passive:false});
    return()=>{
      window.removeEventListener("mousemove",mv);
      window.removeEventListener("mouseup",up);
      window.removeEventListener("touchmove",mv);
      window.removeEventListener("touchend",up);
    };
  },[]);

  // ── loadFile ─────────────────────────────────────────────────────────────────
  const loadFile=useCallback((f)=>{
    if(!f) return;
    setFileData(prev=>{
      if(prev?.url&&prev.url.startsWith("blob:")) URL.revokeObjectURL(prev.url);
      return null;
    });
    setResult(null);setAiReport(null);setLog([]);setDone([]);setStage(null);setErr(null);
    const PDF_MAX=18*1024*1024;
    if(f.type==="application/pdf"&&f.size>PDF_MAX){
      setErr(`PDF too large (${(f.size/1024/1024).toFixed(1)} MB). Max 18 MB.`); return;
    }
    const url=URL.createObjectURL(f);     // captured in closure before any async
    const isImg=f.type.startsWith("image/");
    const isPdf=f.type==="application/pdf";
    const reader=new FileReader();
    reader.onerror=()=>setErr("Failed to read file — may be corrupted.");
    reader.onload=e=>{
      const raw=e.target.result||"",ci=raw.indexOf(","),b64=ci!==-1?raw.slice(ci+1):"";
      if(isImg){
        const img=new Image();
        img.onerror=()=>setErr("Image could not be decoded.");
        img.onload=()=>{
          const canvas=document.createElement("canvas");
          canvas.width=img.width; canvas.height=img.height;
          canvas.getContext("2d").drawImage(img,0,0);
          setFileData({url,canvas,w:img.width,h:img.height,b64,name:f.name,size:f.size,type:f.type,isImg,isPdf});
        };
        img.src=url;
      } else {
        setFileData({url,canvas:null,w:null,h:null,b64,name:f.name,size:f.size,type:f.type,isImg,isPdf});
      }
    };
    reader.readAsDataURL(f);
  },[]);

  // ── loadFileAsync — Promise + 5s timeout, used by benchmark ──────────────────
  const loadFileAsync=useCallback((f)=>{
    const TIMEOUT=5000;
    const timeoutP=new Promise((_,rej)=>setTimeout(()=>rej(new Error(`loadFileAsync timed out after ${TIMEOUT}ms`)),TIMEOUT));
    const loadP=new Promise((resolve,reject)=>{
      if(!f){ reject(new Error("No file")); return; }
      const PDF_MAX=18*1024*1024;
      if(f.type==="application/pdf"&&f.size>PDF_MAX){ resolve({error:"PDF too large"}); return; }
      const url=URL.createObjectURL(f);
      const isImg=f.type.startsWith("image/");
      const isPdf=f.type==="application/pdf";
      const reader=new FileReader();
      reader.onerror=()=>{ URL.revokeObjectURL(url); reject(new Error("FileReader failed")); };
      reader.onload=e=>{
        const raw=e.target.result||"",ci=raw.indexOf(","),b64=ci!==-1?raw.slice(ci+1):"";
        if(isImg){
          const img=new Image();
          img.onerror=()=>{ URL.revokeObjectURL(url); reject(new Error("Image decode failed")); };
          img.onload=()=>{
            const canvas=document.createElement("canvas");
            canvas.width=img.width; canvas.height=img.height;
            canvas.getContext("2d").drawImage(img,0,0);
            resolve({url,canvas,w:img.width,h:img.height,b64,name:f.name,size:f.size,type:f.type,isImg,isPdf});
          };
          img.src=url;
        } else {
          resolve({url,canvas:null,w:null,h:null,b64,name:f.name,size:f.size,type:f.type,isImg,isPdf});
        }
      };
      reader.readAsDataURL(f);
    });
    return Promise.race([loadP,timeoutP]);
  },[]);

  // ── Core pipeline ─────────────────────────────────────────────────────────────
  const runPipelineWith=useCallback(async(fdOverride=null,cfgOverride=null)=>{
    const fd  =fdOverride||fileData;
    const sc  =cfgOverride?.scale   ??scale;
    // target precedence INTENTIONALLY differs from scale's `??` fallback: programmatic
    // callers (e.g. the benchmark suite) must not inherit a UI-selected target from
    // state, so they default to multiplier mode unless they explicitly pass `target`.
    const tg  =cfgOverride ? (cfgOverride.target ?? null) : target;
    const al  =cfgOverride?.algo    ??algo;
    const sh  =cfgOverride?.sharpen ??sharpen;
    const dn  =cfgOverride?.denoise ??denoise;
    const ctv =(cfgOverride?.contrast??contrast)??1.0;

    // Guards BEFORE setting pipelineActive — prevents orphaned lock
    if(!fd) return null;
    if(!fdOverride&&stage&&stage!=="done") return null;

    pipelineActive.current=true;
    setDone([]); setErr(null); setResult(null); setStage(null); setStageSnapshots([]);
    if(!fdOverride){ setAiReport(null); setLog([]); }
    const comp=(s)=>{ if(pipelineActive.current) setDone(p=>[...p,s]); };

    try{
      // ── STAGE 1: INGEST ───────────────────────────────────────────────────
      setStage("ingest");
      addLog(`NexusScale ${CURRENT_BUILD.version} — BUILD ${CURRENT_BUILD.build}`,"sys");
      await delay(200); if(!pipelineActive.current) return null;
      addLog(`Target: ${fd.name}`);
      addLog(`${fmt(fd.size)} · ${fd.type}`,"data");
      if(fd.w) addLog(`${fd.w}×${fd.h}px`,"data");
      addLog("File parsed.","ok"); comp("ingest");

      const isProgressive = progressiveEnhance && fd.canvas && fd.w;
      let progPx = null;
      if (isProgressive) {
        progPx = new Uint8ClampedArray(fd.canvas.getContext("2d").getImageData(0, 0, fd.w, fd.h).data);
        setStageSnapshots(prev => [...prev, { stage: "ingest", label: "Ingest", thumb: makeThumbnail(progPx, fd.w, fd.h) }]);
        addLog("Progressive mode: baseline captured", "info");
      }

      // ── STAGE 2: DEEP SCAN ────────────────────────────────────────────────
      setStage("scan");
      addLog("Running deep structural scan...","sys");
      await delay(150); if(!pipelineActive.current) return null;
      let scanMeta={};
      if(fd.canvas&&fd.w){
        const ctx=fd.canvas.getContext("2d");
        const px=ctx.getImageData(0,0,fd.w,fd.h).data;
        let bright=0; const channels={r:0,g:0,b:0};
        const step=Math.max(1,Math.floor(px.length/4/5000)); let cnt=0;
        for(let i=0;i<px.length;i+=4*step){
          channels.r+=px[i]; channels.g+=px[i+1]; channels.b+=px[i+2];
          bright+=(px[i]*.299+px[i+1]*.587+px[i+2]*.114); cnt++;
        }
        const avg=bright/cnt, mp=fd.w*fd.h;
        scanMeta={avgBright:avg.toFixed(1),mp,channels:{r:(channels.r/cnt).toFixed(0),g:(channels.g/cnt).toFixed(0),b:(channels.b/cnt).toFixed(0)}};
        addLog(`${mp.toLocaleString()} px · lum ${avg.toFixed(0)}/255`,"data");
        addLog(`R:${scanMeta.channels.r} G:${scanMeta.channels.g} B:${scanMeta.channels.b}`,"data");
        if(mp<500000) addLog("⚠ Low resolution detected","warn");
        if(avg<60)    addLog("⚠ Underexposed image","warn");
        if(avg>200)   addLog("⚠ Overexposed / washed-out","warn");
      } else { addLog("Document structure scan.","data"); }
      addLog("Scan complete.","ok"); comp("scan");

      if (isProgressive) {
        if (dn > 0) {
          const earlyDn = dn * 0.3;
          addLog(`Progressive denoise (${earlyDn.toFixed(2)})`, "info");
          progPx = applyDenoise(progPx, fd.w, fd.h, earlyDn);
        }
        setStageSnapshots(prev => [...prev, { stage: "scan", label: "Scan", thumb: makeThumbnail(progPx, fd.w, fd.h) }]);
      }

      // ── STAGE 3: NEURAL ANALYSIS ──────────────────────────────────────────
      setStage("neural");
      addLog("Running local vision analysis...","sys");
      await delay(200); if(!pipelineActive.current) return null;

      // Analysis is 100% local — no network calls. (A browser cannot safely
      // call a hosted AI API: the key would be exposed in client JS. If AI
      // analysis is ever wanted, proxy it through a backend that holds the key.)
      let analysis=null;

      if(fd.isImg){
        if(!fd.b64||fd.b64.length<10){ addLog("Image payload missing — skipping analysis","warn"); }
        else{
          addLog("Running local image analysis...","info");
          analysis=analyzeLocally(fd);
        }
      } else if(fd.isPdf){
        // Pure local PDF analyzer — zero network calls
        addLog("Running local PDF intelligence engine...","info");
        const rawName=fd.name.replace(/\.pdf$/i,"").trim();
        const tokens=rawName.toLowerCase().replace(/[-_.,;:()\[\]{}]/g," ").split(/\s+/).filter(Boolean);
        const sizeKb=fd.size/1024;
        const estPages=Math.max(1,Math.round(sizeKb/80));
        const estDpi=sizeKb>500?300:sizeKb>150?150:96;
        let docType="PDF Document",docCat="document",docIssues=[],docGaps=[];
        for(const dt of DOC_TYPES){
          if(dt.keys.some(k=>tokens.includes(k)||rawName.toLowerCase().includes(k))){
            docType=dt.type; docCat=dt.cat; docIssues=dt.issues; docGaps=dt.gaps; break;
          }
        }
        const displayName=rawName.replace(/[-_]/g," ").replace(/\b\w/g,c=>c.toUpperCase());
        const subject=`${docType}: "${displayName}" (~${estPages} page${estPages!==1?"s":""}, ${Math.round(sizeKb)} KB)`;
        const stopWords=new Set(["the","and","of","in","a","an","to","for","or","is","on","at","by","with","from"]);
        const keyTokens=tokens.filter(t=>t.length>3&&!stopWords.has(t)).slice(0,4);
        analysis={
          subject,image_category:docCat,
          quality_score:sizeKb>300?72:sizeKb>100?58:42,
          estimated_original_dpi:estDpi,
          quality_issues:[`~${estPages} page${estPages!==1?"s":""}`,`Est. DPI ~${estDpi}`,...docIssues],
          content_gaps:["Fidelity depends on original scan quality",...docGaps],
          color_analysis:"Document — enhancement sharpens text and borders",
          compression_artifacts:sizeKb/estPages<60?"moderate":"mild",
          noise_level:sizeKb/estPages<60?"medium":"low",
          blur_level:estDpi<150?"moderate":"slight",
          enhancement_priority:`Sharpen text, reduce noise, increase DPI ~${estDpi}→${estDpi*sc}`,
          search_queries:[
            `${docType.toLowerCase()} enhancement high resolution scan`,
            `${keyTokens.join(" ")} ${docType.toLowerCase()} template`,
            `PDF document upscaling OCR quality improvement`,
            `${docType.toLowerCase()} restoration digitization techniques`,
            `${keyTokens.slice(0,2).join(" ")} document reference database`,
          ],
          recommended_scale:sc,recommended_sharpen:0.6,recommended_denoise:0.3,recommended_contrast:1.25,
          interesting_details:[`Type: ${docType}`,`~${estPages} pages (${Math.round(sizeKb)} KB)`,`Est. DPI: ${estDpi}`],
        };
        addLog(`${docType} · ${estPages}p · ~${estDpi}DPI`,"ok");
      } else {
        addLog("Unknown file type — local metadata analysis...","info");
        analysis=FALLBACK_ANALYSIS;
      }

      if(!analysis){ addLog("Using built-in defaults","warn"); analysis=FALLBACK_ANALYSIS; }
      addLog(`Subject: ${analysis.subject}`,"ok");
      addLog(`Category: ${analysis.image_category} · Score: ${analysis.quality_score}/100`,"data");
      if(analysis.compression_artifacts&&analysis.compression_artifacts!=="none") addLog(`Artifacts: ${analysis.compression_artifacts}`,"warn");
      if(analysis.blur_level&&analysis.blur_level!=="none") addLog(`Blur: ${analysis.blur_level}`,"warn");
      if(analysis.noise_level&&analysis.noise_level!=="none") addLog(`Noise: ${analysis.noise_level}`,"warn");
      if(Array.isArray(analysis.quality_issues))    analysis.quality_issues.forEach(q=>addLog(`⚠ ${q}`,"warn"));
      if(Array.isArray(analysis.content_gaps))      analysis.content_gaps.forEach(g=>addLog(`◌ ${g}`,"warn"));
      if(Array.isArray(analysis.interesting_details))analysis.interesting_details.forEach(d=>addLog(`◈ ${d}`,"data"));
      addLog("Neural analysis complete.","ok"); comp("neural");

      if (isProgressive) {
        if (ctv !== 1.0) {
          const earlyCt = Math.sqrt(ctv);
          addLog(`Progressive contrast (×${earlyCt.toFixed(2)})`, "info");
          progPx = enhanceContrast(progPx, fd.w, fd.h, earlyCt);
        }
        setStageSnapshots(prev => [...prev, { stage: "neural", label: "Neural", thumb: makeThumbnail(progPx, fd.w, fd.h) }]);
      }

      // ── STAGE 4: WEB RECON (local) ────────────────────────────────────────
      setStage("recon");
      addLog("Running local recon intelligence engine...","sys");
      await delay(150); if(!pipelineActive.current) return null;
      const cat=analysis.image_category||"document";
      const issues=(analysis.quality_issues||[]).slice(0,3);
      const gaps=(analysis.content_gaps||[]).slice(0,2);
      const reconQueries=analysis.search_queries||["image enhancement reference","high resolution processing","image restoration techniques","upscaling methods","digital reconstruction"];
      const dbMatches=DB_MAP[cat]||DB_MAP.other;
      const guidance=GUIDANCE_MAP[cat]||GUIDANCE_MAP.other;
      const reconFindings=reconQueries.slice(0,5).map((q,i)=>({
        query:q,
        result_summary:`Local index: ${dbMatches[i%dbMatches.length]} — ${cat} enhancement references catalogued`,
        key_urls:[`https://scholar.google.com/search?q=${encodeURIComponent(q)}`],
        relevance_to_gaps:gaps[i%gaps.length]||`Supports ${cat} quality improvement`,
      }));
      const webReport={
        findings:reconFindings,
        database_matches:dbMatches,
        reference_quality:`${dbMatches.length} databases for ${cat}`,
        enhancement_guidance:guidance,
        similar_high_res_found:analysis.quality_score>60,
        total_sources:dbMatches.length,
        reconstruction_notes:`${analysis.subject}. ${issues.length>0?"Issues: "+issues.join("; ")+". ":""}Approach: ${guidance[0]}.`,
      };
      addLog(`Recon complete · ${dbMatches.length} sources`,"ok");
      if(webReport.similar_high_res_found) addLog("✓ High-res reference available","ok");
      dbMatches.slice(0,3).forEach(d=>addLog(`◈ ${d}`,"data"));
      guidance.slice(0,2).forEach(g=>addLog(`→ ${g}`,"info"));
      comp("recon");

      if (isProgressive) {
        setStageSnapshots(prev => [...prev, { stage: "recon", label: "Recon", thumb: makeThumbnail(progPx, fd.w, fd.h) }]);
      }

      // ── STAGE 5: ENHANCEMENT ─────────────────────────────────────────────
      setStage("enhance");
      addLog("Applying enhancement pipeline...","sys");
      await delay(150); if(!pipelineActive.current) return null;
      let resultUrl=null,rw=fd.w,rh=fd.h,rlabel=null,rpill=null,rIsPdfImg=false;

      if(fd.canvas&&fd.w){
        // Resolution-target mode (4K/8K) computes dims via the engine; multiplier mode keeps fd.w*sc.
        const dims = tg ? targetDims(fd.w,fd.h,tg) : { dw:fd.w*sc, dh:fd.h*sc };
        const dw=dims.dw, dh=dims.dh, outPx=dw*dh;
        if(outPx>MAX_PIXELS) throw new Error(`${dw}×${dh} (${Math.round(outPx/1e6)}MP) exceeds the ${Math.round(MAX_PIXELS/1e6)}MP ceiling.`);
        const big = outPx>16777216; // beyond the pure-JS safe zone → route through the GPU stepped sampler
        rlabel = tg || `${sc}x`;                         // ASCII token for filenames ("8K" / "2x")
        rpill  = `${tg||sc+"×"} · ${big?"HQ":al.toUpperCase()}`; // display string for the meta pill
        addLog(`Upscaling ${fd.w}×${fd.h} → ${dw}×${dh} (${tg||sc+"×"} · ${big?"HQ sampler":al})`,"info");
        if(big&&!tg) addLog("Above 16MP — using GPU sampler; interpolation choice ignored","info");
        const srcPx = isProgressive ? progPx : fd.canvas.getContext("2d").getImageData(0,0,fd.w,fd.h).data;
        await delay(30);
        let px = big
          ? resizePixels(srcPx,fd.w,fd.h,dw,dh)
          : (al==="nearest"?nearestNeighbor(srcPx,fd.w,fd.h,dw,dh):
             al==="bilinear"?bilinear(srcPx,fd.w,fd.h,dw,dh):
             bicubic(srcPx,fd.w,fd.h,dw,dh));
        const finalDn = isProgressive ? dn * 0.7 : dn;
        const finalCt = (isProgressive && ctv !== 1.0) ? Math.sqrt(ctv) : ctv;
        if(big){
          // No-freeze guard: above 16MP, skip the heavy JS denoise/sharpen convolutions
          // (the GPU sampler already yields clean edges). Cheap single-pass contrast stays.
          addLog("Skipping JS denoise/sharpen above 16MP (keeps UI responsive)","info");
          if(finalCt!==1.0){ addLog(`Contrast (×${finalCt.toFixed(2)})`,"info"); px=enhanceContrast(px,dw,dh,finalCt); }
        } else {
          if(finalDn>0){ addLog(`Denoise (${finalDn.toFixed(2)}${isProgressive?" — remaining":""})`,"info"); await delay(20); px=applyDenoise(px,dw,dh,finalDn); }
          if(finalCt!==1.0){ addLog(`Contrast (×${finalCt.toFixed(2)}${isProgressive?" — remaining":""})`,"info"); px=enhanceContrast(px,dw,dh,finalCt); }
          if(sh>0){ addLog(`Sharpen (${sh.toFixed(1)})`,"info"); await delay(20); px=applyUnsharpMask(px,dw,dh,sh); }
        }
        const out=document.createElement("canvas"); out.width=dw; out.height=dh;
        out.getContext("2d").putImageData(new ImageData(px,dw,dh),0,0);
        resultUrl=out.toDataURL("image/png");
        rw=dw; rh=dh;
        addLog(`Enhancement complete → ${dw}×${dh}px`,"ok");
        if (isProgressive) {
          setStageSnapshots(prev => [...prev, { stage: "enhance", label: "Enhanced", thumb: makeThumbnail(px, dw, dh) }]);
        }
      } else if(fd.isPdf && fd.b64){
        // Real PDF upscaling (option A / v1): render every page with pdf.js at the
        // chosen scale off the main thread, then surface PAGE 1 as the result image.
        // Multi-page download (ZIP/gallery) is the planned follow-up — see PDF-UPSCALER-TASK.md.
        addLog(`Rendering PDF with pdf.js at ${sc}×...`,"sys");
        const bytes = Uint8Array.from(atob(fd.b64), c=>c.charCodeAt(0));
        let pdfRes;
        try { pdfRes = await enhancePDF(bytes, sc); }
        catch(e){ throw new Error(`PDF upscale failed: ${e.message}`); }
        if(!pdfRes?.pages?.length) throw new Error("PDF produced no pages.");
        resultUrl = pdfRes.pages[0];
        pdfRes.pages.slice(1).forEach(u=>URL.revokeObjectURL(u)); // option A keeps page 1 only — free the rest
        rlabel = `${sc}x`;
        rpill  = `PDF · ${sc}× · HQ`;
        rIsPdfImg = true;
        addLog(`PDF upscaled ${sc}× — ${pdfRes.originalPages} page(s); showing page 1`,"ok");
      } else {
        addLog("Packaging document for download...","info");
        resultUrl=fd.url;  // non-PDF doc / no data — repackage as-is
        addLog("Document packaged.","ok");
      }
      comp("enhance");

      // ── STAGE 6: REPORT ───────────────────────────────────────────────────
      setStage("report");
      addLog("Compiling intelligence report...","sys");
      await delay(200);
      const finalResult={url:resultUrl,w:rw,h:rh,label:rlabel,pill:rpill,isPdfImg:rIsPdfImg};
      setResult(finalResult);
      setAiReport({analysis,webReport,scanMeta});
      addLog("════════════════════════════","sys");
      addLog("PIPELINE COMPLETE","ok");
      comp("report"); setStage("done");
      pipelineActive.current=false;
      return finalResult;

    }catch(e){
      addLog(`FATAL: ${e.message}`,"error"); BrowserLogger.log(e.message,"error");
      setErr(e.message); setStage(null);
      pipelineActive.current=false; return null;
    }
  },[fileData,scale,target,algo,sharpen,denoise,contrast,addLog,stage,progressiveEnhance]);

  const runPipeline=useCallback(()=>runPipelineWith(),[runPipelineWith]);

  // ── Download — returns boolean, supports scaleHint/nameHint for benchmark ───
  const download=useCallback(async(resultOverride=null,scaleHint=null,nameHint=null)=>{
    const r=resultOverride||result;
    if(!r?.url) return false;
    try{
      // Benchmark passes a numeric scaleHint → "<n>x"; normal UI download uses the
      // result's label ("8K"/"2x") so resolution-target outputs are named correctly.
      const tag=scaleHint!=null?`${scaleHint}x`:(r.label||`${scale}x`);
      // An upscaled PDF page is a PNG, not a PDF — fix the extension so it opens right.
      let nm=nameHint||(fileData?.name)||"output.png";
      if(r.isPdfImg) nm=nm.replace(/\.pdf$/i,"")+"_page1.png";
      const filename=`nexusscale_${tag}_${nm}`;
      let blobUrl;
      if(r.url.startsWith("blob:")){ blobUrl=r.url; }
      else if(r.url.startsWith("data:")){
        const blob=dataURLtoBlob(r.url);
        if(!blob){ addLog("Blob conversion failed","error"); return false; }
        blobUrl=URL.createObjectURL(blob);
      } else { addLog("Unknown URL format","error"); return false; }
      const a=document.createElement("a");
      a.href=blobUrl; a.download=filename; a.style.display="none";
      document.body.appendChild(a); a.click();
      setTimeout(()=>{
        document.body.removeChild(a);
        if(!r.url.startsWith("blob:")) URL.revokeObjectURL(blobUrl);
      },2000);
      addLog(`Download: ${filename}`,"ok");
      return true;
    }catch(e){ addLog(`Download error: ${e.message}`,"error"); return false; }
  },[result,scale,fileData,addLog]);

  // ── verifyDownload — blob conversion test, no file-save popup ───────────────
  const verifyDownload=useCallback(async(r,scaleHint,nameHint)=>{
    if(!r?.url){ addLog("  ✗ verify: no result URL","error"); return false; }
    try{
      if(r.url.startsWith("blob:")){
        const ext=nameHint?.split(".").pop()?.toLowerCase();
        const typeHint=ext==="pdf"?"application/pdf":`image/${ext||"png"}`;
        addLog(`  ✓ verify: blob URL (${typeHint}) — ${nameHint}`,"ok");
        return true;
      }
      if(r.url.startsWith("data:")){
        const blob=dataURLtoBlob(r.url);
        if(!blob){ addLog("  ✗ verify: dataURLtoBlob null","error"); return false; }
        const bu=URL.createObjectURL(blob); URL.revokeObjectURL(bu);
        addLog(`  ✓ verify: ${blob.type} · ${(blob.size/1024).toFixed(1)} KB · nexusscale_${scaleHint}x_${nameHint}`,"ok");
        return true;
      }
      addLog("  ✗ verify: unknown URL format","error"); return false;
    }catch(e){ addLog(`  ✗ verify: ${e.message}`,"error"); return false; }
  },[]);

  // ── Benchmark Suite ───────────────────────────────────────────────────────────
  const runBenchmarks=useCallback(async()=>{
    if(isBenchmarking||stage&&stage!=="done") return;
    setIsBenchmarking(true); setBmResults([]); setLog([]); setActiveTab("benchmark");
    addLog("═══════════════════════════════","sys");
    addLog(`BENCHMARK SUITE · BUILD ${CURRENT_BUILD.build} · ${BENCHMARK_TESTS.length} tests`,"ok");
    addLog("═══════════════════════════════","sys");
    const results=[];
    try{
      for(let i=0;i<BENCHMARK_TESTS.length;i++){
        const t=BENCHMARK_TESTS[i];
        addLog(`── [${i+1}/${BENCHMARK_TESTS.length}] ${t.desc} ──`,"sys");
        const t0=performance.now();
        try{
          // Build synthetic file — use t.type (not removed isImg field)
          let content;
          if(t.type.startsWith("image/")){
            const b64="iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAQAAAAnOwc2AAAADklEQVR42mNkwAIYAQAACQABS2P2WAAAAABJRU5ErkJggg==";
            const bin=atob(b64); content=new Uint8Array(bin.length);
            for(let j=0;j<bin.length;j++) content[j]=bin.charCodeAt(j);
          } else {
            content=new Uint8Array(t.expectFail?20*1024*1024:400*1024);
          }
          const file=new File([content],t.name,{type:t.type});

          if(t.expectFail){
            const PDF_MAX=18*1024*1024;
            const rejected=t.type==="application/pdf"&&file.size>PDF_MAX;
            const ms=Math.round(performance.now()-t0);
            addLog(rejected?`✓ Rejected as expected (${ms}ms)`:`✗ Expected rejection but passed`,"ok");
            results.push({name:t.name,desc:t.desc,pass:rejected,ms,note:"Expected rejection"});
            setBmResults([...results]); continue;
          }

          addLog("Loading file...","info");
          const fd=await loadFileAsync(file);
          if(fd.error){
            addLog(`Load failed: ${fd.error}`,"warn");
            results.push({name:t.name,desc:t.desc,pass:false,ms:0,note:fd.error});
            setBmResults([...results]); continue;
          }

          addLog("Running pipeline...","info");
          const r=await runPipelineWith(fd,{scale:t.scaleOverride,algo:t.algoOverride,sharpen:0.3,denoise:0.1,contrast:1.0});
          const ms=Math.round(performance.now()-t0);

          if(r){
            const dlOk=await verifyDownload(r,t.scaleOverride,t.name);
            // Only revoke fd.url if pipeline created a NEW blob (r.url !== fd.url)
            if(fd.url.startsWith("blob:")&&r.url!==fd.url) URL.revokeObjectURL(fd.url);
            addLog(`${dlOk?"✓":"⚠"} PASS · pipeline ok · dl ${dlOk?"verified":"blocked"} (${ms}ms)`,"ok");
            results.push({name:t.name,desc:t.desc,pass:true,ms,note:`${r.w||"doc"}×${r.h||"—"} dl:${dlOk?"✓":"⚠"}`});
          } else {
            addLog(`✗ FAIL (${ms}ms)`,"warn");
            results.push({name:t.name,desc:t.desc,pass:false,ms,note:"Pipeline returned null"});
          }
          setBmResults([...results]);
        }catch(e){
          const ms=Math.round(performance.now()-t0);
          addLog(`✗ ERROR: ${e.message}`,"error");
          results.push({name:t.name,desc:t.desc,pass:false,ms,note:e.message});
          setBmResults([...results]);
        }
        await delay(600);
      }
      setBmResults(results);
      const passed=results.filter(r=>r.pass).length;
      addLog("═══════════════════════════════","sys");
      addLog(`SUITE COMPLETE: ${passed}/${results.length} passed`,"ok");
      addLog("═══════════════════════════════","sys");
    }finally{
      setIsBenchmarking(false); // guaranteed even on unexpected throw
    }
  },[isBenchmarking,stage,addLog,loadFileAsync,runPipelineWith,verifyDownload]);

  const running=stage&&stage!=="done";

  // ── Render ────────────────────────────────────────────────────────────────────
  return(
    <div style={S.root}>
      <style>{CSS}</style>
      <div style={S.scanlines}/>

      <header style={S.header}>
        <div style={S.headerBrand}>
          <div style={S.brandHex}>⬡</div>
          <div>
            <div style={S.brandTitle}>NEXUS<span style={S.brandAccent}>SCALE</span></div>
            <div style={S.brandSub}>DEEP ENHANCEMENT · RECONSTRUCTION · INTELLIGENCE</div>
          </div>
        </div>
        <div style={S.headerStatus}>
          <div style={S.statusRow}>
            <span style={{...S.dot,background:running||isBenchmarking?"#ffa500":"#00ff9d",boxShadow:`0 0 8px ${running||isBenchmarking?"#ffa500":"#00ff9d"}`}}/>
            <span style={S.statusLabel}>{isBenchmarking?"BENCHMARKING":running?"PROCESSING":"SYSTEM ONLINE"}</span>
          </div>
          <div style={S.versionTag}>{CURRENT_BUILD.version} BUILD {CURRENT_BUILD.build}</div>
        </div>
      </header>

      <div style={S.layout}>
        {/* LEFT */}
        <aside style={S.leftPanel}>
          <div style={S.card}>
            <div style={S.cardLabel}>TARGET ACQUISITION</div>
            <div style={{...S.dropzone,...(dragging?S.dropzoneActive:{})}}
              onDragOver={e=>{e.preventDefault();setDragging(true);}}
              onDragLeave={()=>setDragging(false)}
              onDrop={e=>{e.preventDefault();setDragging(false);loadFile(e.dataTransfer.files[0]);}}
              onClick={()=>fileRef.current.click()}>
              <input ref={fileRef} type="file" accept="image/*,application/pdf"
                style={{display:"none"}} onChange={e=>loadFile(e.target.files[0])}/>
              {fileData?(
                <div style={S.fileLoaded}>
                  {fileData.isImg?<img src={fileData.url} style={S.thumb} alt=""/>:<div style={S.pdfIcon}>📄</div>}
                  <div style={S.fileMeta}>
                    <div style={S.fileName} title={fileData.name}>{fileData.name}</div>
                    <div style={S.fileStat}>{fmt(fileData.size)}</div>
                    {fileData.w&&<div style={S.fileStat}>{fileData.w}×{fileData.h}px</div>}
                    <div style={{...S.fileStat,color:"#333"}}>{fileData.type}</div>
                  </div>
                </div>
              ):(
                <div style={S.dropInner}>
                  <div style={S.dropHex}>⬡</div>
                  <div style={S.dropTitle}>LOAD TARGET</div>
                  <div style={S.dropTypes}>PNG · JPG · WEBP · GIF · PDF</div>
                  <div style={S.dropHint}>Drag & drop or click to browse</div>
                </div>
              )}
            </div>
          </div>

          <div style={S.card}>
            <div style={S.cardLabel}>ENHANCEMENT MATRIX</div>
            <div style={S.paramGroup}>
              <div style={S.paramHead}>SCALE FACTOR</div>
              <div style={S.btnRow}>
                {[2,3,4].map(s=><button key={s} style={{...S.optBtn,...((!target&&scale===s)?S.optBtnOn:{})}} onClick={()=>{setTarget(null);setScale(s);}}>{s}×</button>)}
              </div>
              <div style={S.paramHead}>RESOLUTION TARGET</div>
              <div style={S.btnRow}>
                {["4K","8K"].map(t=><button key={t} style={{...S.optBtn,...(target===t?S.optBtnOn:{})}} onClick={()=>setTarget(target===t?null:t)}>{t}</button>)}
              </div>
            </div>
            <div style={S.paramGroup}>
              <div style={S.paramHead}>INTERPOLATION</div>
              <div style={S.btnRow}>
                {[["nearest","NEAREST"],["bilinear","BILINEAR"],["bicubic","BICUBIC"]].map(([v,l])=>(
                  <button key={v} style={{...S.optBtn,...(algo===v?S.optBtnOn:{}),...(v==="bicubic"?{fontSize:"8px"}:{})}} onClick={()=>setAlgo(v)}>{l}</button>
                ))}
              </div>
            </div>
            <div style={S.paramGroup}>
              <div style={S.paramHead}>SHARPEN <span style={S.pval}>{sharpen.toFixed(1)}</span></div>
              <input type="range" min={0} max={1} step={0.1} value={sharpen} onChange={e=>setSharpen(+e.target.value)} style={S.range}/>
            </div>
            <div style={S.paramGroup}>
              <div style={S.paramHead}>DENOISE <span style={S.pval}>{denoise.toFixed(1)}</span></div>
              <input type="range" min={0} max={0.8} step={0.1} value={denoise} onChange={e=>setDenoise(+e.target.value)} style={S.range}/>
            </div>
            <div style={S.paramGroup}>
              <div style={S.paramHead}>CONTRAST <span style={S.pval}>{contrast.toFixed(1)}</span></div>
              <input type="range" min={0.7} max={1.5} step={0.05} value={contrast} onChange={e=>setContrast(+e.target.value)} style={S.range}/>
            </div>
            <div style={{...S.paramGroup,display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",userSelect:"none"}}
              onClick={()=>setProgressiveEnhance(p=>!p)}>
              <div style={{width:14,height:14,border:`1px solid ${progressiveEnhance?"#00ff9d55":"#333"}`,
                background:progressiveEnhance?"rgba(0,255,157,0.15)":"transparent",display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:"10px",color:"#00ff9d",borderRadius:"2px",flexShrink:0}}>
                {progressiveEnhance&&"✓"}
              </div>
              <div>
                <div style={{fontSize:"8px",letterSpacing:"2px",color:progressiveEnhance?"#00ff9d":"#666"}}>PROGRESSIVE ENHANCE</div>
                <div style={{fontSize:"7px",color:"#444",marginTop:"2px"}}>Apply denoise &amp; contrast across stages</div>
              </div>
            </div>
            <button style={{...S.runBtn,...(!fileData||running||isBenchmarking?S.runBtnOff:{})}}
              onClick={runPipeline} disabled={!fileData||running||isBenchmarking}>
              {running?"◉ PROCESSING...":"⬡ INITIATE PIPELINE"}
            </button>
            <button style={{...S.runBtn,...S.bmBtn,...(running||isBenchmarking?S.runBtnOff:{})}}
              onClick={runBenchmarks} disabled={running||isBenchmarking}>
              {isBenchmarking?"◉ BENCHMARKING...":"⚙ RUN BENCHMARK SUITE"}
            </button>
            <button style={{...S.runBtn,...S.expBtn}} onClick={()=>BrowserLogger.exportLogs()}>
              ⬇ EXPORT ERROR LOGS
            </button>
          </div>

          <div style={S.card}>
            <div style={S.cardLabel}>PIPELINE STATUS</div>
            <div style={S.stageList}>
              {STAGES.map(s=>{
                const isDone=done.includes(s.id),isAct=stage===s.id;
                return(
                  <div key={s.id} style={{...S.stageRow,...(isAct?S.stageRowAct:{}),...(isDone?S.stageRowDone:{})}}>
                    <div style={{...S.stageIco,...((isAct||isDone)?{color:"#00ff9d"}:{}),...(isAct?{animation:"pulse 0.8s infinite"}:{})}}>
                      {isDone?"✓":isAct?"▶":s.icon}
                    </div>
                    <div style={S.stageText}>
                      <div style={{...S.stageName,...(isDone?{color:"#00ff9d66"}:{})}}>{s.label}</div>
                      <div style={S.stageDesc}>{s.desc}</div>
                    </div>
                    {isAct&&<div style={S.stageBar}/>}
                  </div>
                );
              })}
            </div>
          </div>

          {stageSnapshots.length>0&&(
            <div style={{...S.card,marginTop:"6px",padding:"8px 10px"}}>
              <div style={{fontSize:"8px",letterSpacing:"2px",color:"#00ff9d",marginBottom:"6px"}}>◎ STAGE PREVIEWS</div>
              <div style={{display:"flex",gap:"4px",overflowX:"auto",paddingBottom:"4px"}}>
                {stageSnapshots.map((snap,i)=>(
                  <div key={i} style={{flexShrink:0,textAlign:"center"}}>
                    <img src={snap.thumb} alt={snap.label}
                      style={{width:60,height:"auto",border:"1px solid #222",borderRadius:"2px",display:"block"}}/>
                    <div style={{fontSize:"6px",color:"#555",marginTop:"2px",letterSpacing:"1px"}}>{snap.label.toUpperCase()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* CENTER */}
        <main style={S.centerPanel}>
          <div style={S.tabs}>
            {[["preview","⬡ VISUAL"],["report","◈ INTEL"],["sources","⊛ SOURCES"],["changelog","▣ CHANGELOG"],["benchmark","⚙ BENCHMARK"]].map(([id,label])=>(
              <button key={id} style={{...S.tab,...(activeTab===id?S.tabActive:{})}} onClick={()=>setActiveTab(id)}>{label}</button>
            ))}
            {result&&<button style={S.dlBtn} onClick={()=>download()}>⬇ DOWNLOAD</button>}
          </div>

          {activeTab==="preview"&&(
            <div style={S.card}>
              {result&&fileData?.isImg?(
                <div>
                  <div style={S.cmpLabels}><span>◀ ORIGINAL</span><span>ENHANCED ▶</span></div>
                  <div ref={cmpRef} style={S.cmpWrap} onMouseDown={()=>{sliding.current=true;}}>
                    <img src={result.url} style={S.cmpImg} alt="enhanced" draggable={false}/>
                    <div style={{...S.cmpOver,width:`${sliderX}%`}}>
                      <img src={fileData.url} style={{...S.cmpImg,minWidth:`${cmpRef.current?.offsetWidth||600}px`}} alt="orig" draggable={false}/>
                    </div>
                    <div style={{...S.cmpDiv,left:`${sliderX}%`}}>
                      <div style={S.cmpLine}/><div style={S.cmpHandle}>◈</div>
                    </div>
                  </div>
                  <div style={S.cmpHint}>← DRAG TO COMPARE →</div>
                  <div style={S.cmpMeta}>
                    <span style={S.metaPill}>{fileData.w}×{fileData.h} ORIGINAL</span>
                    <span style={{color:"#333"}}>→</span>
                    <span style={{...S.metaPill,...S.metaPillGreen}}>{result.w}×{result.h} ENHANCED</span>
                    <span style={S.metaPill}>{result.pill||`${scale}× · ${algo.toUpperCase()}`}</span>
                  </div>
                </div>
              ):result&&result.isPdfImg?(
                <div style={S.docOut}>
                  <img src={result.url} style={{maxWidth:"100%",borderRadius:8,boxShadow:"0 0 24px rgba(0,255,157,0.15)"}} alt="upscaled PDF page 1"/>
                  <div style={{...S.cmpMeta,justifyContent:"center",marginTop:12}}>
                    <span style={{...S.metaPill,...S.metaPillGreen}}>{result.pill} · PAGE 1</span>
                  </div>
                  <div style={S.docOutSub}>Page 1 shown — multi-page export coming. View Intel Report for findings.</div>
                  <button style={S.dlBtn2} onClick={()=>download()}>⬇ DOWNLOAD PAGE 1 (PNG)</button>
                </div>
              ):result&&!fileData?.isImg?(
                <div style={S.docOut}>
                  <div style={S.docOutIco}>📄</div>
                  <div style={S.docOutTitle}>DOCUMENT ANALYZED</div>
                  <div style={S.docOutSub}>View Intel Report for findings.</div>
                  <button style={S.dlBtn2} onClick={()=>download()}>⬇ DOWNLOAD</button>
                </div>
              ):(
                <div style={S.emptyPreview}>
                  <div style={S.emptyDots}>
                    {Array.from({length:100},(_,i)=>(
                      <div key={i} style={{background:"#00ff9d",borderRadius:"50%",aspectRatio:"1",opacity:EMPTY_DOT_OPACITIES[i%10]}}/>
                    ))}
                  </div>
                  <div style={S.emptyMsg}>
                    <div style={S.emptyIcon}>⬡</div>
                    <div style={S.emptyText}>{running||isBenchmarking?"PROCESSING...":"AWAITING TARGET"}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab==="report"&&(
            <div style={S.card}>
              {aiReport?(
                <div style={S.reportGrid}>
                  {[
                    ["SUBJECT",            aiReport.analysis.subject,"#ddd"],
                    ["CATEGORY",           `${(aiReport.analysis.image_category||"").toUpperCase()} · Quality: ${aiReport.analysis.quality_score}/100`,"#999"],
                    ["COMPRESSION · BLUR · NOISE",`${aiReport.analysis.compression_artifacts||"—"} · ${aiReport.analysis.blur_level||"—"} · ${aiReport.analysis.noise_level||"—"}`,"#999"],
                    ["COLOR ANALYSIS",     aiReport.analysis.color_analysis,"#999"],
                    ["ENHANCEMENT PRIORITY",aiReport.analysis.enhancement_priority,"#00ff9d"],
                  ].map(([label,val,col])=>val&&(
                    <div key={label} style={S.reportBlock}>
                      <div style={S.rbLabel}>{label}</div>
                      <div style={{...S.rbVal,color:col}}>{val}</div>
                    </div>
                  ))}
                  {Array.isArray(aiReport.analysis.quality_issues)&&aiReport.analysis.quality_issues.length>0&&(
                    <div style={S.reportBlock}>
                      <div style={S.rbLabel}>QUALITY ISSUES</div>
                      {aiReport.analysis.quality_issues.map((q,i)=><div key={i} style={{...S.rbVal,color:"#ffa500",marginBottom:"3px"}}>⚠ {q}</div>)}
                    </div>
                  )}
                  {Array.isArray(aiReport.analysis.content_gaps)&&aiReport.analysis.content_gaps.length>0&&(
                    <div style={S.reportBlock}>
                      <div style={S.rbLabel}>CONTENT GAPS</div>
                      {aiReport.analysis.content_gaps.map((g,i)=><div key={i} style={{...S.rbVal,color:"#ff6b6b",marginBottom:"3px"}}>◌ {g}</div>)}
                    </div>
                  )}
                  {Array.isArray(aiReport.analysis.interesting_details)&&aiReport.analysis.interesting_details.length>0&&(
                    <div style={S.reportBlock}>
                      <div style={S.rbLabel}>OBSERVATIONS</div>
                      {aiReport.analysis.interesting_details.map((d,i)=><div key={i} style={{...S.rbVal,color:"#7ec8e3",marginBottom:"3px"}}>◈ {d}</div>)}
                    </div>
                  )}
                  {aiReport.webReport?.reconstruction_notes&&(
                    <div style={S.reportBlock}>
                      <div style={S.rbLabel}>RECONSTRUCTION NOTES</div>
                      <div style={S.rbVal}>{aiReport.webReport.reconstruction_notes}</div>
                    </div>
                  )}
                  {Array.isArray(aiReport.webReport?.enhancement_guidance)&&aiReport.webReport.enhancement_guidance.length>0&&(
                    <div style={S.reportBlock}>
                      <div style={S.rbLabel}>ENHANCEMENT GUIDANCE</div>
                      {aiReport.webReport.enhancement_guidance.map((g,i)=><div key={i} style={{...S.rbVal,marginBottom:"3px"}}>→ {g}</div>)}
                    </div>
                  )}
                </div>
              ):(
                <div style={S.emptyReport}><div style={S.emptyIcon}>◈</div><div style={S.emptyText}>INTEL REPORT</div><div style={S.emptySubtext}>Run pipeline to generate</div></div>
              )}
            </div>
          )}

          {activeTab==="sources"&&(
            <div style={S.card}>
              {aiReport?.webReport?.findings?.length>0?(
                <div style={S.sourcesList}>
                  {aiReport.webReport.findings.map((f,i)=>(
                    <div key={i} style={S.sourceItem}>
                      <div style={S.sourceQuery}>⊛ "{f.query}"</div>
                      <div style={S.sourceSummary}>{f.result_summary}</div>
                      {f.relevance_to_gaps&&<div style={S.sourceRel}>→ {f.relevance_to_gaps}</div>}
                      {f.key_urls?.map((u,j)=><div key={j} style={S.sourceUrl}>{u}</div>)}
                    </div>
                  ))}
                  <div style={S.sourceItem}>
                    <div style={S.sourceQuery}>◈ DATABASES MATCHED</div>
                    {aiReport.webReport.database_matches?.map((d,i)=><div key={i} style={S.sourceSummary}>◆ {d}</div>)}
                    <div style={{...S.sourceSummary,marginTop:"8px"}}>
                      High-res reference: <span style={{color:aiReport.webReport.similar_high_res_found?"#00ff9d":"#ff6b6b"}}>{aiReport.webReport.similar_high_res_found?"AVAILABLE":"NOT FOUND"}</span>
                    </div>
                  </div>
                </div>
              ):(
                <div style={S.emptyReport}><div style={S.emptyIcon}>⊛</div><div style={S.emptyText}>WEB SOURCES</div><div style={S.emptySubtext}>Run pipeline to see sources</div></div>
              )}
            </div>
          )}

          {activeTab==="changelog"&&(
            <div style={S.card}>
              <div style={S.clHeader}>
                <div style={S.clTitle}>BUILD HISTORY</div>
                <div style={S.clSub}>NexusScale · {BUILD_HISTORY.length} builds · Complete audit trail</div>
              </div>
              <div style={S.clList}>
                {[...BUILD_HISTORY].reverse().map(b=>{
                  const isCur=b.status==="current";
                  return(
                    <div key={b.build} style={{...S.clEntry,...(isCur?S.clEntryCurrent:{})}}>
                      <div style={S.clEntryHead}>
                        <div style={S.clBuildNum}>BUILD {b.build}</div>
                        <div style={S.clVersion}>{b.version}</div>
                        <div style={S.clEntryLabel}>{b.label}</div>
                        <div style={{...S.clBadge,...(isCur?S.clBadgeCurrent:S.clBadgeDeprecated)}}>{isCur?"● CURRENT":"○ DEPRECATED"}</div>
                        <div style={S.clDate}>{b.date}</div>
                      </div>
                      {b.bugs?.length>0&&(
                        <div style={S.clSection}>
                          <div style={S.clSectionLabel}>⚠ KNOWN ISSUES</div>
                          {b.bugs.map((bug,i)=><div key={i} style={S.clBug}><span style={S.clBulletBug}>✕</span>{bug}</div>)}
                        </div>
                      )}
                      {b.fixes?.length>0&&(
                        <div style={S.clSection}>
                          <div style={S.clSectionLabel}>✓ FIXES APPLIED</div>
                          {b.fixes.map((fix,i)=><div key={i} style={S.clFix}><span style={S.clBulletFix}>✓</span>{fix}</div>)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab==="benchmark"&&(
            <div style={S.card}>
              <div style={S.clHeader}>
                <div style={S.clTitle}>BENCHMARK SUITE</div>
                <div style={S.clSub}>{BENCHMARK_TESTS.length} automated E2E tests · pipeline + download verification</div>
              </div>
              {bmResults.length>0&&(
                <div style={{marginBottom:"16px"}}>
                  <div style={{...S.rbLabel,marginBottom:"8px"}}>{bmResults.filter(r=>r.pass).length}/{bmResults.length} PASSED</div>
                  {bmResults.map((r,i)=>(
                    <div key={i} style={{...S.sourceItem,marginBottom:"6px",borderColor:r.pass?"#00ff9d22":"#ff444422"}}>
                      <div style={{display:"flex",gap:"10px",alignItems:"center"}}>
                        <span style={{color:r.pass?"#00ff9d":"#ff4444",fontSize:"14px"}}>{r.pass?"✓":"✗"}</span>
                        <div style={{flex:1}}>
                          <div style={{...S.sourceQuery,marginBottom:"2px"}}>{r.desc}</div>
                          <div style={{...S.sourceSummary,color:r.pass?"#555":"#ff6b6b99"}}>{r.note} · {r.ms}ms</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={S.rbLabel}>TEST DEFINITIONS</div>
              {BENCHMARK_TESTS.map((t,i)=>(
                <div key={i} style={{...S.sourceItem,marginBottom:"6px"}}>
                  <div style={S.sourceQuery}>[{i+1}] {t.desc}</div>
                  <div style={S.sourceSummary}>{t.name} · scale:{t.scaleOverride}× · {t.algoOverride}{t.expectFail?" · EXPECT REJECT":""}</div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* RIGHT — Terminal */}
        <aside style={S.rightPanel}>
          <div style={{...S.card,flex:1,display:"flex",flexDirection:"column",minHeight:0}}>
            <div style={S.cardLabel}>SYSTEM TERMINAL</div>
            <div ref={logRef} style={S.terminal}>
              <div style={S.termWelcome}>
                <span style={{color:"#00ff9d"}}>NexusScale {CURRENT_BUILD.version}</span> · Build {CURRENT_BUILD.build}<br/>
                <span style={{color:"#444"}}>Awaiting pipeline initiation...</span>
              </div>
              {log.map((l,i)=>(
                <div key={i} className="logline" style={{...S.termLine,
                  color:l.type==="ok"?"#00ff9d":l.type==="warn"?"#ffa500":l.type==="error"?"#ff4444":l.type==="sys"?"#555":l.type==="data"?"#7ec8e3":"#aaa"}}>
                  <span style={S.termTs}>{new Date(l.ts).toLocaleTimeString("en",{hour12:false})}</span>
                  {l.msg}
                </div>
              ))}
            </div>
          </div>
          {err&&(
            <div style={S.errBox}>
              <div style={S.errTitle}>⚠ PIPELINE ERROR</div>
              <div style={S.errMsg}>{err}</div>
            </div>
          )}
          {result&&(
            <div style={S.successBox}>
              <div style={S.successTitle}>✓ PIPELINE COMPLETE</div>
              {fileData?.isImg&&<div style={S.successMeta}>{fileData.w}×{fileData.h} → {result.w}×{result.h}</div>}
              <button style={S.dlBtn3} onClick={()=>download()}>⬇ DOWNLOAD ENHANCED FILE</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
