// The owl's body's style (owlBody.tsx; 14 Nov 2026): its colours by class from the palette (Dark turns it with
// everything else) and its acting. Out of the Level's own style since Home, the road and the reveal draw it too. A
// string, attached once by owlBody.tsx (never the first load). Motion: only transform and opacity, one animation of
// transform per group (tests/familyMotion.test.ts): the landing and the breathing are on two groups.

const CSS = `
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
.f-buddy.pose-yes .ob-land,.f-buddy.pose-champ .ob-land,.f-buddy.pose-combo .ob-land{animation:ob-land .62s ease 2}
.f-buddy.pose-yes .ob-sq,.f-buddy.pose-champ .ob-sq,.f-buddy.pose-combo .ob-sq{animation-delay:1.24s}
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
.f-buddy.pose-tick .ob-tap{animation:ob-scribble .5s ease-in-out infinite}
.f-buddy.pose-tick .ob-clock{transform-box:fill-box;transform-origin:center;animation:ob-ring .45s ease-in-out infinite}
@keyframes ob-ring{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}
@media (prefers-reduced-motion:reduce){.f-buddy *{animation:none!important}}
`;

let added = false;

/** The owl's body's style, attached once (owlBody.tsx calls it as it loads). */
export function addBuddyStyle(): void {
  if (added || typeof document === "undefined") return;
  added = true;
  const el = document.createElement("style");
  el.dataset.buddy = "1";
  el.textContent = CSS;
  document.head.appendChild(el);
}
