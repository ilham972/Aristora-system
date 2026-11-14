// The Level's new look (14 Nov 2026, his "let's build completely"): the steps bar, the owl beside him, a long question
// one part at a time, the answer after every question, the owl's body. It comes with the level screen's own file
// (play.tsx), so the first load carries none of it (the Level's older rules are still in family.css). A string, attached
// once. Class names are its own (.f-pips, .f-bank, .f-qcount, .f-lvcoach, .f-lvsay, .f-kind, .f-stepper, .f-stp, .f-story, .f-verdict*,
// .fx-ok / .fx-no, the ✓ / ✗ deck .f-tfd*, the order line .f-oline*): grep the CSS files and the other style strings before a new one. The owl's body has its own
// (buddyStyle.ts: Home and the road draw it too).
// The palette is family.css's (:root; Dark gives the names their dark values, so paint with the names): right = blue,
// not right = rose, part = amber, gold = now and wins. Never green.

const CSS = `
.f-play.v2 .f-ptop{gap:8px}
.f-pips{flex:1;min-width:0;height:34px;display:flex;align-items:center;gap:3px;padding:0;background:none}
.f-pips i{flex:1;min-width:2px;height:10px;border-radius:6px;background:var(--line-2);transition:background .25s ease,height .2s ease}
.f-pips i.full{background:linear-gradient(180deg,#9284ff,var(--brand))}
.f-pips i.part{background:var(--brand-mid)}
.f-pips i.teacher{background:var(--lav)}
.f-pips i.free{background:linear-gradient(180deg,var(--gold-hi),var(--gold))}
.f-pips i.ok{background:linear-gradient(180deg,#6bb6ff,var(--right))}
.f-pips i.no{background:linear-gradient(180deg,#ff93a8,var(--wrong))}
.f-pips i.pt{background:var(--part)}
.f-pips i.on{height:14px;background:var(--card);box-shadow:inset 0 0 0 3px var(--gold),0 0 0 3px var(--gold-soft)}
.f-pips i.pop{animation:f-pip .45s var(--spring)}
@keyframes f-pip{0%{transform:scaleY(1)}40%{transform:scaleY(2.2)}100%{transform:scaleY(1)}}
.f-bank{flex:none;display:inline-flex;align-items:center;gap:5px;height:32px;padding:2px 11px 0 9px;border-radius:999px;background:var(--card);box-shadow:var(--shadow);font:800 15px/1 var(--display);color:var(--gem-ink)}
.f-bank.up{animation:f-bank .5s var(--spring)}
@keyframes f-bank{0%{transform:scale(1)}35%{transform:scale(1.22);box-shadow:0 0 0 4px var(--gem-soft),var(--shadow)}100%{transform:scale(1)}}
.f-play.v2 .f-prow{margin:6px 0 6px;gap:8px}
.f-play.v2 .f-prow .f-kicker{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.f-qcount{flex:none;display:inline-flex;align-items:center;gap:4px;height:32px;padding:2px 10px 0 12px;border-radius:999px;background:var(--card);color:var(--brand-2);font:800 13.5px/1 var(--display);box-shadow:inset 0 0 0 2px var(--line)}
.f-qcount svg{transform:rotate(90deg);transition:transform .2s ease}
.f-qcount.on svg{transform:rotate(-90deg)}
.f-play.v2 .f-checkpill{padding:9px 15px 6px;font-size:14px}
.f-play.v2 .f-strip{display:none}
.f-play.v2 .f-strip.open{display:flex;flex-wrap:wrap;overflow:visible;gap:7px;margin:2px 0 8px;padding:12px;border-radius:20px;background:var(--card);box-shadow:var(--shadow);animation:f-rise .25s ease both}
.f-play.v2 .f-strip.open .f-qchip{min-width:44px;height:42px;font-size:15.5px}
.f-qchip.ok{background:var(--right-soft);color:var(--right-ink);box-shadow:none}
.f-qchip.no{background:var(--wrong-soft);color:var(--wrong-ink);box-shadow:none}
.f-qchip.pt{background:var(--part-soft);color:var(--gold-ink);box-shadow:none}
.f-strip .f-checkpill{margin-left:auto}
.f-lvcoach{position:relative;z-index:2;display:flex;align-items:flex-end;gap:4px;margin:0 0 -12px;padding-left:2px;min-height:74px}
.f-lvcoach .tap{flex:none;display:block}
.f-lvcoach.hid{visibility:hidden}
.f-buddy.coach{width:84px}
.f-lvsay{flex:1;margin:0 0 24px;padding:9px 13px 7px;font-size:13.5px;line-height:1.4;animation:f-rise .3s ease both}
.f-lvsay.hey{background:var(--brand-soft);color:var(--brand-2);font-weight:800;box-shadow:inset 0 0 0 2.5px var(--brand);animation:f-hey .5s ease both}
@keyframes f-hey{0%{opacity:0;transform:translateY(6px) scale(.96)}55%{opacity:1;transform:translateY(-3px) scale(1.03)}100%{transform:none}}
.f-play.v2 .f-qcard{margin:0;padding-top:20px}
.f-play.v2 .f-qhead{justify-content:flex-start;gap:8px}
.f-play.v2 .f-qn{flex:none;padding:6px 11px 4px;border-radius:10px;background:var(--brand);color:#fff;font:800 14.5px/1 var(--display);box-shadow:0 3px 0 var(--brand-3)}
.f-kind{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:700 13px/1.2 var(--display);color:var(--ink2);padding-top:2px}
.f-play.v2 .f-qtools{flex:none;margin-left:auto}
.f-stepper{position:relative;display:flex;justify-content:space-between;align-items:center;margin:14px 2px 2px;padding:0 4px}
.f-stepper::before{content:"";position:absolute;left:22px;right:22px;top:50%;height:4px;margin-top:-2px;border-radius:2px;background:var(--line-2)}
.f-stp{position:relative;z-index:1;flex:none;width:44px;height:44px;display:grid;place-items:center;padding:0;background:none}
.f-stp b{min-width:32px;height:32px;display:grid;place-items:center;padding:2px 6px 0;border-radius:16px;background:var(--card);color:var(--ink3);font:800 13px/1 var(--display);box-shadow:inset 0 0 0 2.5px var(--line-2);transition:transform .2s var(--spring),box-shadow .2s ease,background .2s ease}
.f-stp.full b{background:var(--brand);color:#fff;box-shadow:0 3px 0 var(--brand-3)}
.f-stp.part b{background:var(--brand-soft);color:var(--brand-2);box-shadow:inset 0 0 0 2.5px var(--brand-mid)}
.f-stp.ok b{background:var(--right);color:#fff;box-shadow:0 3px 0 var(--right-ink)}
.f-stp.no b{background:var(--wrong);color:#fff;box-shadow:0 3px 0 var(--wrong-ink)}
.f-stp.now b{transform:scale(1.22);background:var(--card);color:var(--gold-ink);box-shadow:inset 0 0 0 3.5px var(--gold),0 0 0 4px var(--gold-soft),0 3px 0 var(--gold-3d)}
.f-stp.now.ok b{color:var(--right-ink);box-shadow:inset 0 0 0 3.5px var(--right),0 0 0 4px var(--right-soft)}
.f-stp.now.no b{color:var(--wrong-ink);box-shadow:inset 0 0 0 3.5px var(--wrong),0 0 0 4px var(--wrong-soft)}
.f-story{width:100%;display:flex;align-items:center;gap:9px;margin:12px 0 0;padding:9px 10px 7px 12px;border-radius:16px;background:var(--brand-soft);box-shadow:inset 0 0 0 2px var(--brand-mid);color:var(--ink);text-align:left;font:600 13.5px/1.4 var(--text)}
.f-story>svg{flex:none;color:var(--brand)}
.f-story span{flex:1;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.f-story .dn{transform:rotate(90deg);transition:transform .2s ease}
.f-story.open{background:var(--brand);color:#fff;box-shadow:0 3px 0 var(--brand-3)}
.f-story.open>svg{color:#fff}
.f-story.open .dn{transform:rotate(-90deg)}
.f-paper.step{animation:f-slide .3s cubic-bezier(.2,.8,.3,1) both}
.f-paper.step.back{animation-name:f-slideback}
@keyframes f-slideback{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:none}}
.f-qcard.locked .f-paper,.f-qcard.locked .f-part{pointer-events:none}
.f-paper.step>.f-part .f-plabel{display:none}
.f-box.ok{box-shadow:inset 0 0 0 2.5px var(--right),0 0 0 4px var(--right-soft);color:var(--right-ink)}
.f-box.no{box-shadow:inset 0 0 0 2.5px var(--wrong),0 0 0 4px var(--wrong-soft);color:var(--wrong-ink);animation:f-shake .4s ease}
@keyframes f-shake{0%,100%{transform:none}20%{transform:translateX(-5px)}45%{transform:translateX(5px)}70%{transform:translateX(-3px)}}
.f-key.chk{--edge:var(--gold-3d);background:linear-gradient(180deg,var(--gold-hi),var(--gold) 55%);color:var(--gold-ink);font-size:15px;letter-spacing:.01em}
.f-nextbar .f-key.chk{font-size:18px}
.f-vdim{position:fixed;z-index:11;inset:0;background:rgba(29,24,72,.18);animation:f-vfade .2s ease both}
@keyframes f-vfade{from{opacity:0}to{opacity:1}}
.f-verdict{position:fixed;z-index:12;left:50%;bottom:0;transform:translateX(-50%);width:min(100%,520px);padding:22px 18px calc(18px + var(--safe-b));border-radius:28px 28px 0 0;box-shadow:0 -14px 30px -16px rgba(40,30,110,.5);animation:f-vup .34s cubic-bezier(.2,.9,.3,1.15) both}
@keyframes f-vup{from{transform:translate(-50%,105%)}to{transform:translate(-50%,0)}}
.f-verdict.ok{background:var(--right-soft)}
.f-verdict.no{background:var(--wrong-soft)}
.f-verdict.pt,.f-verdict.teach{background:var(--part-soft)}
.f-verdict h2{display:flex;align-items:center;gap:9px;margin:0;padding-right:100px;font:800 21px/1.2 var(--display)}
.f-verdict.ok h2{color:var(--right-ink)}
.f-verdict.no h2{color:var(--wrong-ink)}
.f-verdict.pt h2,.f-verdict.teach h2{color:var(--gold-ink)}
.f-vmark{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:#fff;font:800 18px/1 var(--display);animation:f-vpop .4s var(--spring) both}
.f-verdict.ok .f-vmark{background:var(--right);box-shadow:0 3px 0 var(--right-ink)}
.f-verdict.no .f-vmark{background:var(--wrong);box-shadow:0 3px 0 var(--wrong-ink)}
.f-verdict.pt .f-vmark,.f-verdict.teach .f-vmark{background:var(--part);box-shadow:0 3px 0 var(--gold-3d)}
@keyframes f-vpop{from{transform:scale(0)}to{transform:scale(1)}}
.f-verdict p{margin:6px 0 0;padding-right:104px;font:600 14.5px/1.45 var(--text);color:var(--ink)}
.f-vchips{display:flex;flex-wrap:wrap;gap:8px;min-height:32px;margin:12px 0 14px}
.f-vchip{display:inline-flex;align-items:center;gap:5px;height:32px;padding:2px 12px 0;border-radius:999px;background:var(--card);font:800 13.5px/1 var(--display);box-shadow:var(--shadow);animation:f-rise .3s ease .12s both}
.f-vchip.xp{color:var(--gem-ink)}
.f-vchip.row{background:linear-gradient(180deg,var(--gold-hi),var(--gold));color:#6b4500;box-shadow:0 3px 0 var(--gold-3d)}
.f-vchip.back{color:var(--brand-2)}
.f-verdict .f-btn{width:100%}
.f-verdict.ok .f-btn{--edge:var(--right-ink);background:linear-gradient(180deg,#57a9ff,#1e8cf5 60%);color:#fff}
.f-verdict.no .f-btn{--edge:var(--wrong-ink);background:linear-gradient(180deg,#ff7d95,#f24a6c 60%);color:#fff}
.f-buddy.fbowl{position:absolute;right:6px;top:-78px;width:124px;pointer-events:none}
.f-ring .f-buddy.rv{width:118px;margin-top:-16px}
@media (prefers-reduced-motion:reduce){.f-verdict,.f-vdim,.f-pips i,.f-bank{animation:none!important}}
.f-qv2tip{margin:10px 2px 0;font:600 13px/1.4 var(--text);color:var(--ink2)}
.f-tfd{flex:1;display:grid;gap:10px;padding:6px 0 2px;touch-action:pan-y}
.f-tfd-dots{display:flex;justify-content:center;gap:8px}
.f-tfd-dot{min-width:36px;height:36px;padding:2px 6px 0;border-radius:12px;background:var(--card);box-shadow:inset 0 0 0 2px var(--line-2);font:800 15px/1 var(--display);color:var(--ink3)}
.f-tfd-dot.has{color:var(--brand);box-shadow:inset 0 0 0 2px var(--brand-mid)}
.f-tfd-dot.now{box-shadow:inset 0 0 0 2.5px var(--gold),0 3px 0 var(--gold-3d);color:var(--gold-ink)}
.f-tfd-dot.ok{background:var(--right);color:#fff;box-shadow:none}
.f-tfd-dot.no{background:var(--wrong);color:#fff;box-shadow:none}
.f-tfd-stack{position:relative;display:grid;min-height:96px}
.f-tfd-card{grid-area:1/1;display:grid;place-items:center;gap:4px;padding:14px 16px;border-radius:18px;background:var(--card);box-shadow:inset 0 0 0 2px var(--line-2),0 6px 0 var(--line-2);font:600 17px/1.45 var(--text);color:var(--ink);text-align:center;animation:f-tfd-in .3s var(--spring) backwards}
.f-tfd-card small{font:800 11px var(--display);letter-spacing:.08em;color:var(--ink3)}
.f-tfd-card.gone{pointer-events:none;animation:f-tfd-r .45s ease-in forwards}
.f-tfd-card.gone.l{animation-name:f-tfd-l}
@keyframes f-tfd-in{from{opacity:0;transform:scale(.9) translateY(10px)}}
@keyframes f-tfd-r{to{opacity:0;transform:translateX(120%) rotate(14deg)}}
@keyframes f-tfd-l{to{opacity:0;transform:translateX(-120%) rotate(-14deg)}}
.f-tfd-say{margin:0;text-align:center;font:600 14px/1.4 var(--text);color:var(--ink2)}
.f-tfd-say b{color:var(--gold-ink)}
.f-tfd-b{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.f-tfd-b button{min-height:58px;border-radius:18px;font:800 19px/1 var(--display);transition:transform .08s ease}
.f-tfd-no{background:var(--wrong-soft);color:var(--wrong);box-shadow:inset 0 0 0 2.5px var(--wrong),0 5px 0 var(--wrong)}
.f-tfd-yes{background:var(--right-soft);color:var(--right);box-shadow:inset 0 0 0 2.5px var(--right),0 5px 0 var(--right)}
.f-tfd-no.on{background:var(--wrong);color:#fff}
.f-tfd-yes.on{background:var(--right);color:#fff}
.f-tfd-b button:active:not(:disabled){transform:translateY(4px)}
.f-tfd-b button:disabled{opacity:.45}
.f-oline{flex:1;display:grid;gap:12px;padding:6px 0 2px}
.f-oline-l{position:relative;display:flex;justify-content:center;align-items:center;gap:8px;padding:10px 8px 16px;border-radius:18px;background:var(--brand-soft)}
.f-oline.col .f-oline-l{flex-direction:column;align-items:stretch;padding-bottom:10px}
.f-oline-p{position:relative;display:grid;place-items:center;min-width:52px;min-height:56px;padding:8px 10px 2px;border-radius:14px;background:var(--card);box-shadow:inset 0 0 0 2px var(--line-2);font:800 22px/1 var(--display);color:var(--ink)}
.f-oline.row .f-oline-p{flex:1 1 0;min-width:0;max-width:66px}
.f-oline-p small{position:absolute;left:6px;top:4px;font:800 10.5px var(--display);color:var(--ink3)}
.f-oline-p:not(.on){border:2px dashed var(--brand-mid);box-shadow:none;background:transparent}
.f-oline-p.next{border-color:var(--gold)}
.f-oline-p.on{color:var(--brand-2);box-shadow:inset 0 0 0 2.5px var(--brand),0 4px 0 var(--brand-mid);animation:f-ol-in .3s var(--spring) backwards}
.f-oline-p.ok{box-shadow:inset 0 0 0 2.5px var(--right),0 0 0 4px var(--right-soft)}
.f-oline-p.no{box-shadow:inset 0 0 0 2.5px var(--wrong),0 0 0 4px var(--wrong-soft)}
.f-oline.col .f-oline-p{min-height:50px;padding:10px 12px 8px 30px;place-items:center start;text-align:left;font:700 16px/1.35 var(--text)}
.f-oline.col .f-oline-p small{top:12px}
.f-oline-arrow{position:absolute;left:14px;right:16px;bottom:7px;height:2px;border-radius:2px;background:var(--brand-mid)}
.f-oline-arrow::after{content:"";position:absolute;right:-6px;top:-4px;border-style:solid;border-width:5px 0 5px 8px;border-color:transparent transparent transparent var(--brand-mid)}
.f-oline-c{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}
.f-oline.col .f-oline-c{flex-direction:column;align-items:stretch}
.f-oline-card{min-width:56px;min-height:56px;padding:4px 14px 0;border-radius:16px;background:var(--card);color:var(--ink);font:800 22px/1 var(--display);box-shadow:inset 0 0 0 2px var(--line-2),0 4px 0 var(--line-2);transition:transform .08s ease}
.f-oline.col .f-oline-card{padding:10px 14px;text-align:left;font:700 16px/1.35 var(--text)}
.f-oline-card:active{transform:translateY(3px)}
@keyframes f-ol-in{from{opacity:0;transform:scale(.7)}}
@media (prefers-reduced-motion:reduce){.f-tfd-card,.f-oline-p{animation:none!important}}
`;

let added = false;

/** The level's own style, attached once (the level screen calls it as it loads). */
export function addLevelStyle(): void {
  if (added || typeof document === "undefined") return;
  added = true;
  const el = document.createElement("style");
  el.dataset.level = "1";
  el.textContent = CSS;
  document.head.appendChild(el);
}
