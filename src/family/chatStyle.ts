// The chats' own style (8 Nov 2026): it comes with their own file (chatParts.ts), so a phone that never opens Groups or
// Chats carries none of it. A string, attached once. The class names are the chats' own (.c-*); a message itself is the
// talk's (.f-msg*, usStyle.ts). The palette is family.css's (:root).

const CSS = `
.c-hero{padding-bottom:14px}
.c-seg{display:grid;grid-template-columns:1fr 1fr;gap:3px;margin:12px 16px 0;padding:4px;border-radius:16px;background:rgba(255,255,255,.18)}
.c-seg button{position:relative;height:42px;padding-top:2px;border-radius:12px;color:#fff;font:800 15px/1 var(--display)}
.c-seg button.on{background:#fff;color:var(--brand-2);box-shadow:0 2px 0 rgba(0,0,0,.08)}
.c-seg i{position:absolute;top:3px;right:8px;min-width:18px;height:18px;padding:2px 5px 0;border-radius:9px;background:var(--gem);color:#fff;font:800 11px/1.3 var(--display);font-style:normal}
.c-home{margin-top:14px}
.c-home .h-list{margin:0}
.c-sh{display:flex;align-items:center;gap:6px;min-height:32px;margin:20px 2px 0;font:800 15px/1.2 var(--display);color:var(--ink)}
.c-sh span{flex:1;min-width:0}
.c-shb{flex:none;display:inline-flex;align-items:center;gap:4px;height:32px;padding:2px 11px 0;border-radius:999px;background:var(--brand-soft);color:var(--brand-2);font:800 13px/1 var(--display);white-space:nowrap}
.c-shb:active{transform:scale(.96)}
.c-gowl{overflow:hidden}
.c-gowl .f-owl{width:86%}
.c-sh-m{margin:22px 18px 0}
.c-gstrip{display:flex;gap:6px;margin:8px -16px 0;padding:2px 16px 6px;overflow-x:auto;scrollbar-width:none}
.c-gstrip::-webkit-scrollbar{display:none}
.c-gpill{position:relative;flex:none;display:grid;justify-items:center;gap:6px;width:76px;padding:10px 4px 8px;border-radius:16px;background:var(--card);box-shadow:var(--shadow)}
.c-gpill:active{transform:scale(.95)}
.c-gpill b{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:800 12.5px/1.15 var(--display);color:var(--ink)}
.c-gpill .c-un,.c-gpill .c-ro{position:absolute;top:4px;right:4px}
.c-tempty{display:grid;justify-items:center;gap:8px;margin-top:18px;padding:22px 18px;border-radius:20px;background:var(--card);box-shadow:var(--shadow);text-align:center}
.c-tempty b{font:800 17px/1.25 var(--display);color:var(--ink)}
.c-tempty p{margin:0;font-size:14px;line-height:1.55;color:var(--ink2)}
.c-hint{margin:8px 0 0;padding:12px;border-radius:14px;background:var(--card);box-shadow:var(--shadow);font-size:13.5px;line-height:1.5;color:var(--ink2)}
.c-ppl{padding-bottom:8px}
.c-list{margin:12px 16px 0}
.c-tools{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding-bottom:4px}
.c-tools::-webkit-scrollbar{display:none}
.c-new{flex:none;display:inline-flex;align-items:center;gap:6px;height:40px;padding:2px 14px 0;font-size:14px}
.c-rows{list-style:none;margin:10px 0 0;padding:0;border-radius:18px;background:var(--card);box-shadow:var(--shadow);overflow:hidden}
.c-scr .c-rows{margin:12px 16px 0}
.c-rows li+li{border-top:1px solid var(--line)}
.c-row{display:grid;grid-template-columns:46px 1fr auto;align-items:center;gap:10px;width:100%;min-height:68px;padding:8px 12px;text-align:left}
.c-row:active{background:var(--bg)}
.c-row-w{display:grid;gap:3px;min-width:0}
.c-row-w b{display:flex;align-items:center;gap:5px;overflow:hidden;white-space:nowrap;font:800 15.5px/1.2 var(--display);color:var(--ink)}
.c-row-w small{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:13.5px;color:var(--ink2)}
.c-row.new .c-row-w small{color:var(--ink);font-weight:700}
.c-row-r{display:grid;justify-items:end;gap:4px}
.c-row-r small{font-size:12px;color:var(--ink3)}
.c-row.new .c-row-r small{color:var(--gem-2);font-weight:800}
.c-un{min-width:22px;height:22px;padding:3px 6px 0;border-radius:11px;background:var(--gem);color:#fff;font:800 12px/1.3 var(--display);font-style:normal;text-align:center;animation:f-pop .3s}
.c-blk,.c-ro{font-style:normal;font-size:13px}
.c-gface{display:grid;place-items:center;width:46px;height:46px;border-radius:16px;background:linear-gradient(135deg,var(--brand-soft),#fff);box-shadow:0 0 0 1.5px var(--lav);font-size:24px}
.c-gface.grade{background:linear-gradient(135deg,#7a6bf0,var(--brand));box-shadow:0 3px 0 var(--brand-3);color:#fff;font:800 20px/1 var(--display)}
.c-dface .f-ava{width:46px;height:46px}
.c-dface.tch .f-ava{box-shadow:0 0 0 2.5px var(--gold)}
.c-safe{margin:12px 16px 0;padding:10px 12px;border-radius:14px;background:var(--brand-soft);font-size:13px;line-height:1.5;color:var(--ink2)}
.c-list .c-safe{margin:12px 0 0}
.c-scr{padding-bottom:130px}
.c-room .f-msgs{margin:4px 16px 0 22px}
.c-head .f-toprow{gap:8px}
.c-head-w{display:flex;align-items:center;gap:10px;min-width:0;text-align:left;color:#fff}
.c-head-w:disabled{opacity:1}
.c-head-w>span{display:grid;min-width:0}
.c-head-w b{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:800 17px/1.2 var(--display)}
.c-head-w small{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12.5px;opacity:.88}
.c-head-w .c-gface{width:40px;height:40px;border-radius:14px;font-size:20px}
.c-head-w .f-ava{width:40px;height:40px}
.c-day{display:flex;justify-content:center;margin:16px 0 2px}
.c-day span{padding:4px 12px 2px;border-radius:999px;background:var(--lav);font:800 12px/1.2 var(--display);color:var(--ink2)}
.c-msgs .f-msg.cont{margin-top:3px}
.c-msgs .f-msg.cont>.f-msg-ava{visibility:hidden;height:0}
.c-msgs .f-msg.cont .f-msg-h{display:none}
.c-msgs .f-msg.mine{grid-template-columns:1fr;margin-left:44px}
.c-msgs .f-msg.mine>.f-msg-ava,.c-msgs .f-msg.mine .f-msg-h b{display:none}
.c-msgs .f-msg.mine .f-msg-w{display:flex;flex-direction:column;align-items:flex-end}
.c-msgs .f-msg.mine .f-msg-h{justify-content:flex-end}
.c-msgs .f-msg.mine .f-msg-b{border-radius:16px 4px 16px 16px;background:linear-gradient(160deg,#7d6ff2,var(--brand) 70%);box-shadow:0 4px 12px -6px rgba(76,60,210,.7)}
.c-msgs .f-msg.mine .f-msg-t{color:#fff}
.c-msgs .f-msg.mine .f-at{background:rgba(255,255,255,.22);color:#fff}
.c-msgs .f-msg.mine .f-msg-q{border-left:0;border-right:3px solid var(--brand);border-radius:12px 4px 4px 12px;text-align:right;align-items:flex-end}
.c-msgs .f-msg.mine .f-rxs{justify-content:flex-end}
.c-msgs .f-msg.mine.cont>.f-msg-ava{display:none}
.c-more{display:block;margin:12px auto 0}
.c-cant{position:fixed;left:50%;bottom:0;width:min(100%,520px);transform:translateX(-50%);padding:14px 16px calc(14px + var(--safe-b));border-radius:22px 22px 0 0;background:#fff;box-shadow:0 -8px 26px -14px rgba(40,30,110,.42);text-align:center;font-size:14px;line-height:1.45;color:var(--ink2)}
.c-rule{margin:12px 16px 0;padding:10px 12px;border-radius:14px;background:var(--gold-soft);color:var(--gold-ink);font-size:13.5px;line-height:1.5}
.c-find{margin:12px 16px 0}
.c-find input,.c-gname{width:100%;height:46px;padding:2px 14px 0;border-radius:14px;border:1.5px solid var(--line-2);background:#fff;font:600 15px/1 var(--text);color:var(--ink)}
.c-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:10px 16px 0;padding:2px 2px 4px}
.c-chips::-webkit-scrollbar{display:none}
.c-chips button{flex:none;min-width:40px;height:36px;padding:2px 12px 0;border-radius:12px;background:var(--card);box-shadow:0 0 0 1.5px var(--line-2);font:800 14px/1 var(--display);color:var(--ink2)}
.c-chips button.on{background:var(--brand);box-shadow:none;color:#fff}
.c-people{list-style:none;margin:6px 16px 0;padding:0}
.c-people li{display:flex;align-items:center;gap:6px;border-bottom:1px solid var(--line)}
.c-people li.me{background:linear-gradient(90deg,var(--brand-soft),transparent)}
.c-people li.c-ph{display:block;border:0;padding:18px 4px 4px;font:800 13px/1 var(--display);color:var(--ink3)}
.c-pp{flex:1;display:flex;align-items:center;gap:10px;min-width:0;min-height:54px;text-align:left}
.c-pp:disabled{opacity:1}
.c-pp b{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:800 15px/1.2 var(--display);color:var(--ink)}
.c-you{padding:2px 7px 0;border-radius:6px;background:var(--lav);font:800 11px/1.3 var(--display);font-style:normal;color:var(--ink2)}
.c-dm{flex:none;width:44px;height:44px;border-radius:50%;background:var(--brand-soft);font-size:20px}
.c-dm:active{transform:scale(.9)}
.c-emos{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-top:10px}
.c-emos button{height:44px;border-radius:12px;background:var(--bg);font-size:22px}
.c-emos button.on{background:var(--brand-soft);box-shadow:0 0 0 2px var(--brand)}
.c-lab{margin:14px 0 6px;font:800 13.5px/1.2 var(--display);color:var(--ink2)}
.c-gsheet .c-chips{margin:0}
.c-picked{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.c-picked button{height:32px;padding:2px 10px 0;border-radius:999px;background:var(--brand-soft);font:800 13px/1 var(--display);color:var(--brand-2)}
.c-found{list-style:none;margin:6px 0 0;padding:0}
.c-found button{display:flex;align-items:center;gap:6px;width:100%;height:40px;padding:0 6px;font:700 14px/1 var(--display);color:var(--ink)}
.c-ro-l{display:flex;align-items:center;gap:10px;margin:14px 0 4px;font-size:14px;color:var(--ink)}
.c-ro-l input{width:22px;height:22px;accent-color:var(--brand)}
/* Online explanations (12 Nov 2026, help.tsx): the list on top of Chats, a thread's question card, the pill's sheet, a voice note. */
.h-list{margin:10px 0 14px}
.h-list-h{margin:0 2px 6px;font:800 15px/1.2 var(--display);color:var(--ink)}
.h-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px 2px 4px}
.h-chips::-webkit-scrollbar{display:none}
.h-chips button{flex:none;height:34px;padding:2px 12px 0;border-radius:12px;background:var(--card);box-shadow:0 0 0 1.5px var(--line-2);font:800 13.5px/1 var(--display);color:var(--ink2);white-space:nowrap}
.h-chips button.on{background:var(--brand);box-shadow:none;color:#fff}
.h-chips i{font-style:normal;opacity:.75}
.h-chips.sub button{height:30px;font-size:12.5px;border-radius:10px}
.h-list .c-rows{margin-top:6px}
.h-late{font-style:normal;font-size:13px}
.h-none{margin:8px 2px;font-size:13.5px;color:var(--ink3)}
.h-top{margin:8px 6px 0;padding:10px 8px;border-radius:16px;background:var(--card);box-shadow:var(--shadow)}
.h-top-h{display:flex;align-items:center;gap:10px}
.h-top-h p{flex:1;display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;margin:0;min-width:0}
.h-top-h b{font:800 22px/1 var(--display);color:var(--brand-2)}
.h-top-h span{font:800 13px/1.2 var(--display);color:var(--ink2)}
.h-top-h small{flex-basis:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:13px;color:var(--ink3)}
.h-showq{flex:none;height:34px;padding:2px 12px 0;border-radius:12px;background:var(--brand-soft);font:800 13.5px/1 var(--display);color:var(--brand-2)}
.h-showq.on{background:var(--brand);color:#fff}
.h-paper{margin:8px -6px 0;border-radius:10px;overflow:hidden}
.h-key{margin:8px 0 0;padding:8px 10px;border-radius:12px;background:var(--right-soft);font-size:14px;line-height:1.5;color:var(--right-ink)}
.h-asks{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:6px}
.h-asks li{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:8px 10px;border-radius:14px;background:var(--bg)}
.h-asks li.done{opacity:.72}
.h-who{display:flex;align-items:center;gap:6px;min-width:0;text-align:left}
.h-who:disabled{opacity:1}
.h-who b{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:140px;font:800 14.5px/1.2 var(--display);color:var(--ink)}
.h-asks em{font:800 13px/1 var(--display);font-style:normal;color:var(--wrong-ink)}
.h-asks li.sel{box-shadow:0 0 0 2.5px var(--brand)}
.h-asks li.und{background:var(--right-soft);box-shadow:0 0 0 2px var(--right)}
.h-asks .h-who{order:1}.h-asks em{order:2}.h-dots{order:3;margin-left:auto}.h-brk{order:4;flex-basis:100%;height:0}.h-asks .h-st{order:5;min-width:0}.h-ub{order:6}
.h-ub{flex:none;height:36px;padding:2px 10px 0;border-radius:12px;background:var(--card);box-shadow:0 0 0 1.5px var(--line-2);font:800 13px/1 var(--display);color:var(--brand-2)}
.h-ub.on{background:var(--brand);box-shadow:none;color:#fff}
.h-ub:disabled{opacity:.45}
.h-whose{margin:10px 2px 0;font:800 12.5px/1.2 var(--display);color:var(--brand-2)}
.h-ans{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:4px 0 12px}
.h-plist{margin-top:8px;padding:10px 10px 2px;border-radius:12px;background:var(--bg)}
.h-al{flex:none;min-width:20px;font:800 13px/1 var(--display);color:var(--ink2)}
.h-a{display:inline-flex;flex-wrap:wrap;align-items:center;gap:5px;min-height:30px;padding:3px 10px 1px;border-radius:10px;font:700 15px/1.3 var(--text)}
.h-k{display:inline-block;max-width:100%;padding:5px 10px 3px;border-radius:10px;font:500 15px/1.45 var(--text);overflow-wrap:anywhere}
.h-ai,.h-kt{font:800 12px/1 var(--display);font-style:normal}
.h-aph{flex-basis:100%;max-width:180px}
.h-anote{flex-basis:100%;font-size:13px;color:var(--ink2)}
.h-a.ok{background:var(--right-soft);color:var(--right-ink);box-shadow:0 0 0 1.5px var(--right)}
.h-a.no{background:var(--wrong-soft);color:var(--wrong-ink);box-shadow:0 0 0 1.5px var(--wrong)}
.h-a.tch{background:var(--lav);color:var(--ink2)}
.h-say{white-space:pre-wrap;overflow-wrap:anywhere;font-weight:600;max-width:100%}
.h-amk{flex-basis:100%;font:800 12.5px/1.2 var(--display);color:var(--ink2)}
.h-k{background:var(--card);box-shadow:0 0 0 1.5px var(--line-2);color:var(--ink)}
.h-kt{margin-right:2px;color:var(--ink3)}
.h-st{flex:1;font-size:12.5px;color:var(--ink2)}
.h-asks li.open .h-st{color:var(--gold-ink);font-weight:700}
.h-dots,.h-more{font:800 22px/1 var(--display)}
.h-dots{flex:none;width:40px;height:40px;border-radius:50%;background:var(--card);color:var(--ink2)}
.h-others{margin:6px 2px 0;font-size:12.5px;color:var(--ink3)}
.h-wait{margin:10px 2px 0;font-size:13.5px;line-height:1.5;color:var(--ink2)}
.h-wait .f-btn{display:inline-flex;align-items:center;gap:6px;width:100%;justify-content:center}
.h-wait p{margin:0 0 8px}
.h-wait .f-btn+.f-btn,.h-wait .f-btn+p{margin-top:8px}
.h-und{padding:8px 10px;border-radius:12px;background:var(--right-soft);color:var(--right-ink);font-weight:700}
.h-asktag{background:var(--gold-soft)!important;color:var(--gold-ink)!important}
.h-hid{margin:0;font-size:13px;color:var(--ink3)}
.h-link{display:block;margin-top:6px;padding:8px 10px;border-radius:12px;background:var(--brand-soft);font:800 13.5px/1.3 var(--display);color:var(--brand-2);text-decoration:none;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.h-step{display:flex;align-items:center;gap:8px;margin:14px 0 8px;font:800 15px/1.3 var(--display);color:var(--ink)}
.h-step b{display:grid;place-items:center;width:24px;height:24px;padding-top:2px;border-radius:50%;background:var(--brand);color:#fff;font-size:13px}
.h-pics{display:flex;gap:8px;flex-wrap:wrap}
.h-tch{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.h-tch button{display:flex;align-items:center;gap:8px;width:100%;min-height:48px;padding:6px 10px;border-radius:14px;background:var(--bg);box-shadow:0 0 0 1.5px var(--line-2);text-align:left}
.h-tch button.on{background:var(--brand-soft);box-shadow:0 0 0 2.5px var(--brand)}
.h-tch b{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:800 14.5px/1.2 var(--display);color:var(--ink)}
.h-fixed{margin:0;padding:10px 12px;border-radius:14px;background:var(--brand-soft);font-size:14px;line-height:1.5;color:var(--ink2)}
.h-told{margin:14px 0 0;padding:10px 12px;border-radius:14px;background:var(--gold-soft);font-size:13px;line-height:1.5;color:var(--gold-ink)}
.h-go{width:100%;margin-top:12px}
.h-left{margin:8px 0 0;text-align:center;font-size:12.5px;color:var(--ink3)}
.h-menu .h-mi{display:block;width:100%;min-height:50px;margin-top:8px;padding:4px 14px 0;border-radius:14px;background:var(--bg);box-shadow:0 0 0 1.5px var(--line-2);font:800 15px/1.3 var(--display);color:var(--ink);text-align:left}
.h-menu .h-mi.go{background:var(--brand);box-shadow:0 3px 0 var(--brand-3);color:#fff}
.h-menu .h-mi.warn{color:var(--gold-ink);background:var(--gold-soft);box-shadow:none}
.h-menu .h-mi:disabled{opacity:.45}
.h-note{margin:12px 2px 0;font-size:13px;color:var(--ink3)}
.h-mic{display:inline-flex;align-items:center;gap:6px;height:36px;margin:0 0 8px;padding:2px 14px 0;border-radius:18px;background:var(--brand-soft);font:800 14px/1 var(--display);color:var(--brand-2)}
.h-rec{display:flex;align-items:center;gap:8px;margin:0 0 8px;padding:8px 10px;border-radius:16px;background:var(--bg)}
.h-rec b{font:800 16px/1 var(--display);color:var(--ink)}
.h-rec b small{font-size:12px;color:var(--ink3)}
.h-rec audio{flex:1;min-width:0;height:36px}
.h-dot{flex:none;width:12px;height:12px;border-radius:50%;background:var(--wrong);animation:h-blink 1s infinite}
@keyframes h-blink{50%{opacity:.25}}
.h-rb{flex:none;display:inline-flex;align-items:center;justify-content:center;min-width:40px;height:40px;padding:2px 12px 0;border-radius:14px;background:var(--card);box-shadow:0 0 0 1.5px var(--line-2);font:800 14px/1 var(--display);color:var(--ink2)}
.h-rb.stop{background:var(--wrong);box-shadow:none;color:#fff}
.h-rb.go{background:var(--brand);box-shadow:0 3px 0 var(--brand-3);color:#fff}
.h-voice{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:200px;margin-top:4px}
.h-play{flex:none;width:40px;height:40px;padding-top:2px;border-radius:50%;background:var(--brand);color:#fff;font:800 14px/1 var(--display)}
.h-bar{flex:1;height:6px;border-radius:3px;background:var(--lav);overflow:hidden}
.h-bar i{display:block;height:100%;border-radius:3px;background:var(--brand);transition:width .25s linear}
.h-voice small{font:800 12.5px/1 var(--display);color:var(--ink2)}
.h-bad{flex-basis:100%;margin:0;font-size:12.5px;color:var(--wrong-ink)}
.c-msgs .f-msg.mine .h-voice small{color:#fff}
.c-msgs .f-msg.mine .h-play{background:#fff;color:var(--brand)}
`;

let added = false;

export function addChatStyle(): void {
  if (added || typeof document === "undefined") return;
  added = true;
  const s = document.createElement("style");
  s.dataset.chat = "1";
  s.textContent = CSS;
  document.head.appendChild(s);
}
