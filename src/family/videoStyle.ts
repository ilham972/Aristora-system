// The video player's look (23 Nov 2026, video.tsx): it comes with the player's own file, so the first load carries none
// of it. Black around the picture (any shape fits), the app's violet for what he taps and how far he is; the controls
// fade away while it plays and come back with a tap. Motion: transform and opacity only.

const CSS = `
.f-vp{position:fixed;inset:0;z-index:90;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;touch-action:manipulation;-webkit-user-select:none;user-select:none}
.f-vp-v{width:100%;height:100%;object-fit:contain;background:#000}
.f-vp-top,.f-vp-bot,.f-vp-mid{position:absolute;left:0;right:0;opacity:0;pointer-events:none;transition:opacity .25s ease}
.f-vp.ui .f-vp-top,.f-vp.ui .f-vp-bot,.f-vp.ui .f-vp-mid{opacity:1;pointer-events:auto}
.f-vp-top{top:0;display:flex;align-items:center;gap:8px;padding:calc(env(safe-area-inset-top) + 8px) 10px 26px;background:linear-gradient(180deg,rgba(0,0,0,.62),transparent)}
.f-vp-t{flex:1;min-width:0;margin:0;display:flex;flex-direction:column;gap:2px;font:800 16px/1.2 var(--display);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.f-vp-t small{font:800 11px/1 var(--display);letter-spacing:.08em;color:rgba(255,255,255,.72)}
.f-vp-b{flex:none;width:44px;height:44px;display:grid;place-items:center;border:0;border-radius:22px;background:rgba(255,255,255,.14);color:#fff}
.f-vp-mid{top:50%;margin-top:-36px;display:flex;align-items:center;justify-content:center;gap:34px}
.f-vp-pp{width:72px;height:72px;display:grid;place-items:center;border:0;border-radius:50%;background:var(--brand);color:#fff;box-shadow:0 6px 24px rgba(108,92,231,.5)}
.f-vp-pp:active,.f-vp-s:active,.f-vp-b:active{transform:scale(.93)}
.f-vp-s{width:52px;height:52px;border:0;border-radius:50%;background:rgba(255,255,255,.15);color:#fff;font:800 14px/1 var(--display)}
.f-vp-bot{bottom:0;display:flex;align-items:center;gap:10px;padding:26px 12px calc(env(safe-area-inset-bottom) + 12px);background:linear-gradient(0deg,rgba(0,0,0,.66),transparent)}
.f-vp-time{flex:none;font:700 12.5px/1 var(--display);font-variant-numeric:tabular-nums}
.f-vp-bar{flex:1;height:30px;display:flex;align-items:center;position:relative;cursor:pointer}
.f-vp-bar::before{content:"";position:absolute;left:0;right:0;height:5px;border-radius:3px;background:rgba(255,255,255,.28)}
.f-vp-bar i{position:relative;height:5px;border-radius:3px;background:#9a8cff}
.f-vp-bar i::after{content:"";position:absolute;right:-7px;top:50%;width:14px;height:14px;margin-top:-7px;border-radius:50%;background:#fff}
.f-vp-rate{flex:none;min-width:50px;height:32px;border:0;border-radius:16px;background:rgba(255,255,255,.16);color:#fff;font:800 13px/1 var(--display)}
.f-vp-wait{position:absolute;top:50%;left:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:4px solid rgba(255,255,255,.22);border-top-color:#fff;animation:f-vpspin .8s linear infinite}
@keyframes f-vpspin{to{transform:rotate(360deg)}}
.f-vp-end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;background:rgba(22,15,64,.93);text-align:center}
.f-vp-end p{margin:0 0 4px;max-width:320px;font:800 18px/1.35 var(--display)}
.f-vp-end .f-btn{min-width:220px}
.f-vp-again{border:0;background:none;padding:8px;color:rgba(255,255,255,.75);font:700 14px/1 var(--display)}
`;

let added = false;

export function addVideoStyle(): void {
  if (added || typeof document === "undefined") return;
  added = true;
  const el = document.createElement("style");
  el.dataset.video = "1";
  el.textContent = CSS;
  document.head.appendChild(el);
}
