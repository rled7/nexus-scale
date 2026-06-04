// ─── File Utilities ───────────────────────────────────────────────────────────
export function dataURLtoBlob(dataURL) {
  try {
    const [header, b64] = dataURL.split(",");
    const mime = (header.match(/:(.*?);/) || [])[1] || "image/png";
    const bytes = atob(b64); const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], {type: mime});
  } catch { return null; }
}
