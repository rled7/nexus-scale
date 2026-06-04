// ─── BrowserLogger — error-only sessionStorage ring buffer ────────────────────
export class BrowserLogger {
  static MAX = 50;
  static _buf() { try { return JSON.parse(sessionStorage.getItem("nxs_log") || "[]"); } catch { return []; } }
  static _save(buf) { try { sessionStorage.setItem("nxs_log", JSON.stringify(buf)); } catch {} }
  static log(msg, type = "info") {
    if (type !== "error" && type !== "warn") return; // error-only
    const buf = this._buf(); buf.push({ts: new Date().toISOString(), type, msg});
    if (buf.length > this.MAX) buf.splice(0, buf.length - this.MAX);
    this._save(buf);
  }
  static exportLogs() {
    const blob = new Blob([JSON.stringify(this._buf(), null, 2)], {type: "application/json"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `nexusscale-errors-${Date.now()}.json`; a.style.display = "none";
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 1000);
  }
}
