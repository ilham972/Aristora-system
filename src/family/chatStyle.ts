// The chats' own style (8 Nov 2026): it comes with their own file (chatParts.ts), so a phone that never opens Groups or
// Chats carries none of it. A string, attached once. The class names are the chats' own (.c-*); a message itself is the
// talk's (.f-msg*, usStyle.ts). The palette is family.css's (:root).

const CSS = `
.f-hero.us.c-hero{padding-bottom:12px;border-radius:0 0 24px 24px}
.c-segs{position:relative;display:flex;gap:8px;margin-top:10px}
.c-seg,.c-segs .h-scope{display:flex;gap:2px;padding:3px;border-radius:12px;background:rgba(255,255,255,.16)}
.c-seg{flex:1}
.c-seg button,.c-segs .h-scope button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:2px 12px 0;border-radius:9px;color:#fff;font:700 14px/1 var(--display);transition:background-color .15s,color .15s}
.c-seg button.on,.c-segs .h-scope button.on{background:var(--card);color:var(--brand-2)}
.c-segs .h-scope button:disabled{opacity:.45}
.c-seg i{min-width:18px;height:18px;padding:2px 5px 0;border-radius:9px;background:var(--gem);color:#fff;font:700 11px/1.3 var(--display);font-style:normal}
.c-home{margin-top:12px}
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
.c-gface{display:grid;place-items:center;width:46px;height:46px;border-radius:16px;background:linear-gradient(135deg,var(--brand-soft),var(--card));box-shadow:0 0 0 1.5px var(--lav);font-size:24px}
.c-gface.grade{background:linear-gradient(135deg,#7a6bf0,var(--brand));box-shadow:0 3px 0 var(--brand-3);color:#fff;font:800 20px/1 var(--display)}
.c-dface .f-ava{width:46px;height:46px}
.c-dface.tch .f-ava{box-shadow:0 0 0 2.5px var(--gold)}
.c-safe{margin:12px 16px 0;padding:10px 12px;border-radius:14px;background:var(--brand-soft);font-size:13px;line-height:1.5;color:var(--ink2)}
.c-list .c-safe{margin:12px 0 0}
.c-scr{padding-bottom:130px}
.c-room .f-msgs{margin:4px 16px 0 22px}
.f-hero.us.c-head{position:sticky;top:0;z-index:20;padding-bottom:10px;border-radius:0 0 18px 18px}
.c-head::before,.c-head::after{display:none}
.c-head .f-toprow{gap:8px}
.c-head-w{display:flex;align-items:center;gap:10px;min-width:0;text-align:left;color:#fff}
.c-head-w:disabled{opacity:1}
.c-head-w>span{display:grid;min-width:0}
.c-head-w b{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:700 17px/1.2 var(--display)}
.c-head-w small{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12.5px;opacity:.88}
.c-head-w .c-gface{width:40px;height:40px;border-radius:12px;font-size:20px}
.c-head-w .f-ava{width:40px;height:40px}
.c-head-w.two b{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal;font-size:16px;line-height:1.25}
.c-who{display:flex;align-items:center;gap:8px;margin:4px 0 0 48px}
.c-who .c-moon{width:34px;height:34px}
.c-faces{display:flex;align-items:center;min-height:30px;padding:0 2px}
.c-faces .f-ava{width:28px;height:28px;margin-left:-7px;box-shadow:0 0 0 2px #5f4fe0;font-size:12px}
.c-faces .f-ava:first-child{margin-left:0}
.c-faces i{margin-left:5px;font:700 12.5px/1 var(--display);font-style:normal;color:#fff}
.c-add{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.2);color:#fff}
.c-add:active,.c-faces:active{transform:scale(.95)}
.h-pl{list-style:none;margin:4px 0 0;padding:0}
.h-pl li{display:flex;align-items:center;gap:10px;min-height:54px;border-bottom:1px solid var(--line)}
.h-pl li:last-child{border-bottom:0}
.h-pl li.off{opacity:.6}
.h-pl li.to b{color:var(--brand-2)}
.h-pw{flex:1;min-width:0;display:flex;align-items:center;gap:10px;padding:6px 0;text-align:left}
.h-pw .f-ava{flex:none;width:36px;height:36px}
.h-pw b{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:700 15px/1.2 var(--display);color:var(--ink)}
.h-pw small{flex:none;margin-left:auto;padding-left:6px;font:600 12.5px/1.2 var(--display);color:var(--ink3)}
.h-pa{flex:none;height:34px;padding:2px 14px 0;border-radius:10px;background:var(--bg);font:700 13.5px/1 var(--display);color:var(--brand-2)}
.h-pa.no{color:var(--wrong-ink)}
.h-padd{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:12px}
.c-day{display:flex;justify-content:center;margin:16px 0 2px}
.c-day span{padding:4px 12px 2px;border-radius:999px;background:var(--lav);font:800 12px/1.2 var(--display);color:var(--ink2)}
.c-msgs .f-msg.cont{margin-top:3px}
.c-msgs .f-msg.cont>.f-msg-ava{visibility:hidden;height:0}
.c-msgs .f-msg.cont .f-msg-h{display:none}
.c-msgs .f-msg.mine{grid-template-columns:1fr;margin-left:44px}
.c-msgs .f-msg.mine>.f-msg-ava,.c-msgs .f-msg.mine .f-msg-h b{display:none}
.c-msgs .f-msg.mine .f-msg-w{display:flex;flex-direction:column;align-items:flex-end}
.c-msgs .f-msg.mine .f-msg-h{justify-content:flex-end}
.c-msgs .f-msg-b{box-shadow:0 0 0 1px var(--line)}
.c-msgs .f-msg.tch .f-msg-b{background:var(--brand-soft);box-shadow:none}
.c-msgs .f-msg-h{font-weight:700}
.c-msgs .f-msg-tag:not(.h-asktag){background:var(--lav);color:var(--brand-2)}
.c-msgs .f-msg.acts>.f-msg-w>.f-msg-b{box-shadow:0 0 0 2px var(--brand-mid)}
.c-msgs .f-msg-a{min-height:30px}
.c-room .f-tb-go{background:var(--brand);box-shadow:none}
.c-msgs .f-msg.mine .f-msg-b{border-radius:16px 4px 16px 16px;background:var(--brand);box-shadow:none}
.c-msgs .f-msg.mine.acts .f-msg-b{box-shadow:0 0 0 2px var(--brand-mid)}
.c-msgs .f-msg.mine .f-msg-t{color:#fff}
.c-msgs .f-msg.mine .f-at{background:rgba(255,255,255,.22);color:#fff}
.c-msgs .f-msg.mine .f-msg-q{border-left:0;border-right:3px solid var(--brand);border-radius:12px 4px 4px 12px;text-align:right;align-items:flex-end}
.c-msgs .f-msg.mine .f-rxs{justify-content:flex-end}
.c-msgs .f-msg.mine.cont>.f-msg-ava{display:none}
.c-msgs .f-msg.ai{grid-template-columns:1fr;margin-left:-6px}
.c-msgs .f-msg.ai>.f-msg-ava{display:none}
.c-msgs .f-msg.ai .f-msg-w{display:block}
.c-msgs .f-msg.ai .f-rxs{justify-content:flex-start}
.c-msgs .f-msg.ai .f-msg-h{display:flex;justify-content:flex-start;gap:7px;margin-bottom:6px;font:600 12.5px/1.2 var(--display);color:rgba(238,241,251,.7)}
.c-msgs .f-msg.ai .f-msg-h b{display:inline;color:#fff;font-weight:700}
.c-msgs .f-msg.ai .f-msg-h small{color:rgba(238,241,251,.6)}
.c-msgs .f-msg.ai .f-msg-b{display:block;margin:0;padding:0;border-radius:0;background:none!important;box-shadow:none!important}
.c-msgs .f-msg.ai .f-msg-t{font-size:16px;line-height:1.65;color:#eef1fb}
.c-msgs .f-msg.ai.acts .f-msg-card{box-shadow:0 0 0 3px var(--brand-mid)}
.c-more{display:block;margin:12px auto 0}
.c-cant{position:fixed;left:50%;bottom:0;width:min(100%,520px);transform:translateX(-50%);padding:14px 16px calc(14px + var(--safe-b));border-radius:22px 22px 0 0;background:var(--card);box-shadow:0 -8px 26px -14px rgba(40,30,110,.42);text-align:center;font-size:14px;line-height:1.45;color:var(--ink2)}
.c-rule{margin:12px 16px 0;padding:10px 12px;border-radius:14px;background:var(--gold-soft);color:var(--gold-ink);font-size:13.5px;line-height:1.5}
.c-find{margin:12px 16px 0}
.c-find input,.c-gname{width:100%;height:46px;padding:2px 14px 0;border-radius:14px;border:1.5px solid var(--line-2);background:var(--card);font:600 15px/1 var(--text);color:var(--ink)}
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
.h-pipe{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px;padding:3px;border-radius:14px;background:var(--card);box-shadow:0 0 0 1px var(--line)}
.h-pipe button{position:relative;display:grid;justify-items:center;gap:2px;min-width:0;padding:6px 1px 5px;border-radius:11px;color:var(--ink2);transition:background-color .15s,color .15s}
.h-pipe b{display:flex;align-items:center;gap:5px;font:700 15px/1 var(--display);color:var(--ink);font-variant-numeric:tabular-nums}
.h-pipe b::before,.h-say1::before,.h-cw::before,.h-st::before{content:"";flex:none;display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--tone,var(--ink3))}
.h-pipe small{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:600 12px/1.2 var(--display)}
:is(.h-pipe,.h-asks,.h-sel,.h-row).pend,:is(.h-pipe,.h-asks) .pend{--tone:var(--wrong)}
:is(.h-pipe,.h-asks,.h-sel,.h-row).fol,:is(.h-pipe,.h-asks) .fol{--tone:var(--gold)}
:is(.h-pipe,.h-asks,.h-sel,.h-row).und,:is(.h-pipe,.h-asks) .und{--tone:var(--right)}
.h-pipe .zero b{color:var(--ink3)}
.h-pipe .zero b::before{background:var(--line-2)}
.h-pipe button.on,.h-pipe button.on b{background:var(--brand-soft);color:var(--brand-2)}
.h-pipe i{position:absolute;top:3px;right:3px;min-width:16px;height:16px;padding:1px 4px 0;border-radius:8px;background:var(--wrong);color:#fff;font:700 10.5px/1.4 var(--display);font-style:normal;text-align:center}
.h-body{display:grid;grid-template-columns:48px minmax(0,1fr);gap:8px;align-items:start;margin:10px 0 0 -16px}
.h-rail{position:sticky;top:8px;display:grid;gap:6px;max-height:calc(100vh - 120px);overflow-y:auto;scrollbar-width:none;padding:6px 2px 10px;border-radius:0 14px 14px 0;background:var(--card);box-shadow:0 0 0 1px var(--line)}
.h-rail::-webkit-scrollbar{display:none}
.h-ri{position:relative;display:grid;justify-items:center;gap:3px;min-width:0;padding:2px 0}
.h-ri .f-ava,.h-rf{width:32px;height:32px;border-radius:50%;font-size:14px}
.h-rf{display:grid;place-items:center;background:var(--bg);color:var(--ink2)}
.h-rf.st{border-radius:10px;background:var(--brand-soft);color:var(--brand-2);font:700 15px/1 var(--display)}
.h-ri.on .f-ava,.h-ri.on .h-rf{box-shadow:0 0 0 2px var(--card),0 0 0 4px var(--brand)}
.h-ri.on::before{content:"";position:absolute;left:-2px;top:6px;width:3px;height:22px;border-radius:0 3px 3px 0;background:var(--brand)}
.h-ri small{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:600 10.5px/1.15 var(--display);color:var(--ink2)}
.h-ri.on small{color:var(--brand-2)}
.h-ri.zero{opacity:.5}
.h-ri i{position:absolute;top:-2px;right:2px;min-width:16px;height:16px;padding:1px 4px 0;border-radius:8px;background:var(--ink3);box-shadow:0 0 0 2px var(--card);color:#fff;font:700 10px/1.5 var(--display);font-style:normal;text-align:center}
.h-ri i.hot{background:var(--wrong)}
.h-ri:active{transform:scale(.96)}
.h-main{min-width:0}
.h-main .c-rows{margin:0;border-radius:14px;box-shadow:0 0 0 1px var(--line)}
.h-main .c-row{grid-template-columns:36px minmax(0,1fr) auto;gap:10px;min-height:0;padding:10px 12px 10px 10px}
.h-row .c-row-w{gap:1px}
.h-row .c-row-w b{font:700 14.5px/1.25 var(--display)}
.h-row .c-row-w small,.h-row.new .c-row-w small{font-weight:400;font-size:12.5px;color:var(--ink3)}
.h-row.new .c-row-r small{color:var(--brand-2);font-weight:600}
.h-say1{display:flex!important;align-items:baseline;gap:6px;margin-top:2px;white-space:normal!important;font:600 13px/1.3 var(--display)!important;color:var(--ink2)!important}
.h-say1::before{transform:translateY(-1px)}
.h-row.hot .h-say1{color:var(--wrong-ink)!important}
.h-row.und.hot .h-say1{color:var(--right-ink)!important}
.h-new{width:8px;height:8px;border-radius:50%;background:var(--brand)}
.h-faces{position:relative;display:block;width:36px;height:36px}
.h-faces .f-ava{position:absolute;width:36px;height:36px;font-size:15px}
.h-faces.n2 .f-ava,.h-faces.n3 .f-ava{width:24px;height:24px;font-size:11px;box-shadow:0 0 0 2px var(--card)}
.h-faces.n3 .f-ava{width:21px;height:21px;font-size:10px}
.h-faces .f-ava:nth-child(1){z-index:3;left:0;top:0}.h-faces .f-ava:nth-child(2){z-index:2}
.h-faces.n2 .f-ava:nth-child(2){left:12px;top:12px}
.h-faces.n3 .f-ava:nth-child(2){left:15px;top:0}.h-faces.n3 .f-ava:nth-child(3){left:8px;top:15px}
.h-many{flex:none;display:inline-flex;align-items:center;gap:2px;padding:1px 6px 0;border-radius:6px;background:var(--bg);font:600 11.5px/1.4 var(--display);font-style:normal;color:var(--ink2)}
.h-cut{margin:0;padding:8px 12px 4px;background:var(--bg);font:600 12px/1.2 var(--display);color:var(--ink3)}
.h-late{display:inline-flex;font-style:normal;color:var(--wrong-ink)}
.h-none{margin:8px 2px;font-size:13.5px;color:var(--ink3)}
.h-top{margin:8px 6px 0;padding:10px 8px;border-radius:16px;background:var(--card);box-shadow:0 0 0 1px var(--line)}
.h-top-h{margin:0;padding-left:2px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:600 13.5px/1.3 var(--display);color:var(--ink2)}
.h-paper{margin:8px -6px 0;border-radius:10px;overflow:hidden}
.h-key{margin:8px 0 0;padding:8px 10px;border-radius:12px;background:var(--right-soft);font-size:14px;line-height:1.5;color:var(--right-ink)}
.h-asks{list-style:none;display:flex;gap:6px;margin:10px -8px 0;padding:3px 8px 4px;overflow-x:auto;scrollbar-width:none;scroll-snap-type:x proximity}
.h-asks::-webkit-scrollbar{display:none}
.h-asks li{flex:none;scroll-snap-align:center;border-radius:12px;background:var(--bg)}
.h-asks li.done,.h-asks li.skip{opacity:.62}
.h-asks li.sel{opacity:1;background:var(--card);box-shadow:0 0 0 2px var(--brand)}
.h-who{display:flex;align-items:center;gap:8px;max-width:180px;padding:6px 10px 6px 6px;text-align:left}
.h-who:active{transform:scale(.97)}
.h-who .f-ava{flex:none;width:30px;height:30px}
.h-wt{display:grid;min-width:0}
.h-who b{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:700 13.5px/1.2 var(--display);color:var(--ink)}
.h-cw{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:600 11.5px/1.3 var(--display);color:var(--ink2)}
.h-cw::before,.h-st::before{width:6px;height:6px;margin-right:5px;vertical-align:1px}
.h-asks li.pend .h-cw,.h-asks li.rp .h-cw{color:var(--wrong-ink)}.h-asks li.und .h-cw{color:var(--right-ink)}
.h-asks em{flex:none;font:700 12px/1 var(--display);font-style:normal;color:var(--wrong-ink);font-variant-numeric:tabular-nums}
.h-nav{display:flex;align-items:center;gap:6px;margin:8px 0 0}
.h-pn{flex:none;display:grid;place-items:center;width:32px;height:32px;padding-bottom:2px;border-radius:9px;background:var(--bg);font:700 20px/1 var(--display);color:var(--ink2)}
.h-pn:active{transform:scale(.94)}
.h-sel{display:flex;align-items:center;gap:6px;margin:8px 0 0;padding:4px 4px 4px 10px;border-radius:12px;background:var(--bg)}
.h-sel.und{background:var(--right-soft)}
.h-ub{flex:none;height:32px;padding:2px 10px 0;border-radius:9px;background:var(--card);box-shadow:0 0 0 1px var(--line-2);font:700 13px/1 var(--display);color:var(--brand-2)}
.h-ub.on{background:var(--brand);box-shadow:none;color:#fff}
.h-ub:disabled{opacity:.45}
.h-whose{flex:1;min-width:0;margin:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:center;font:600 13px/1.2 var(--display);color:var(--ink)}
.h-whose small{font-size:12px;color:var(--ink3);font-variant-numeric:tabular-nums}
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
.h-pm{flex:none;margin-left:2px;padding:1px 6px 0;border-radius:8px;background:rgba(255,255,255,.7);font:800 12.5px/1.3 var(--display);font-style:normal}
.h-amk{flex-basis:100%;font:800 12.5px/1.2 var(--display);color:var(--ink2)}
.h-k{background:var(--card);box-shadow:0 0 0 1.5px var(--line-2);color:var(--ink)}
.h-kt{margin-right:2px;color:var(--ink3)}
.h-st{flex:1;min-width:0;font:600 12.5px/1.35 var(--display);color:var(--ink2)}
.h-sel.und .h-st{color:var(--right-ink)}
.h-dots,.h-more{font:700 22px/1 var(--display)}
.h-dots{flex:none;width:32px;height:32px;border-radius:9px;color:var(--ink2)}
.h-wait{margin:10px 2px 0;font-size:13.5px;line-height:1.5;color:var(--ink2)}
p.h-wait{margin-top:8px;font-size:13px}
p.h-wait.late{color:var(--wrong-ink)}
.h-wait .f-btn{display:inline-flex;align-items:center;gap:6px;width:100%;justify-content:center}
.h-wait p{margin:0 0 8px}
.h-wait .f-btn+.f-btn,.h-wait .f-btn+p{margin-top:8px}
.h-und{padding:8px 10px;border-radius:12px;background:var(--right-soft);color:var(--right-ink);font-weight:700}
.h-asktag{display:inline-flex;align-items:center;gap:3px;background:var(--gold-soft)!important;color:var(--gold-ink)!important;white-space:nowrap}
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

.h-aix .h-aix-note{display:block;width:100%;margin-top:4px;padding:10px 12px;border-radius:14px;border:0;box-shadow:0 0 0 1.5px var(--line-2);background:var(--bg);font-family:inherit;font-size:15px;line-height:1.4;color:var(--ink);resize:none}
.h-aix .h-aix-st{margin:0 0 6px;padding:8px 12px;border-radius:12px;background:var(--brand-soft,#efecff);font:700 14px/1.35 var(--display);color:var(--ink)}
.h-aix .h-aix-st.no{background:var(--gold-soft);color:var(--gold-ink)}
.h-note{margin:12px 2px 0;font-size:13px;color:var(--ink3)}
.h-rec{display:flex;align-items:center;gap:8px;min-height:44px;padding-left:14px;border-radius:22px;background:var(--bg)}
.h-rec.ready,.h-rec.busy{padding-left:4px}
.h-rec b{font:700 16px/1 var(--display);color:var(--ink);font-variant-numeric:tabular-nums}
.h-rec b small{font-size:12px;color:var(--ink3)}
.h-rec audio{flex:1;min-width:0;height:40px}
.h-dot{flex:none;width:12px;height:12px;border-radius:50%;background:var(--wrong);animation:h-blink 1s infinite}
@keyframes h-blink{50%{opacity:.25}}
.h-rb{flex:none;display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:44px;padding:2px 14px 0;border-radius:22px;background:var(--card);box-shadow:0 0 0 1px var(--line-2);font:700 14px/1 var(--display);color:var(--ink2)}
.h-rb.stop{background:var(--wrong);box-shadow:none;color:#fff}
.h-rb.go{background:var(--brand);box-shadow:none;color:#fff}
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
