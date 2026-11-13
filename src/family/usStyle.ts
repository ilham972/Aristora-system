// Us's own style (8 Nov 2026): it comes with Us's own file (usParts.ts), so phones that never open Us carry none of it,
// and the first load's and the later parts' budgets don't pay for it. Before, Us's style lived in family.css (the first
// load: the later budget was full) and profile.css. A string, attached once; the class names are Us's own (.f-us-*,
// .f-uk-*, .f-ut-*, .f-msg*, .f-tb*, .f-pics, .f-lb*, .f-locks*, .f-veil*, .f-rx*, .f-at, .f-new-div, .f-us-seg;
// the chats' are chatStyle.ts's .c-*): grep the CSS files and these before a new one.
// The palette is family.css's (:root). Right = blue, not right = rose (never green).

const CSS = `
.f-hero.us{padding-bottom:24px}
.f-us-help{position:absolute;z-index:2;left:16px;bottom:10px;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.2);color:#fff;font:800 17px/1 var(--display);padding-top:2px}
.f-hero.us .f-hero-in{padding-bottom:18px}
.f-us-guide{display:grid;justify-items:center;gap:8px;text-align:center;padding:20px 18px 16px}
.f-us-guide h2{font:800 20px/1.25 var(--display);color:var(--ink)}
.f-us-guide p{font-size:15.5px;line-height:1.55;color:var(--ink2)}
.f-us-guide .f-btn{width:100%;margin-top:4px}
.f-us-dots{display:flex;gap:6px;margin:2px 0 4px}
.f-us-dots i{width:8px;height:8px;border-radius:99px;background:var(--line-2);transition:width .25s ease,background .25s ease}
.f-us-dots i.on{width:22px;background:var(--brand)}
.f-us-welcome{background:linear-gradient(160deg,var(--card) 30%,var(--brand-soft));border:1.5px solid var(--lav)}
.f-us-welcome p{font-size:15px;line-height:1.6;color:var(--ink);white-space:pre-line}
.f-us-welcome.short p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.f-us-more{display:block;margin-top:2px;font:800 13px/1 var(--display);color:var(--brand-2)}
.f-us-news{display:grid;gap:8px;background:linear-gradient(150deg,var(--gold-soft),var(--card) 70%);box-shadow:0 0 0 2px var(--gold-hi),var(--shadow)}
.f-us-news b{font:800 17px/1.3 var(--display);color:var(--ink)}
.f-us-news p{font-size:14.5px;line-height:1.55;color:var(--ink2)}
.f-us-news .f-btn{justify-self:start;min-height:42px;padding:2px 20px 0}
.f-us-bar{margin:12px 16px 0}
.f-us-write{display:flex;gap:8px}
.f-us-say{flex:1;min-width:0;display:flex;align-items:center;gap:10px;height:50px;padding:0 14px 0 8px;border-radius:999px;background:var(--card);box-shadow:var(--shadow),inset 0 0 0 1.5px var(--lav);font:700 14.5px/1.2 var(--display);color:var(--ink2);text-align:left}
.f-us-say span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.f-us-askb{flex:none;display:grid;place-items:center;align-content:center;width:56px;height:50px;border-radius:18px;background:linear-gradient(180deg,var(--gold-hi),var(--gold) 55%);box-shadow:0 3px 0 var(--gold-3d);font-size:19px;line-height:1}
.f-us-askb small{font:800 11px/1 var(--display);color:var(--gold-ink);margin-top:1px}
.f-us-fl{display:flex;gap:6px;margin-top:10px;overflow-x:auto;scrollbar-width:none}
.f-us-fl::-webkit-scrollbar{display:none}
.f-us-fl button{flex:none;height:34px;padding:2px 13px 0;border-radius:999px;background:var(--card);box-shadow:inset 0 0 0 1.5px var(--line-2);font:800 13.5px/1 var(--display);color:var(--ink2)}
.f-us-fl button.on{background:var(--brand);box-shadow:none;color:#fff}
.f-us-list{list-style:none;margin:4px 16px 0;padding:0}
.f-uk{position:relative;margin-top:10px;padding:12px 12px 8px;border-radius:20px;background:var(--card);box-shadow:var(--shadow);cursor:pointer;animation:f-fade .25s ease both}
.f-uk:active{transform:scale(.995)}
.f-uk.mine{background:linear-gradient(160deg,var(--card) 35%,var(--gold-soft));box-shadow:0 0 0 2px var(--gold-hi),var(--shadow)}
.f-uk.pin{box-shadow:0 0 0 2px var(--brand-mid),var(--shadow)}
.f-uk.fresh{box-shadow:0 0 0 2px var(--lav),var(--shadow)}
.f-uk-h{display:grid;grid-template-columns:42px 1fr auto;align-items:center;gap:10px}
.f-uk-face{position:relative;display:grid;place-items:center;width:42px;height:42px}
.f-uk-face .f-ava{width:42px;height:42px}
.f-uk-face.s,.f-uk-face.s .f-ava{width:32px;height:32px}
.f-uk-emo{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:var(--brand-soft);font-size:21px}
.f-uk-emo.k-count,.f-uk-emo.k-flame{background:var(--flame-soft)}
.f-uk-emo.k-champs{background:var(--gold-soft)}
.f-msg-ava .f-uk-emo{width:32px;height:32px;font-size:16px}
.f-uk-mark{position:absolute;right:-5px;bottom:-4px;font-size:15px;font-style:normal;line-height:1;filter:drop-shadow(0 1px 1px rgba(40,30,110,.25))}
.f-uk-who{min-width:0}
.f-uk-who p{display:flex;align-items:center;flex-wrap:wrap;gap:0 2px;font-size:15px;line-height:1.3;color:var(--ink)}
.f-uk-who .f-gchip{min-width:20px;height:18px;margin:0 0 0 5px;font-size:11px;border-radius:6px}
.f-uk-what{display:block;margin-top:1px;font:600 12.5px/1.3 var(--display);color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.f-uk-new{align-self:start;width:10px;height:10px;margin-top:4px;border-radius:50%;background:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}
.f-uk-win{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;margin:10px 0 0;padding:9px 12px 7px;border-radius:14px;background:linear-gradient(120deg,var(--gold-soft),var(--card) 90%);font:800 18px/1.15 var(--display);color:var(--gold-ink)}
.k-flame .f-uk-win,.f-uk-win.flame{background:linear-gradient(120deg,var(--flame-soft),var(--card) 90%);color:var(--flame-ink)}
.f-uk-win small{font:700 14px/1.2 var(--display);color:var(--ink2)}
.f-uk-win.big{font-size:24px;padding:12px 14px 10px}
.f-uk-b p{margin-top:8px;font-size:15px;line-height:1.55;color:var(--ink);overflow-wrap:anywhere}
.f-uk-state{margin-top:8px;font:700 13.5px/1.35 var(--display);color:var(--ink2)}
.f-uk-state.ok{color:var(--right-ink)}
.f-uk-state.wait{color:var(--gold-ink)}
.f-uk-state.no{color:var(--wrong-ink)}
.f-uk-f{display:flex;align-items:center;gap:8px;min-height:44px;margin-top:10px;padding-top:6px;border-top:1px solid var(--line)}
.f-uk-talk{display:inline-flex;align-items:center;gap:5px;height:38px;padding:1px 12px 0;border-radius:999px;background:var(--card);box-shadow:inset 0 0 0 1.5px var(--line-2);color:var(--ink2);font:800 14px/1 var(--display)}
.f-uk-talk b:empty{display:none}
.f-uk-faces{display:inline-flex;align-items:center;padding-left:8px}
.f-uk-faces>span{display:inline-grid;margin-left:-8px;border-radius:50%;box-shadow:0 0 0 2px #fff}
.f-uk-faces>span.tch{box-shadow:0 0 0 2px var(--brand-mid)}
.f-uk-faces .f-ava.s{width:24px;height:24px;font-size:11px}
.f-uk-tc{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:700 12px/1 var(--display);color:var(--gold-ink)}
.f-us-n{font-weight:800}
.f-us-n.tap{color:var(--brand-2)}
.f-us-p{white-space:nowrap}
.f-us-p .f-gchip,.f-uk-b .f-gchip{display:inline-grid;vertical-align:1px;min-width:20px;height:18px;margin:0 4px 0 3px;font-size:11px;border-radius:6px}
.f-us-by{display:block;font:800 13px/1.3 var(--display);color:var(--brand-2)}
.f-us-post{display:block;white-space:pre-line}
.f-us-clap{display:inline-flex;align-items:center;gap:4px;min-width:52px;height:38px;padding:2px 11px 0;border-radius:999px;background:var(--brand-soft);border:1.5px solid var(--lav);font:800 18px/1 var(--display);color:var(--brand-2);transition:transform .12s ease,background .2s ease}
.f-us-clap b{font-size:14px}
.f-us-clap:active{transform:scale(.9)}
.f-us-clap.done{background:linear-gradient(180deg,#7a6bf0,var(--brand) 70%);border-color:transparent;color:#fff;animation:f-usclap .5s var(--spring)}
@keyframes f-usclap{40%{transform:scale(1.22) rotate(-6deg)}}
.f-us-you{display:inline-grid;justify-items:center;gap:1px;min-width:52px;font:800 15px/1.1 var(--display);color:var(--gold-ink)}
.f-us-you i{font-style:normal;font-size:11px;letter-spacing:.04em;text-transform:uppercase}
.f-us-open{flex:none;height:36px;padding:2px 14px 0;border-radius:999px;background:var(--brand-soft);border:1.5px solid var(--lav);font:800 14px/1 var(--display);color:var(--brand-2);white-space:nowrap}
.f-us-open.go{background:linear-gradient(180deg,var(--gold-hi),var(--gold) 55%);border-color:transparent;box-shadow:0 3px 0 var(--gold-3d);color:var(--gold-ink)}
.f-us-end{display:grid;justify-items:center;gap:8px;margin:22px 16px 0;text-align:center}
.f-us-end p{max-width:300px;font-size:14.5px;line-height:1.5;color:var(--ink2)}
.f-us-end .f-btn{min-width:200px}
.f-ut-none,.f-ut-sum{margin:14px 20px 0;font:700 14px/1.4 var(--display);color:var(--ink2)}
.f-pics{display:grid;gap:4px;margin-top:8px;border-radius:14px;overflow:hidden}
.f-pics.n2{grid-template-columns:1fr 1fr}
.f-pics.n3{grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr}
.f-pics.n3 .f-pic:first-child{grid-row:span 2}
.f-pic{display:block;width:100%;min-height:90px;max-height:380px;padding:0;background:var(--line);overflow:hidden}
.f-pics.n2 .f-pic,.f-pics.n3 .f-pic{aspect-ratio:1;min-height:0}
.f-pic img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
.f-msg .f-pic{max-height:220px}
.f-lb{position:fixed;inset:0;z-index:60;background:rgba(16,12,40,.94)}
.f-lb-in{position:absolute;inset:0;display:grid;place-items:center;overflow:auto;padding:calc(var(--safe-t) + 56px) 0 calc(var(--safe-b) + 44px)}
.f-lb-in img{width:100%;height:auto;max-height:100%;object-fit:contain}
.f-lb-in.z{place-items:start}
.f-lb-in.z img{width:250%;max-width:none;max-height:none}
.f-lb-x{position:absolute;top:calc(var(--safe-t) + 10px);right:12px;background:rgba(255,255,255,.16);color:#fff}
.f-lb-n{position:absolute;left:0;right:0;bottom:calc(var(--safe-b) + 14px);display:flex;justify-content:center;gap:8px}
.f-lb-n button{width:12px;height:12px;border-radius:50%;background:rgba(255,255,255,.35)}
.f-lb-n button.on{background:#fff}
.f-uc .f-take-row{align-items:center;margin-top:10px}
.f-uc-go{flex:1;min-width:110px;min-height:52px;margin-left:auto}
.f-uc-say{margin-top:10px;font-size:13px;line-height:1.45;color:var(--ink2)}
.f-ut .f-hero{padding-bottom:14px}
.f-ut.talking{padding-bottom:calc(150px + var(--safe-b))}
.f-ut-h{color:#fff;font:800 18px/1 var(--display);padding-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.f-ut-vw{display:inline-flex;align-items:center;gap:5px;height:32px;padding:1px 11px 0;border-radius:999px;background:rgba(255,255,255,.18);color:#fff;font:800 14px/1 var(--display)}
.f-ut-m,.f-ut-c{margin:14px 16px 0}
.f-ut-m .f-us-post{font-size:16px;line-height:1.55}
.f-ut-c .f-h2{margin-bottom:2px}
.f-ut-cheer{display:flex;align-items:center;gap:10px;margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}
.f-ut-who{display:flex;align-items:center;gap:8px;min-width:0;height:38px;color:var(--ink2)}
.f-ut-who small{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:700 13px/1.2 var(--display)}
.f-ut-m .f-ur-two{margin-top:12px}
.f-talk{margin:20px 16px 0}
.f-talk .f-h2 small{margin-left:6px;color:var(--ink3);font-size:15px}
.f-talk-lock{display:flex;align-items:center;gap:10px;margin-top:8px;padding:12px 14px;border-radius:16px;background:var(--brand-soft);color:var(--ink2);font-size:14px;line-height:1.5}
.f-talk-lock .f-ico,.f-talk-lock svg{flex:none;color:var(--brand-mid)}
.f-talk-none{display:flex;align-items:center;gap:10px;margin-top:8px;padding:10px 12px;border-radius:16px;background:var(--card);box-shadow:var(--shadow);color:var(--ink2);font-size:14px;line-height:1.5}
.f-msgs{list-style:none;margin:2px 0 0;padding:0}
.f-msgs.kids{margin-top:2px}
.f-msg{display:grid;grid-template-columns:32px 1fr;gap:8px;margin-top:12px}
.f-msgs.kids .f-msg{grid-template-columns:26px 1fr;margin-top:8px}
.f-msgs.kids .f-msg-ava .f-ava.s{width:26px;height:26px;font-size:12px}
.f-msg-ava{padding-top:2px}
.f-msg-w{min-width:0}
.f-msg-h{display:flex;align-items:center;gap:5px;min-width:0;font:800 13.5px/1.2 var(--display);color:var(--ink)}
.f-msg-h b{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.f-msg-h b.tap{color:var(--brand-2)}
.f-msg-h small{flex:none;color:var(--ink3);font-weight:600;font-size:12px}
.f-msg-h .f-gchip{min-width:20px;height:18px;font-size:11px;border-radius:6px}
.f-msg-tag{flex:none;padding:2px 6px 0;border-radius:6px;background:var(--brand);color:#fff;font:800 10.5px/1.3 var(--display);font-style:normal}
.f-msg-tag.ask{background:var(--gold-soft);color:var(--gold-ink)}
.f-msg-b{display:inline-block;max-width:100%;margin-top:4px;padding:8px 12px;border-radius:4px 16px 16px 16px;background:var(--card);box-shadow:var(--shadow)}
.f-msg-b:empty{display:none}
.f-msg.tch .f-msg-b{background:linear-gradient(160deg,var(--card) 30%,var(--brand-soft));box-shadow:0 0 0 1.5px var(--lav),var(--shadow)}
.f-msg.mine .f-msg-b{background:var(--brand-soft)}
.f-msg.ok>.f-msg-w>.f-msg-b{box-shadow:0 0 0 2px var(--right),var(--shadow)}
.f-msg.no>.f-msg-w>.f-msg-b{box-shadow:0 0 0 2px var(--wrong-soft),var(--shadow)}
.f-msg-t{font-size:15px;line-height:1.5;white-space:pre-line;overflow-wrap:anywhere;color:var(--ink)}
.f-msg-b .f-pics{margin-top:6px}
.f-msg-ok,.f-msg-no{display:inline-flex;margin:6px 6px 0 0;padding:3px 9px 1px;border-radius:999px;font:800 12px/1.3 var(--display)}
.f-msg-ok{background:var(--right-soft);color:var(--right-ink)}
.f-msg-no{background:var(--wrong-soft);color:var(--wrong-ink)}
.f-msg-fix{margin-top:6px;padding:8px 10px;border-radius:12px;background:var(--gold-soft);color:var(--gold-ink);font-size:14px;line-height:1.45}
.f-msg-fix b{font-family:var(--display)}
.f-msg-a{display:flex;align-items:center;gap:2px;min-height:34px;margin-top:2px}
.f-msg-b1{display:inline-flex;align-items:center;gap:3px;height:32px;padding:2px 9px 0;border-radius:999px;font:800 13px/1 var(--display);color:var(--ink2)}
.f-msg-b1.like{font-size:15px}
.f-msg-b1.like b{font-size:12.5px}
.f-msg-b1.like.on{background:var(--brand-soft);color:var(--brand-2)}
.f-msg-lk{padding:0 8px;font:800 13px/1 var(--display);color:var(--ink3)}
.f-msg-rep{height:32px;padding:0 8px;color:var(--ink3);font-size:14px}
.f-ur-note{margin-top:8px;padding:8px 10px;border-radius:12px;background:var(--gold-soft);color:var(--gold-ink);font-size:14px}
.f-ur-head{margin:16px 4px 2px;font:800 13px/1 var(--display);letter-spacing:.04em;color:var(--ink3)}
.f-ur-wait{margin:6px 6px 0 40px;font-size:13px;color:var(--ink2)}
.f-ur-acts{display:flex;align-items:center;gap:6px;margin-top:10px}
.f-ur-b{min-width:40px;height:34px;padding:2px 9px 0;border-radius:12px;background:var(--brand-soft);font:800 15px/1 var(--display);color:var(--brand-2)}
.f-ur-b.ok.on{background:var(--right);color:#fff}
.f-ur-b.no.on{background:var(--wrong);color:#fff}
.f-ur-b.flag{background:var(--wrong-soft);color:var(--wrong-ink);font-size:13px}
.f-ur-two{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
.f-ur-two .f-btn{padding:2px 10px 0;font-size:15px}
.f-ur-rep{margin-top:8px;padding:4px 0;font:700 12.5px/1 var(--display);color:var(--ink3)}
.f-locks{margin:14px 16px 0;padding:14px;border-radius:18px;background:var(--brand-soft)}
.f-locks p{font-size:14px;line-height:1.5;color:var(--ink2)}
.f-locks-g{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px}
.f-locks-g i{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;background:var(--card);color:var(--brand-mid)}
.f-locks-g b{margin-left:4px;font:800 15px/1 var(--display);color:var(--ink2)}
.f-tb{position:fixed;z-index:30;left:50%;bottom:0;width:min(100%,520px);transform:translateX(-50%);padding:8px 10px calc(10px + var(--safe-b));border-radius:22px 22px 0 0;background:rgba(255,255,255,.97);box-shadow:0 -8px 26px -14px rgba(40,30,110,.42)}
.f-tb-q{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px 2px 8px}
.f-tb-q::-webkit-scrollbar{display:none}
.f-tb-q button{flex:none;height:34px;padding:2px 12px 0;border-radius:999px;background:var(--brand-soft);border:1.5px solid var(--lav);font:800 13.5px/1 var(--display);color:var(--brand-2)}
.f-tb-q button:active{transform:scale(.94)}
.f-tb-re{display:flex;align-items:center;gap:5px;margin:0 6px 6px;font-size:13px;color:var(--ink2)}
.f-tb-re b{color:var(--brand-2)}
.f-tb-re button{display:grid;place-items:center;width:24px;height:24px;margin-left:auto;border-radius:50%;background:var(--bg);color:var(--ink2)}
.f-tb-ph{display:flex;gap:6px;margin:0 2px 8px}
.f-tb-row{display:flex;align-items:flex-end;gap:8px}
.f-tb-cam{flex:none;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--bg);color:var(--brand-2)}
.f-tb-in{flex:1;min-width:0;height:44px;max-height:110px;resize:none;padding:11px 14px 8px;border-radius:22px;border:1.5px solid var(--line-2);background:var(--card);font:500 15.5px/1.4 var(--text);color:var(--ink)}
.f-tb-in:focus{outline:none;border-color:var(--brand-mid)}
.f-tb-go{flex:none;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:linear-gradient(180deg,#7a6bf0,var(--brand) 60%);color:#fff;box-shadow:0 3px 0 var(--brand-3)}
.f-tb-go:disabled{opacity:.4;box-shadow:none}
.f-msg{position:relative;touch-action:pan-y;transition:transform .18s}
.f-msg.swiping{transition:none}
.f-msg-swipe{position:absolute;left:-30px;top:10px;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--brand-soft);color:var(--brand-2);font:800 14px/1 var(--display);font-style:normal;opacity:0;transition:opacity .15s}
.f-msg.swiping .f-msg-swipe{opacity:1}
.f-msg.flash>.f-msg-w>.f-msg-b{animation:f-flash 1.5s ease}
@keyframes f-flash{0%,45%{background:var(--gold-soft);box-shadow:0 0 0 3px var(--gold),var(--shadow)}}
.f-msg-q{display:flex;flex-direction:column;align-items:flex-start;max-width:100%;margin:5px 0 -1px;padding:5px 10px 4px;border-left:3px solid var(--brand);border-radius:4px 12px 12px 4px;background:rgba(108,92,231,.09);text-align:left}
.f-msg-q b{font:800 12px/1.3 var(--display);color:var(--brand-2)}
.f-msg-q span{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12.5px;color:var(--ink2)}
.f-msg-q.gone{border-color:var(--ink3);opacity:.7}
.f-at{padding:0 3px;border-radius:6px;background:var(--brand-soft);color:var(--brand-2);font-weight:700}
.f-rxs{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}
.f-rx{display:inline-flex;align-items:center;gap:3px;height:28px;padding:1px 8px 0;border-radius:999px;background:var(--card);box-shadow:0 0 0 1.5px var(--line-2);font-size:14px;animation:f-pop .25s}
.f-rx b{font:800 12px/1 var(--display);color:var(--ink2)}
.f-rx.on{background:var(--brand-soft);box-shadow:0 0 0 1.5px var(--brand-mid)}
.f-rx.on b{color:var(--brand-2)}
.f-rx.who{color:var(--ink3)}
.f-rxs.who-k{margin:2px 0 6px}
.f-rx-e{margin-left:auto;font-size:20px}
.f-msg-b1.rx{font-size:15px}
.f-msg-b1.rx i{margin-left:-1px;font-style:normal;font-size:11px;color:var(--ink3)}
.f-msg-b1.rx.on{background:var(--brand-soft)}
.f-rxbar-bg{position:fixed;inset:0;z-index:40}
.f-rxbar{position:absolute;z-index:41;left:28px;top:-44px;display:flex;gap:1px;padding:4px 6px;border-radius:999px;background:var(--card);box-shadow:0 10px 30px -8px rgba(40,30,110,.5)}
.f-rxbar button{width:37px;height:37px;border-radius:50%;font-size:23px;animation:f-rxin .32s cubic-bezier(.3,1.6,.5,1) both;animation-delay:calc(var(--i) * 25ms)}
.f-rxbar button.on{background:var(--brand-soft)}
.f-rxbar button:active{transform:scale(1.3)}
@keyframes f-rxin{from{opacity:0;transform:translateY(12px) scale(.4)}}
@keyframes f-pop{from{transform:scale(.6)}}
.f-new-div{display:flex;align-items:center;gap:8px;margin:16px 0 -4px;font:800 12px/1 var(--display);color:var(--gem-2)}
.f-new-div:before,.f-new-div:after{content:"";flex:1;height:1.5px;background:var(--gem)}
.f-tb-emo{flex:none;display:grid;place-items:center;width:36px;height:44px;border-radius:50%;font-size:22px}
.f-tb-emo.on{background:var(--brand-soft)}
.f-tb-ep .f-tb-atb{background:var(--brand-soft);font:800 20px/1 var(--display);color:var(--brand-2)}
.f-tb-ep{display:grid;grid-template-columns:repeat(8,1fr);gap:2px;max-height:168px;overflow-y:auto;margin-top:8px}
.f-tb-ep button{height:40px;border-radius:10px;font-size:24px}
.f-tb-ep button:active{background:var(--brand-soft);transform:scale(1.2)}
.f-tb-at{list-style:none;max-height:200px;overflow-y:auto;margin:0 0 8px;padding:4px;border-radius:16px;background:var(--bg)}
.f-tb-at button{display:flex;align-items:center;gap:8px;width:100%;height:44px;padding:0 8px;border-radius:12px;text-align:left;font:800 14px/1 var(--display);color:var(--ink)}
.f-tb-at button:active{background:var(--brand-soft)}
.f-tb-re{gap:8px;margin:0 4px 8px;padding:6px 6px 6px 10px;border-left:3px solid var(--brand);border-radius:6px 12px 12px 6px;background:var(--brand-soft)}
.f-tb-re>span{display:flex;flex-direction:column;min-width:0}
.f-tb-re small{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12.5px;color:var(--ink2)}
.f-veil-l{display:grid;gap:8px;list-style:none;margin:10px 0 0;padding:0}
.f-veil-c{position:relative;display:grid;grid-template-columns:32px 1fr;gap:8px;padding:10px;border-radius:16px;background:var(--card);box-shadow:var(--shadow);overflow:hidden;cursor:pointer;animation:f-veil-in .4s both;animation-delay:calc(var(--i) * 60ms)}
.f-veil-ava{display:block;width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--brand-mid),var(--gem));filter:blur(3px)}
.f-veil-n{display:block;width:44%;height:12px;margin-top:4px;border-radius:6px;background:var(--line-2);filter:blur(2px)}
.f-veil-t{margin-top:8px;font-size:14px;line-height:1.5;color:var(--ink);filter:blur(5px);user-select:none;-webkit-user-select:none;pointer-events:none}
.f-veil-ph{display:flex;gap:6px;margin-top:8px}
.f-veil-ph span{flex:1;max-width:62%;height:110px;border-radius:12px;overflow:hidden;background:linear-gradient(135deg,#f3f1ff,#e4dffb)}
.f-veil-ph img{width:100%;height:100%;object-fit:cover;filter:blur(9px) saturate(1.4);transform:scale(1.4)}
.f-veil-lock{position:absolute;top:10px;right:10px;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:rgba(108,92,231,.13);color:var(--brand-2)}
.f-veil-c:active .f-veil-lock{animation:f-wig .4s}
@keyframes f-wig{25%{transform:rotate(-16deg)}75%{transform:rotate(16deg)}}
@keyframes f-veil-in{from{opacity:0;transform:translateY(8px)}}
.f-veil-more{display:block;margin-top:8px;font:800 14px/1 var(--display);color:var(--ink2)}
.f-veil-go{width:100%;margin-top:12px}
.f-talk-lock{display:block}
.f-talk-lock p{display:flex;align-items:center;gap:10px}
.f-veil-talk{list-style:none;margin:0 0 6px;padding:0}
.f-veil-talk li{display:flex;align-items:center;gap:8px;margin-top:8px}
.f-veil-talk li i{display:block;height:34px;border-radius:4px 16px 16px 16px;background:var(--card);filter:blur(2.5px)}
.f-us-seg{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:12px 16px 0;padding:4px;border-radius:16px;background:var(--card);box-shadow:var(--shadow)}
.f-us-seg button{position:relative;height:40px;padding-top:2px;border-radius:12px;font:800 14.5px/1 var(--display);color:var(--ink2)}
.f-us-seg button.on{background:var(--brand);color:#fff}
.f-us-seg i{position:absolute;top:2px;right:6px;min-width:18px;height:18px;padding:2px 5px 0;border-radius:9px;background:var(--gem);color:#fff;font:800 11px/1.3 var(--display);font-style:normal}
.f-doubt-l{margin:4px 0 6px;font:800 14px/1.3 var(--display);color:var(--ink2)}
.f-doubt-l.s{margin-top:6px;font-weight:600;font-size:13px}
.f-seg3{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.f-seg3 button{height:42px;padding-top:2px;border-radius:12px;background:var(--brand-soft);border:1.5px solid var(--lav);font:800 15px/1 var(--display);color:var(--brand-2)}
.f-seg3 button.on{background:var(--brand);border-color:transparent;color:#fff}
.f-cheer-l{list-style:none;margin:10px 0 0;padding:0}
.f-cheer-l li{border-top:1px solid var(--line)}
.f-cheer-l li>button,.f-cheer-l li.tch{display:flex;align-items:center;gap:10px;width:100%;min-height:50px;text-align:left}
.f-cheer-l b{font:800 15px/1.2 var(--display);color:var(--ink)}
.f-cheer-l i{font-style:normal}
.f-cheer-l li.tch i{padding:2px 6px 0;border-radius:6px;background:var(--brand);color:#fff;font:800 11px/1.3 var(--display)}
.f-learn-s{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 4px}
.f-learn-s button{min-height:36px;padding:3px 12px 1px;border-radius:999px;background:var(--gold-soft);border:1.5px solid var(--gold-hi);font:800 13.5px/1.2 var(--display);color:var(--gold-ink)}
.f-learn-s button.on{background:var(--gold);border-color:var(--gold-3d)}
@media (max-width:345px){
.f-us-list{margin:4px 12px 0}
.f-uk{padding:11px 10px 7px}
.f-uk-h{grid-template-columns:36px 1fr auto;gap:8px}
.f-uk-face,.f-uk-face .f-ava,.f-uk-emo{width:36px;height:36px}
.f-uk-b p{font-size:14px}
.f-uk-f{gap:6px}
.f-us-clap{min-width:46px;padding:2px 9px 0}
.f-uk-talk{padding:1px 10px 0}
.f-us-open{padding:2px 10px 0;font-size:13px}
.f-uk-tc{display:none}
}
@media (prefers-reduced-motion:reduce){.f-uk{animation:none}.f-us-clap.done{animation:none}}
.f-us-n.owl{color:var(--brand-2)}
.f-uk-owl{display:grid;place-items:center;width:100%;height:100%;border-radius:50%;background:radial-gradient(circle at 50% 40%,var(--card),var(--brand-soft) 72%);box-shadow:inset 0 0 0 1.5px var(--lav);overflow:hidden;cursor:pointer}
.f-uk-owl .f-owl{width:118%;height:118%;margin-top:9%}
.f-uk-owl .f-owl svg{width:100%;height:100%}
.f-tapface{display:inline-grid;border-radius:50%;cursor:pointer;-webkit-tap-highlight-color:transparent}
.f-tapface:active{transform:scale(.92)}
.f-uk-about{display:flex;align-items:flex-start;gap:9px}
.f-uk-about>span:last-child{flex:1;min-width:0;padding-top:3px}
.f-uk-about .f-ava.s{width:30px;height:30px;font-size:13px;flex:none}
/* The teachers' tools in a line (8 Nov 2026: staff.tsx draws them; here, the teachers' file was full). */
.f-spot-pics{display:flex;flex-wrap:wrap;gap:8px}
.f-thumb.big{width:112px;height:112px}
.f-spot-cut{position:absolute;left:5px;bottom:5px;padding:4px 9px 2px;border-radius:999px;background:rgba(28,26,58,.78);color:#fff;font:800 12.5px/1.2 var(--display)}
.f-spot-warn{font-size:12.5px;line-height:1.4;color:var(--gold-ink)}
.f-spot-l{display:block;margin:12px 0 6px;font:800 12.5px/1 var(--display);color:var(--ink3)}
.f-spot-gs{display:grid;grid-template-columns:repeat(6,1fr);gap:5px}
.f-spot-g{min-height:40px;border-radius:12px;background:var(--brand-soft);color:var(--brand-2);border:1.5px solid var(--lav);font:800 15px/1 var(--display)}
.f-spot-g.on{background:var(--brand);color:#fff;border-color:transparent}
.f-spot-err{margin-top:10px;color:var(--wrong-ink,#c0392b);font-size:13.5px}
.f-spot-go{display:block;width:100%;margin-top:7px;min-height:38px;padding:3px 12px 1px;border-radius:12px;background:var(--gold-soft);border:1.5px dashed var(--gold-hi);color:var(--gold-ink);font:800 13.5px/1.25 var(--display);text-align:left}
.f-spot-done{margin-top:6px;font:800 12.5px/1.3 var(--display);color:var(--ink3)}
.f-save{display:flex;gap:8px;margin-top:7px}
.f-save-b{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:2px 13px 0;border-radius:999px;background:var(--card);border:1.5px solid var(--lav);color:var(--brand-2);font:800 13px/1 var(--display)}
.f-save-b:disabled{opacity:.55}
.f-lb-save{position:absolute;left:0;right:0;bottom:calc(var(--safe-b) + 40px);display:flex;justify-content:center}
.f-lb-save .f-save-b{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.3);color:#fff;min-height:40px;padding:2px 16px 0}
.f-spot-post{width:100%;margin-top:12px}
.f-spot-q,.f-spot-a{margin:8px 0 0;padding:9px 11px 10px;border-radius:14px;display:grid;gap:5px}
.f-spot-q{background:var(--brand-soft)}
.f-spot-a{background:var(--gold-soft);box-shadow:inset 0 0 0 1.5px var(--gold-hi)}
.f-spot-q>b,.f-spot-a>b{font:800 12.5px/1.2 var(--display);color:var(--ink3);letter-spacing:.02em}
.f-spot-a>b{color:var(--gold-ink)}
.f-spot-q p,.f-spot-a p{font-size:14.5px;line-height:1.5;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere}
.f-spot-q .f-pics,.f-spot-a .f-pics{margin-top:2px}
`;

let added = false;
/** Us's style, once (usParts.ts calls it as it loads). */
export function addUsStyle(): void {
  if (added || typeof document === "undefined") return;
  added = true;
  const s = document.createElement("style");
  s.dataset.us = "1";
  s.textContent = CSS;
  document.head.appendChild(s);
}
