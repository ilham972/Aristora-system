// The Level's new look (14 Nov 2026, his "let's build completely"): the steps bar, the owl beside him, a long question
// one part at a time, the answer after every question, the owl's body. It comes with the level screen's own file
// (play.tsx), so the first load carries none of it (the Level's older rules are still in family.css). A string, attached
// once. Class names are its own (.f-pips, .f-bank, .f-qcount, .f-lvcoach, .f-lvsay, .f-kind, .f-stepper, .f-stp, .f-story, .f-verdict*,
// .f-buddy, .ob-*, .fx-ok / .fx-no): grep the CSS files and the other style strings before a new one.
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
.f-buddy.coach{width:84px}
.f-lvsay{flex:1;margin:0 0 24px;padding:9px 13px 7px;font-size:13.5px;line-height:1.4;animation:f-rise .3s ease both}
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
.f-buddy svg{display:block;width:100%;height:auto;overflow:visible}
.f-buddy .ob-b{fill:var(--owl-body)}
.f-buddy .ob-l{fill:#e2dcff}
.f-buddy .ob-chest{fill:none;stroke:var(--owl-body);stroke-width:8;stroke-linecap:round}
.f-buddy .ob-chin{fill:var(--owl-cap);opacity:.1}
.f-buddy .ob-w{fill:var(--owl-wing);stroke:#8f7df5;stroke-width:5;stroke-linejoin:round}
.f-buddy .ob-wf{fill:none;stroke:#8f7df5;stroke-width:6;stroke-linecap:round;opacity:.55}
.f-buddy .ob-w2{fill:#8f7df5}
.f-buddy .ob-g{fill:var(--gold)}
.f-buddy .ob-g3{fill:var(--gold-3d)}
.f-buddy .ob-f{fill:var(--owl-face)}
.f-buddy .ob-k{fill:#fff}
.f-buddy .ob-p{fill:var(--gem)}
.f-buddy .ob-r{fill:var(--wrong)}
.f-buddy .ob-u{fill:var(--right);opacity:.85}
.f-buddy .ob-v{fill:var(--brand)}
.f-buddy .ob-eye{fill:none;stroke:#fff;stroke-width:12;stroke-linecap:round}
.f-buddy .ob-line{fill:none;stroke:var(--owl-face);stroke-width:7;stroke-linecap:round}
.f-buddy .ob-blush{fill:#ff8fc0;opacity:.75}
.f-buddy .ob-shadow{fill:#2f2380;opacity:.13}
.f-buddy .ob-wood{fill:#f3d9b0}
.f-buddy .ob-page{fill:var(--card);stroke:var(--line-2);stroke-width:5}
.f-buddy .ob-rule{fill:none;stroke:var(--brand-mid);stroke-width:7;stroke-linecap:round}
.f-buddy .ob-sign{fill:var(--card);stroke:var(--owl-face);stroke-width:8}
.f-buddy .ob-turn{fill:none;stroke:var(--brand);stroke-width:12;stroke-linecap:round}
.f-buddy .ob-cup{fill:none;stroke:var(--gold-3d);stroke-width:10;stroke-linecap:round}
.f-buddy .ob-stick{fill:none;stroke:#c9a36a;stroke-width:10;stroke-linecap:round}
.f-buddy .ob-t{font:800 60px var(--display);fill:#8f7df5}
.f-buddy .ob-sq{animation:ob-breathe 2.8s ease-in-out infinite}
@keyframes ob-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.012,.985)}}
.f-buddy.pose-yes .ob-hop,.f-buddy.pose-champ .ob-hop,.f-buddy.pose-combo .ob-hop{animation:ob-hop .62s cubic-bezier(.3,.7,.4,1) 2 both}
.f-buddy.pose-yes .ob-sq,.f-buddy.pose-champ .ob-sq,.f-buddy.pose-combo .ob-sq{animation:ob-land .62s ease 2 both,ob-breathe 2.8s ease-in-out 1.3s infinite}
@keyframes ob-hop{0%{transform:translateY(0)}18%{transform:translateY(26px)}55%{transform:translateY(-78px)}100%{transform:translateY(0)}}
@keyframes ob-land{0%{transform:scale(1,1)}18%{transform:scale(1.1,.86)}45%{transform:scale(.93,1.09)}88%{transform:scale(.96,1.05)}100%{transform:scale(1.07,.9)}}
.f-buddy.pose-yes .ob-shadow{animation:ob-shade .62s ease 2 both}
@keyframes ob-shade{0%,100%{transform:scale(1)}55%{transform:scale(.7)}}
.f-buddy .ob-shadow{transform-box:fill-box;transform-origin:center}
.f-buddy.pose-yes .ob-spark,.f-buddy.pose-champ .ob-spark,.f-buddy.pose-combo .ob-spark,.f-buddy.pose-hello .ob-spark{transform-box:fill-box;transform-origin:center;animation:ob-twinkle 1.1s ease-in-out infinite}
.f-buddy .ob-spark:nth-child(2n){animation-delay:.35s}
@keyframes ob-twinkle{0%,100%{opacity:1}50%{opacity:.25}}
.f-buddy.pose-hello .ob-wr{animation:ob-wave .5s ease-in-out 4 both}
@keyframes ob-wave{0%,100%{transform:rotate(0)}50%{transform:rotate(-16deg)}}
.f-buddy.pose-write .ob-wr,.f-buddy.pose-write .ob-pencil{animation:ob-scribble .9s ease-in-out infinite}
@keyframes ob-scribble{0%,100%{transform:rotate(0)}30%{transform:rotate(3deg)}60%{transform:rotate(-3deg)}}
.f-buddy.pose-think .ob-hop{animation:ob-sway 3.4s ease-in-out infinite}
@keyframes ob-sway{0%,100%{transform:translateX(0)}50%{transform:translateX(-10px)}}
.f-buddy.pose-think .ob-top{animation:ob-float 2.2s ease-in-out infinite}
.f-buddy.pose-sleep .ob-zzz{animation:ob-float 2.6s ease-in-out infinite}
@keyframes ob-float{0%,100%{transform:translateY(0);opacity:1}50%{transform:translateY(-14px);opacity:.6}}
.f-buddy.pose-sleep .ob-sq{animation:ob-snore 3.2s ease-in-out infinite}
@keyframes ob-snore{0%,100%{transform:scale(1,1)}50%{transform:scale(1.03,.96)}}
.f-buddy.pose-oops .ob-hop{animation:ob-no .5s ease both}
@keyframes ob-no{0%,100%{transform:translateX(0)}20%{transform:translateX(-12px)}45%{transform:translateX(12px)}70%{transform:translateX(-6px)}}
.f-buddy.pose-again .ob-hop{animation:ob-nod .7s ease 2 both}
@keyframes ob-nod{0%,100%{transform:translateY(0)}40%{transform:translateY(14px)}}
.f-buddy.pose-combo .ob-tap,.f-buddy.pose-teach .ob-wr{animation:ob-scribble .5s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.f-buddy *,.f-verdict,.f-vdim,.f-pips i,.f-bank{animation:none!important}}
.f-qv2tip{margin:10px 2px 0;font:600 13px/1.4 var(--text);color:var(--ink2)}
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
