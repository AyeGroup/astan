export const WIDGET_STYLES = `
.astan-widget, .astan-widget * { box-sizing: border-box; font-family: inherit; }
.astan-launcher {
  position: fixed; inset-inline-end: 20px; inset-block-end: 20px; z-index: 2147483001;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 18px; border: 0; border-radius: 999px; cursor: pointer;
  background: linear-gradient(135deg, #0f2c4d, #1d4e89); color: #fff;
  font: 600 14px/1 inherit; box-shadow: 0 10px 26px rgba(15,44,77,.32);
  transition: transform .15s ease, box-shadow .15s ease;
}
.astan-launcher:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(15,44,77,.4); }
.astan-launcher[hidden] { display: none; }
.astan-launcher-badge {
  position: absolute; inset-block-start: -4px; inset-inline-start: -4px;
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
  background: #f59e0b; color: #1f2937; font: 700 11px/18px inherit; text-align: center;
}
.astan-panel {
  position: fixed; inset-inline-end: 20px; inset-block-end: 20px; z-index: 2147483002;
  width: 360px; max-width: calc(100vw - 32px); max-height: min(640px, calc(100vh - 40px));
  display: flex; flex-direction: column; overflow: hidden;
  background: #fff; color: #12263f; border-radius: 18px;
  box-shadow: 0 24px 60px rgba(15,44,77,.28); border: 1px solid #e3e9f0;
  direction: rtl; text-align: right;
}
.astan-panel[hidden] { display: none; }
.astan-header { padding: 14px 16px; background: linear-gradient(135deg,#0f2c4d,#1d4e89); color:#fff; }
.astan-header-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.astan-title { font: 700 15px/1.4 inherit; display:flex; align-items:center; gap:8px; }
.astan-header-buttons { display:flex; gap:4px; }
.astan-icon-btn {
  background: rgba(255,255,255,.14); border:0; color:#fff; width:28px; height:28px;
  border-radius:8px; cursor:pointer; font-size:15px; line-height:1;
}
.astan-icon-btn:hover { background: rgba(255,255,255,.26); }
.astan-progress { margin-top:10px; font: 400 12px/1.6 inherit; opacity:.95; }
.astan-progress[hidden] { display:none; }
.astan-dots { display:flex; gap:6px; margin-top:6px; }
.astan-dot { width:9px; height:9px; border-radius:50%; background: rgba(255,255,255,.32); }
.astan-dot.is-done { background:#7dd3a0; }
.astan-dot.is-current { background:#ffc566; box-shadow:0 0 0 3px rgba(255,197,102,.28); }
.astan-body { flex:1; overflow-y:auto; padding:14px 16px; background:#f7f9fc; }
.astan-msg { display:flex; margin-bottom:10px; }
.astan-msg-bubble {
  max-width: 88%; padding:10px 13px; border-radius:14px;
  font: 400 13.5px/1.85 inherit; white-space: pre-wrap; word-break: break-word;
}
.astan-msg.assistant .astan-msg-bubble { background:#fff; border:1px solid #e3e9f0; border-start-end-radius:4px; }
.astan-msg.user { justify-content:flex-end; }
.astan-msg.user .astan-msg-bubble { background:#1d4e89; color:#fff; border-start-start-radius:4px; }
.astan-msg.system { justify-content:center; }
.astan-msg.system .astan-msg-bubble {
  background:#fff7e6; border:1px solid #ffe0a3; color:#7a5a12; font-size:12.5px; text-align:center;
}
.astan-typing { display:flex; gap:4px; padding:12px 14px; }
.astan-typing span { width:6px; height:6px; border-radius:50%; background:#9fb3c8; animation: astan-bounce 1.2s infinite; }
.astan-typing span:nth-child(2){ animation-delay:.15s } .astan-typing span:nth-child(3){ animation-delay:.3s }
@keyframes astan-bounce { 0%,60%,100%{transform:translateY(0);opacity:.5} 30%{transform:translateY(-5px);opacity:1} }
.astan-quick { display:flex; flex-wrap:wrap; gap:6px; padding:10px 16px 0; background:#f7f9fc; }
.astan-quick button {
  border:1px solid #cfe0f5; background:#fff; color:#1d4e89; border-radius:999px;
  padding:6px 12px; font:500 12.5px/1.4 inherit; cursor:pointer;
}
.astan-quick button:hover { background:#eef5ff; }
.astan-confirm { margin:8px 16px 0; padding:10px 12px; background:#fff; border:1px solid #ffd28a; border-radius:12px; }
.astan-confirm[hidden]{ display:none }
.astan-confirm p { margin:0 0 8px; font:500 12.5px/1.7 inherit; }
.astan-confirm-actions { display:flex; gap:6px; }
.astan-confirm-actions button { flex:1; border-radius:8px; padding:7px; font:600 12.5px/1 inherit; cursor:pointer; border:0; }
.astan-confirm-yes { background:#1d4e89; color:#fff; }
.astan-confirm-no { background:#eef2f7; color:#41556b; }
.astan-footer { border-top:1px solid #e3e9f0; padding:10px 12px; background:#fff; }
.astan-input-row { display:flex; gap:6px; align-items:flex-end; }
.astan-input {
  flex:1; resize:none; max-height:96px; min-height:38px; padding:9px 12px;
  border:1px solid #d7e0ea; border-radius:12px; font:400 13.5px/1.6 inherit;
  direction:rtl; text-align:right; outline:none;
}
.astan-input:focus { border-color:#1d4e89; box-shadow:0 0 0 3px rgba(29,78,137,.12); }
.astan-send { border:0; background:#1d4e89; color:#fff; width:38px; height:38px; border-radius:12px; cursor:pointer; font-size:16px; }
.astan-send:disabled { opacity:.5; cursor:not-allowed; }
.astan-privacy { margin-top:6px; font:400 10.5px/1.6 inherit; color:#7b8ea3; text-align:center; }
.astan-feedback { display:flex; gap:6px; justify-content:center; margin-top:6px; }
.astan-feedback button { border:1px solid #e3e9f0; background:#fff; border-radius:999px; padding:3px 10px; font-size:12px; cursor:pointer; }
@media (max-width: 480px) {
  .astan-panel { inset-inline: 8px; inset-block-end: 8px; width:auto; max-height: calc(100vh - 16px); }
}`;
