/* =============================================================
   Pilehead Product View — 3-Column Layout
   LEFT: gallery  |  CENTRE: info  |  RIGHT: price/buy
   + tabs below (Overview, Features, Specs, Applications, FAQs)
   ============================================================= */

// ── CSS injected once ──────────────────────────────────────────
const PH3_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap');

.ph3 *,.ph3 *::before,.ph3 *::after{box-sizing:border-box;margin:0;padding:0}
.ph3{
  --ink:#12100E;--ink2:#1E1A16;--soft:#3D3530;--stone:#7A7068;--mist:#B8B0A8;
  --border:#E5DDD5;--border2:#F0E8DF;--paper:#FAF8F5;--cream:#F4EFE8;--white:#FFFFFF;
  --amber:#C45D00;--amber2:#E06A00;--amber3:#A04C00;--amber-pale:#FFF3E5;--amber-b:#F5C07A;
  --green:#1A6B3C;--green-pale:#E8F5EE;--red:#C0392B;
  --ff-d:'Outfit',sans-serif;--ff-b:'Inter',sans-serif;
  --sh-sm:0 2px 10px rgba(18,16,14,.08);--sh-md:0 6px 24px rgba(18,16,14,.10);
  --sh-lg:0 16px 48px rgba(18,16,14,.13);
  --r8:8px;--r12:12px;--r16:16px;--r20:20px;--r24:24px;
  font-family:var(--ff-b);background:#EFEAE3;color:var(--ink);
  -webkit-font-smoothing:antialiased;padding-bottom:32px;
}

/* BREADCRUMB */
.ph3 .bc{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--stone);padding:14px 0 12px;flex-wrap:wrap}
.ph3 .bc-sep{color:var(--mist);font-size:9px}
.ph3 .bc-cur{color:var(--ink);font-weight:600}

/* ── 3-COLUMN HERO ── */
.ph3 .hero{display:grid;grid-template-columns:1fr 1.15fr 300px;gap:14px;align-items:start;margin-bottom:16px}
@media(max-width:1000px){.ph3 .hero{grid-template-columns:1fr 1fr;}.ph3 .col-buy{grid-column:1/-1}}
@media(max-width:660px){.ph3 .hero{grid-template-columns:1fr}}

/* LEFT — Gallery */
.ph3 .col-gal{background:var(--white);border-radius:var(--r24);border:1px solid var(--border);overflow:hidden;box-shadow:var(--sh-md)}
.ph3 .gal-main{background:linear-gradient(145deg,#FFF8F0,#F5ECE0);min-height:300px;display:flex;align-items:center;justify-content:center;position:relative;border-bottom:1px solid var(--border2);overflow:hidden}
.ph3 .gal-main img{max-width:100%;max-height:300px;object-fit:contain;position:relative;z-index:1}
.ph3 .gal-wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.ph3 .gal-wm span{font-family:var(--ff-d);font-size:80px;font-weight:900;color:rgba(196,93,0,.04);letter-spacing:-.04em;text-transform:uppercase}
.ph3 .gal-fallback{font-size:72px;filter:drop-shadow(0 8px 20px rgba(18,16,14,.1));position:relative;z-index:1}
.ph3 .gal-thumbs{display:flex;gap:9px;padding:12px 14px;overflow-x:auto;scrollbar-width:none}
.ph3 .gal-thumbs::-webkit-scrollbar{display:none}
.ph3 .gthumb{width:54px;height:54px;background:var(--cream);border-radius:var(--r12);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;flex-shrink:0;overflow:hidden}
.ph3 .gthumb img{width:100%;height:100%;object-fit:cover}
.ph3 .gthumb.active,.ph3 .gthumb:hover{border-color:var(--amber)}

/* CENTRE — Product Info */
.ph3 .col-info{display:flex;flex-direction:column;gap:12px}
.ph3 .info-card{background:var(--white);border-radius:var(--r24);border:1px solid var(--border);padding:26px 28px;box-shadow:var(--sh-sm);flex:1}
.ph3 .brand-row{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.ph3 .brand-chip{display:inline-flex;align-items:center;gap:5px;background:var(--amber-pale);color:var(--amber3);border:1.5px solid var(--amber-b);padding:4px 12px;border-radius:100px;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
.ph3 .brand-dot{width:6px;height:6px;background:var(--amber);border-radius:50%;flex-shrink:0}
.ph3 .seo-badge{padding:3px 9px;background:var(--amber-pale);color:var(--amber3);border:1px solid var(--amber-b);border-radius:100px;font-size:10px;font-weight:800;letter-spacing:.04em;margin-left:auto}
.ph3 .prod-title{font-family:var(--ff-d);font-size:22px;font-weight:900;color:var(--ink);line-height:1.2;letter-spacing:-.03em;margin-bottom:5px}
.ph3 .prod-sku{font-size:11px;color:var(--stone);font-weight:500;margin-bottom:12px}
.ph3 .rating-row{display:flex;align-items:center;gap:7px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border2);flex-wrap:wrap}
.ph3 .stars{color:#F59E0B;font-size:13px;letter-spacing:1px}
.ph3 .rtext{font-size:11px;color:var(--stone);font-weight:600}
.ph3 .rsep{color:var(--border);font-size:11px}
.ph3 .verified{font-size:11px;color:var(--green);font-weight:700}

/* Feature pills */
.ph3 .pills{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px}
.ph3 .pill{padding:4px 10px;background:var(--paper);border:1px solid var(--border);border-radius:100px;font-size:11px;font-weight:600;color:var(--soft);white-space:nowrap;transition:all .18s}
.ph3 .pill:hover{background:var(--amber-pale);border-color:var(--amber-b);color:var(--amber3)}

/* Short spec list in centre */
.ph3 .spec-preview{border:1px solid var(--border2);border-radius:var(--r16);overflow:hidden;margin-bottom:14px}
.ph3 .spec-preview table{width:100%;border-collapse:collapse;font-size:12px}
.ph3 .spec-preview thead th{background:var(--ink);color:#fff;padding:9px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
.ph3 .spec-preview thead th:first-child{border-right:2px solid var(--amber);width:44%}
.ph3 .spec-preview tbody tr:nth-child(odd) td{background:#fff}
.ph3 .spec-preview tbody tr:nth-child(even) td{background:var(--paper)}
.ph3 .spec-preview tbody tr:hover td{background:var(--amber-pale)}
.ph3 .spec-preview tbody tr:last-child td{border-bottom:none}
.ph3 .spec-preview td{padding:9px 14px;border-bottom:1px solid var(--border2);font-size:12px}
.ph3 .spec-preview td:first-child{font-weight:700;color:var(--ink);border-right:1px solid var(--border2)}
.ph3 .spec-preview td:last-child{color:var(--soft)}

/* Short desc */
.ph3 .short-desc{font-size:13px;color:var(--soft);line-height:1.8;padding:14px 18px;background:var(--paper);border-radius:var(--r12);border:1px solid var(--border2)}

/* RIGHT — Price / Buy */
.ph3 .col-buy{display:flex;flex-direction:column;gap:12px}
.ph3 .price-card{background:var(--ink2);border-radius:var(--r24);padding:24px 26px;box-shadow:var(--sh-lg)}
.ph3 .price-row{display:flex;align-items:flex-end;gap:10px;margin-bottom:6px;flex-wrap:wrap}
.ph3 .price-main{font-family:var(--ff-d);font-size:36px;font-weight:900;color:#fff;line-height:1;letter-spacing:-.04em}
.ph3 .price-old{font-size:14px;color:rgba(255,255,255,.3);text-decoration:line-through;padding-bottom:3px}
.ph3 .price-save{background:var(--amber);color:#fff;font-size:10px;font-weight:800;padding:3px 9px;border-radius:100px}
.ph3 .stock-row{display:flex;align-items:center;gap:7px;margin-bottom:18px}
.ph3 .sdot{width:7px;height:7px;background:#4ADE80;border-radius:50%;animation:ph3pulse 2s infinite;flex-shrink:0}
.ph3 .sdot-oos{background:#F87171}
@keyframes ph3pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}
.ph3 .stext{font-size:12px;color:rgba(255,255,255,.5);font-weight:500}
.ph3 .stext strong{color:rgba(255,255,255,.75)}
.ph3 .atc-btn{width:100%;padding:13px;background:var(--amber);color:#fff;border:none;border-radius:var(--r16);font-family:var(--ff-d);font-size:14px;font-weight:900;letter-spacing:.03em;cursor:pointer;transition:all .28s;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px}
.ph3 .atc-btn:hover{background:var(--amber2);transform:translateY(-2px);box-shadow:0 8px 24px rgba(196,93,0,.35)}
.ph3 .sec-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
.ph3 .sec-btn{padding:10px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.7);border:1.5px solid rgba(255,255,255,.1);border-radius:var(--r12);font-size:11px;font-weight:700;cursor:pointer;transition:all .2s}
.ph3 .sec-btn:hover{background:rgba(255,255,255,.1);color:#fff}
.ph3 .del-strip{display:flex;flex-direction:column;gap:6px}
.ph3 .del-item{display:flex;align-items:center;gap:8px;font-size:11px;color:rgba(255,255,255,.5);padding:8px 11px;background:rgba(255,255,255,.04);border-radius:var(--r8);border:1px solid rgba(255,255,255,.06)}
.ph3 .del-item strong{color:rgba(255,255,255,.75)}
.ph3 .del-ico{font-size:14px;flex-shrink:0}

/* Datasheet card (right column) */
.ph3 .ds-card{background:var(--white);border-radius:var(--r16);border:1px solid var(--border);padding:16px 18px;box-shadow:var(--sh-sm);display:flex;align-items:center;gap:12px}
.ph3 .ds-ico{width:38px;height:38px;background:var(--amber-pale);border-radius:var(--r8);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.ph3 .ds-info h5{font-family:var(--ff-d);font-size:12px;font-weight:800;color:var(--ink);margin-bottom:2px}
.ph3 .ds-info p{font-size:10px;color:var(--stone);margin:0}
.ph3 .ds-btn{margin-left:auto;padding:7px 14px;background:var(--amber);color:#fff;border:none;border-radius:var(--r8);font-size:10px;font-weight:800;cursor:pointer;letter-spacing:.04em;white-space:nowrap;transition:all .2s;text-decoration:none;display:inline-block;flex-shrink:0}
.ph3 .ds-btn:hover{background:var(--amber2)}

/* ── TABS ── */
.ph3 .tabs-wrap{margin-top:4px}
.ph3 .tabs-nav{display:flex;gap:5px;padding:7px;background:var(--white);border-radius:var(--r20) var(--r20) 0 0;border:1px solid var(--border);border-bottom:none;overflow-x:auto;scrollbar-width:none}
.ph3 .tabs-nav::-webkit-scrollbar{display:none}
.ph3 .tab-btn{padding:9px 18px;font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--stone);cursor:pointer;border-radius:var(--r12);transition:all .2s;white-space:nowrap;user-select:none;border:1.5px solid transparent;background:none;font-family:var(--ff-b)}
.ph3 .tab-btn:hover{background:var(--paper);color:var(--ink)}
.ph3 .tab-btn.active{background:var(--amber);color:#fff;border-color:var(--amber);box-shadow:0 4px 14px rgba(196,93,0,.25)}
.ph3 .tab-pane{display:none;background:var(--white);border:1px solid var(--border);border-radius:0 var(--r8) var(--r24) var(--r24);box-shadow:var(--sh-md)}
.ph3 .tab-pane.active{display:block;animation:ph3fi .22s ease}
@keyframes ph3fi{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.ph3 .pane-inner{padding:36px 40px}
@media(max-width:660px){.ph3 .pane-inner{padding:20px 16px}}

/* ── SHARED PANE CONTENT ── */
.ph3 .tab-pane p{color:var(--soft);line-height:1.9;font-size:14px;margin-bottom:14px}
.ph3 .tab-pane h2{font-family:var(--ff-d);font-size:21px;font-weight:800;color:var(--ink);margin:30px 0 14px;letter-spacing:-.03em}
.ph3 .tab-pane h3{font-family:var(--ff-d);font-size:17px;font-weight:800;color:var(--ink);margin:22px 0 10px}
.ph3 .tab-pane h4{font-family:var(--ff-d);font-size:14px;font-weight:700;color:var(--soft);margin:16px 0 8px}
.ph3 .tab-pane ul,.ph3 .tab-pane ol{margin:0 0 14px 22px}
.ph3 .tab-pane li{margin:6px 0;font-size:13px;color:var(--soft);line-height:1.7}
.ph3 .tab-pane strong{color:var(--ink)}
.ph3 .tab-pane a{color:var(--amber);font-weight:600;text-decoration:none;border-bottom:1.5px solid transparent;transition:border-color .2s}
.ph3 .tab-pane a:hover{border-bottom-color:var(--amber)}
.ph3 .tab-pane img{max-width:100%;height:auto;border-radius:var(--r12);margin:14px 0;border:1px solid var(--border)}
.ph3 .tab-pane figure{margin:22px 0;border-radius:var(--r16);overflow:hidden;border:1px solid var(--border);box-shadow:0 6px 20px rgba(14,14,12,.09)}
.ph3 .tab-pane figure img{width:100%;height:auto;display:block;margin:0;border-radius:0;border:none;box-shadow:none}
.ph3 .tab-pane figcaption{padding:9px 14px;font-size:12px;color:var(--stone);background:var(--paper)}

/* ── OVERVIEW (TOC sidebar) ── */
.ph3 .ov-wrap{display:grid;grid-template-columns:180px 1fr;gap:0}
@media(max-width:660px){.ph3 .ov-wrap{grid-template-columns:1fr}}
.ph3 .ov-toc{padding:28px 18px;border-right:1px solid var(--border2);background:var(--paper);border-radius:0 0 0 var(--r24)}
.ph3 .ov-toc-lbl{font-size:9px;font-weight:900;color:var(--mist);letter-spacing:.14em;text-transform:uppercase;margin-bottom:12px}
.ph3 .ov-toc-a{display:flex;align-items:center;gap:7px;padding:7px 9px;border-radius:var(--r8);font-size:11px;font-weight:600;color:var(--stone);cursor:pointer;transition:all .18s;margin-bottom:2px}
.ph3 .ov-toc-a:hover{background:var(--amber-pale);color:var(--amber3)}
.ph3 .ov-toc-a:hover .ov-toc-n{background:var(--amber);color:#fff}
.ph3 .ov-toc-n{width:17px;height:17px;background:var(--border);color:var(--stone);border-radius:50%;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .18s}
.ph3 .ov-body{padding:32px 36px}
@media(max-width:660px){.ph3 .ov-toc{display:none}.ph3 .ov-body{padding:20px 16px}}
.ph3 .lead-box{background:linear-gradient(135deg,var(--amber-pale),#FFF9F5);border:1.5px solid var(--amber-b);border-radius:var(--r20);padding:18px 22px;margin-bottom:24px;position:relative;overflow:hidden}
.ph3 .lead-box p{font-size:14px;color:var(--soft);line-height:1.85;margin:0;position:relative;z-index:1}

/* ── FEATURES ── */
.ph3 .sec-title{font-family:var(--ff-d);font-size:20px;font-weight:800;color:var(--ink);margin:0 0 18px;letter-spacing:-.03em;display:flex;align-items:center;gap:10px}
.ph3 .sec-title::before{content:'';width:4px;height:22px;background:var(--amber);border-radius:2px;flex-shrink:0}
.ph3 .feat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:13px;margin-bottom:26px}
@media(max-width:760px){.ph3 .feat-grid{grid-template-columns:1fr 1fr}}
@media(max-width:520px){.ph3 .feat-grid{grid-template-columns:1fr}}
.ph3 .feat-card{background:var(--white);border:1.5px solid var(--border);border-radius:var(--r20);padding:22px 18px;transition:all .25s}
.ph3 .feat-card:hover{border-color:var(--amber-b);transform:translateY(-4px);box-shadow:var(--sh-md)}
.ph3 .feat-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.ph3 .feat-emo{width:46px;height:46px;background:var(--amber-pale);border-radius:var(--r16);display:flex;align-items:center;justify-content:center;font-size:21px}
.ph3 .feat-num{font-family:var(--ff-d);font-size:30px;font-weight:900;color:var(--border);line-height:1}
.ph3 .feat-card h3{font-family:var(--ff-d);font-size:13px;font-weight:800;color:var(--ink);margin:0 0 7px;letter-spacing:-.01em}
.ph3 .feat-card p{font-size:12px;color:var(--soft);line-height:1.75;margin:0}
.ph3 .why-box{background:linear-gradient(135deg,var(--ink),var(--ink2));border-radius:var(--r20);padding:24px 28px;box-shadow:var(--sh-lg)}
.ph3 .why-box h4{font-family:var(--ff-d);font-size:15px;font-weight:900;color:#fff;margin:0 0 14px;letter-spacing:-.02em}
.ph3 .why-box h4 span{color:var(--amber)}
.ph3 .why-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
@media(max-width:520px){.ph3 .why-grid{grid-template-columns:1fr}}
.ph3 .why-item{display:flex;align-items:center;gap:9px;padding:9px 13px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:var(--r12);font-size:12px;color:rgba(255,255,255,.65);transition:all .2s}
.ph3 .why-item:hover{background:rgba(255,255,255,.07);color:#fff}
.ph3 .why-ck{width:20px;height:20px;background:rgba(74,222,128,.15);border:1px solid rgba(74,222,128,.25);color:#4ADE80;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;flex-shrink:0}

/* ── SPECS TABLE ── */
.ph3 .specs-intro{font-size:13px;color:var(--stone);margin:0 0 20px;line-height:1.7;padding:11px 15px;background:var(--paper);border-radius:var(--r12);border:1px solid var(--border2)}
.ph3 .specs-wrap{border:1.5px solid var(--border);border-radius:var(--r20);overflow:hidden;margin-bottom:20px;box-shadow:var(--sh-sm)}
.ph3 .specs-table{width:100%;border-collapse:collapse;font-size:13px}
.ph3 .specs-table thead tr{background:var(--ink)}
.ph3 .specs-table th{padding:12px 20px;text-align:left;color:#fff;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.1em}
.ph3 .specs-table th:first-child{border-right:3px solid var(--amber);width:38%}
.ph3 .specs-table tbody tr:hover td{background:var(--amber-pale)}
.ph3 .specs-table tbody tr:nth-child(odd) td{background:#fff}
.ph3 .specs-table tbody tr:nth-child(even) td{background:var(--paper)}
.ph3 .specs-table tbody tr:last-child td{border-bottom:none}
.ph3 .specs-table td{padding:11px 20px;border-bottom:1px solid var(--border2)}
.ph3 .specs-table td:first-child{font-weight:700;color:var(--ink);border-right:1px solid var(--border2)}
.ph3 .specs-table td:last-child{color:var(--soft)}

/* ── APP CARDS ── */
.ph3 .app-grid{display:grid;gap:11px;margin-bottom:22px}
.ph3 .app-card{display:grid;grid-template-columns:62px 1fr;background:var(--white);border:1.5px solid var(--border);border-radius:var(--r20);overflow:hidden;transition:all .25s}
.ph3 .app-card:hover{border-color:var(--amber-b);box-shadow:var(--sh-md);transform:translateX(5px)}
.ph3 .app-ico{background:var(--amber-pale);display:flex;align-items:center;justify-content:center;font-size:24px;border-right:1.5px solid var(--amber-b)}
.ph3 .app-body{padding:16px 20px}
.ph3 .app-body h3{font-family:var(--ff-d);font-size:13px;font-weight:800;color:var(--ink);margin:0 0 5px;letter-spacing:-.01em}
.ph3 .app-body p{font-size:12px;color:var(--soft);line-height:1.7;margin:0}

/* ── FAQs ── */
.ph3 .fq-grid{display:flex;flex-direction:column;gap:7px}
.ph3 .fq-item{background:var(--white);border:1.5px solid var(--border);border-radius:var(--r16);overflow:hidden;transition:all .25s}
.ph3 .fq-item.open{border-color:var(--amber-b);box-shadow:var(--sh-sm)}
.ph3 .fq-q{padding:16px 20px;font-family:var(--ff-d);font-size:14px;font-weight:700;color:var(--ink);cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;letter-spacing:-.01em;transition:color .2s;user-select:none}
.ph3 .fq-q:hover,.ph3 .fq-item.open .fq-q{color:var(--amber)}
.ph3 .fq-ico{width:26px;height:26px;background:var(--paper);border:1.5px solid var(--border);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:300;color:var(--stone);flex-shrink:0;transition:all .3s;line-height:1}
.ph3 .fq-item.open .fq-ico{background:var(--amber);color:#fff;border-color:var(--amber);transform:rotate(45deg)}
.ph3 .fq-sep{height:1px;background:var(--border2);margin:0 20px}
.ph3 .fq-item.open .fq-sep{background:var(--amber-b)}
.ph3 .fq-a{font-size:13px;color:var(--soft);line-height:1.85;max-height:0;overflow:hidden;transition:max-height .32s ease,padding .28s ease;padding:0 20px}
.ph3 .fq-item.open .fq-a{max-height:400px;padding:12px 20px 18px}
`;

// ── Helpers ────────────────────────────────────────────────────
function ph3Esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
const PH3_EMOJIS=['🔬','⚡','💪','🌡️','💧','🏗️','🧱','🎯','🔒','📋','✅','🌍','🔑','⚙️','🏆','✨'];

function ph3Gallery(product){
  const m=product.image||'';
  const raw=product.galleryImages||product.images||[];
  const all=Array.isArray(raw)?raw:typeof raw==='string'?raw.split(/\s+/).filter(Boolean):[];
  return [...new Set([...(m?[m]:[]),...all.filter(Boolean)])].slice(0,8);
}
function ph3Pills(seo){
  const src=seo?.tags||seo?.focusKeywords||'';
  const list=typeof src==='string'?src.split(','):(Array.isArray(src)?src:[]);
  return list.map(s=>s.trim()).filter(Boolean).slice(0,6);
}
function ph3ParseFaqs(html){
  if(!html)return[];
  const items=[];const re=/<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;let m;
  while((m=re.exec(html))!==null)items.push({q:m[1].replace(/<[^>]+>/g,'').trim(),a:m[2].replace(/<[^>]+>/g,'').trim()});
  return items;
}
function ph3TocFromHtml(html){
  const re=/<h2[^>]*>([\s\S]*?)<\/h2>/gi;const items=[];let m;
  while((m=re.exec(html))!==null){const t=m[1].replace(/<[^>]+>/g,'').trim();if(t)items.push(t);}
  return items;
}
function ph3StripImages(html) {
  if (!html) return '';
  return html.replace(/<img[^>]*>/gi, '').replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '');
}
function ph3AddH2Ids(html,prefix){let i=0;return html.replace(/<h2([^>]*)>/gi,()=>`<h2 id="${prefix}-h${i++}">`);}

// ── Pane: Overview ─────────────────────────────────────────────
function ph3Overview(product,seo,iid){
  let rawHtml = seo?.tabs?.descriptionHtml || seo?.longDescription || '';
  const isPreSeo = !rawHtml;
  
  if (isPreSeo) {
      // Fallback to scraped data, but strip images to avoid duplication/mess
      rawHtml = product?.tabs?.descriptionHtml || product?.description || '';
      // Also maybe strip some other common messy tags if needed
      rawHtml = ph3StripImages(rawHtml);
  }

  const metaDesc=seo?.metaDescription||seo?.shortDescription||'';
  const price=product.price||product.regular_price||'';
  const leadHtml=metaDesc?`<div class="lead-box"><p><strong>${ph3Esc(product.title||product.name)}</strong> — ${ph3Esc(metaDesc)}${price?` · <strong style="color:var(--amber)">AED ${ph3Esc(price)}</strong>`:''}</p></div>`:'';
  
  const descHtml=rawHtml?ph3AddH2Ids(rawHtml,`${iid}-ov`):'';
  const tocItems=ph3TocFromHtml(rawHtml);
  const tocHtml=`<div class="ov-toc"><div class="ov-toc-lbl">Contents</div>${tocItems.length?tocItems.map((t,i)=>`<div class="ov-toc-a" onclick="document.getElementById('${iid}-ov-h${i}')?.scrollIntoView({behavior:'smooth'})"><span class="ov-toc-n">${i+1}</span>${ph3Esc(t)}</div>`).join(''):'<div style="font-size:10px;color:var(--mist);font-style:italic">No headers found</div>'}</div>`;
  
  const rawOvSpecs=product.specs||product.specifications||{};
  const ovSpecs=typeof rawOvSpecs==='object'&&!Array.isArray(rawOvSpecs)?Object.entries(rawOvSpecs).slice(0,6):[];
  const fallback=(!descHtml&&ovSpecs.length)?`<div class="spec-preview"><table><thead><tr><th>Specification</th><th>Value</th></tr></thead><tbody>${ovSpecs.map(([k,v])=>`<tr><td>${ph3Esc(k)}</td><td>${ph3Esc(v)}</td></tr>`).join('')}</tbody></table></div>`:'';
  
  let bodyContent;
  if (descHtml) {
      bodyContent = `${leadHtml}${descHtml}`;
  } else {
      bodyContent = `${leadHtml}${fallback}<div style="padding:40px;text-align:center;color:var(--stone);border:2px dashed var(--border);border-radius:var(--r16);background:var(--paper)">
        <div style="font-size:24px;margin-bottom:10px">✨</div>
        <div style="font-weight:700;margin-bottom:6px">Ready to Generate</div>
        <div style="font-size:13px;opacity:0.8">Click "Generate AI Content" to create a professional product description.</div>
      </div>`;
  }
  
  return`<div class="ov-wrap">${tocHtml}<div class="ov-body">${bodyContent}</div></div>`;
}

// ── Pane: Features ─────────────────────────────────────────────
function ph3Features(product,seo){
  const src=product?.tabs?.benefitsHtml||seo?.tabs?.benefitsHtml||'';
  if(src.trim().length>80)return`<div class="pane-inner">${src}</div>`;
  const rawSpecs2=product.specs||product.specifications||{};
  const specs=typeof rawSpecs2==='object'&&!Array.isArray(rawSpecs2)?Object.entries(rawSpecs2):[];
  if(!specs.length)return`<div class="pane-inner"><p style="color:var(--stone);font-style:italic">Run SEO rewrite to generate features &amp; benefits.</p></div>`;
  const cards=specs.slice(0,6).map(([k,v],i)=>`<div class="feat-card"><div class="feat-top"><div class="feat-emo">${PH3_EMOJIS[i%PH3_EMOJIS.length]}</div><div class="feat-num">${String(i+1).padStart(2,'0')}</div></div><h3>${ph3Esc(k)}</h3><p>${ph3Esc(v)}</p></div>`).join('');
  const whyItems=specs.slice(0,6).map(([k])=>`<div class="why-item"><span class="why-ck">✓</span>${ph3Esc(k)}</div>`).join('');
  return`<div class="pane-inner"><div class="sec-title">Features &amp; Benefits</div><div class="feat-grid">${cards}</div><div class="why-box"><h4>Why choose <span>${ph3Esc(product.brand||product.title||'this product')}</span></h4><div class="why-grid">${whyItems}</div></div></div>`;
}

// ── Pane: Specs ────────────────────────────────────────────────
function ph3Specs(product,seo){
  const src=product?.tabs?.specificationsHtml||seo?.tabs?.specificationsHtml||'';
  if(src.trim().length>100)return`<div class="pane-inner">${src}</div>`;
  const rawSpecs=product.specs||product.specifications||{};
  const specs=typeof rawSpecs==='object'&&!Array.isArray(rawSpecs)?Object.entries(rawSpecs):[];
  if(!specs.length)return`<div class="pane-inner"><p style="color:var(--stone);font-style:italic">No specifications available.</p></div>`;
  const rows=specs.map(([k,v])=>`<tr><td>${ph3Esc(k)}</td><td>${ph3Esc(v)}</td></tr>`).join('');
  const ds=product.datasheetUrl||product.localDatasheetPath;
  const dsCard=ds?`<div class="ds-card"><div class="ds-ico">📄</div><div class="ds-info"><h5>Technical Datasheet</h5><p>Full specs, mixing ratios &amp; safety data</p></div><a href="${ph3Esc(ds)}" target="_blank" class="ds-btn">⬇ Download PDF</a></div>`:'';
  return`<div class="pane-inner"><div class="sec-title">Technical Specifications</div><div class="specs-intro">Complete data for <strong>${ph3Esc(product.title||product.name)}</strong>${product.brand?` · Manufactured by <strong>${ph3Esc(product.brand)}</strong>`:''}</div><div class="specs-wrap"><table class="specs-table"><thead><tr><th>Specification</th><th>Value / Details</th></tr></thead><tbody>${rows}</tbody></table></div>${dsCard}</div>`;
}

// ── Pane: Applications ─────────────────────────────────────────
function ph3Applications(product,seo){
  const src=product?.tabs?.applicationHtml||seo?.tabs?.applicationHtml||'';
  if(src.trim().length>80)return`<div class="pane-inner">${src}</div>`;
  return`<div class="pane-inner"><p style="color:var(--stone);font-style:italic">Run SEO rewrite to generate applications content.</p></div>`;
}

// ── Pane: FAQs ─────────────────────────────────────────────────
function ph3Faqs(product,seo,iid){
  const faqs=ph3ParseFaqs(product?.tabs?.faqsHtml||seo?.tabs?.faqsHtml||'');
  if(!faqs.length)return`<div class="pane-inner"><p style="color:var(--stone);font-style:italic">Run SEO rewrite to generate FAQ content.</p></div>`;
  const items=faqs.map((f,i)=>`<div class="fq-item" id="${iid}-fq-${i}"><div class="fq-q" data-fq="${iid}-fq-${i}">${ph3Esc(f.q)}<span class="fq-ico">+</span></div><div class="fq-sep"></div><div class="fq-a">${ph3Esc(f.a)}</div></div>`).join('');
  return`<div class="pane-inner"><div class="sec-title">Frequently Asked Questions</div><div class="fq-grid">${items}</div></div>`;
}

// (event wiring happens inside productTabbedView after innerHTML is set)

// ── MAIN ──────────────────────────────────────────────────────
function productTabbedView(containerId, product, seo) {
  const el = document.getElementById(containerId);
  if (!el) return;

  // Inject CSS once
  if (!document.getElementById('ph3-css')) {
    const s = document.createElement('style');
    s.id = 'ph3-css';
    s.textContent = PH3_CSS;
    document.head.appendChild(s);
  }

  const iid = `ph3-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  
  // ── Build gallery images array ────────────────────────────────
  const imgs = ph3Gallery(product);
  window[`__ph3Gal_${iid}`] = imgs;
  const mainImg = imgs[0] || '';
  const mainImgHtml = mainImg
    ? `<img id="${iid}-mi" src="${ph3Esc(mainImg)}" alt="${ph3Esc(product.title||product.name||'')}" loading="lazy"/>`
    : `<div class="gal-fallback">📦</div>`;
  const thumbsHtml = imgs.map((u,i)=>
    `<div class="gthumb${i===0?' active':''}" data-galIdx="${i}">${i<imgs.length?`<img src="${ph3Esc(u)}" loading="lazy" alt=""/>`:`<span style="font-size:16px">📷</span>`}</div>`
  ).join('');

  // ── Extract brand / title / price / specs ─────────────────────
  const title  = product.title||product.name||'Product';
  const brand  = product.brand||product.vendor||'';
  const skuStr = product.sku||product.model_number||product.mpn||'';
  const price  = product.price||product.regular_price||product.sale_price||'';
  const oldPrc = product.regular_price&&product.sale_price?product.regular_price:'';
  const stock  = product.stock_status||product.availability||'instock';
  const inStock = !/out|unavail|false/i.test(String(stock));
  const rawKeySpecs = product.specs||product.specifications||{};
  const keySpecs = typeof rawKeySpecs==='object'&&!Array.isArray(rawKeySpecs)?Object.entries(rawKeySpecs).slice(0,5):[];
  const pills    = ph3Pills(seo);
  const metaDesc = seo?.metaDescription||seo?.shortDescription||'';

  // ── SHORT SPEC MINI TABLE ─────────────────────────────────────
  const specMini = keySpecs.length
    ? `<div class="spec-preview"><table>
        <thead><tr><th>Specification</th><th>Value</th></tr></thead>
        <tbody>${keySpecs.map(([k,v])=>`<tr><td>${ph3Esc(k)}</td><td>${ph3Esc(v)}</td></tr>`).join('')}</tbody>
       </table></div>`
    : '';

  // ── COLUMN 1 — Gallery ────────────────────────────────────────
  const colGal = `
  <div class="col-gal">
    <div class="gal-main">
      <div class="gal-wm"><span>${ph3Esc((brand||title).substring(0,8).toUpperCase())}</span></div>
      ${mainImgHtml}
    </div>
    ${thumbsHtml?`<div class="gal-thumbs">${thumbsHtml}</div>`:''}
  </div>`;

  // ── COLUMN 2 — Info ───────────────────────────────────────────
  const colInfo = `
  <div class="col-info">
    <div class="info-card">
      <div class="brand-row">
        ${brand?`<div class="brand-chip"><span class="brand-dot"></span>${ph3Esc(brand)}</div>`:''}
        ${seo?.focusKeyword?`<span class="seo-badge">${ph3Esc(seo.focusKeyword)}</span>`:''}
      </div>
      <div class="prod-title">${ph3Esc(title)}</div>
      ${skuStr?`<div class="prod-sku">SKU: ${ph3Esc(skuStr)}</div>`:''}
      <div class="rating-row">
        <span class="stars">★★★★★</span>
        <span class="rtext">5.0 / 5.0</span>
        <span class="rsep">|</span>
        <span class="verified">✓ Professional Grade</span>
      </div>
      ${pills.length?`<div class="pills">${pills.map(p=>`<span class="pill">${ph3Esc(p)}</span>`).join('')}</div>`:''}
      ${specMini}
      ${metaDesc?`<div class="short-desc">${ph3Esc(metaDesc)}</div>`:''}
    </div>
  </div>`;

  // ── COLUMN 3 — Price / Buy ────────────────────────────────────
  const colBuy = `
  <div class="col-buy">
    <div class="price-card">
      <div class="price-row">
        <div class="price-main">${price?`AED ${ph3Esc(price)}`:'Contact Us'}</div>
        ${oldPrc?`<div class="price-old">AED ${ph3Esc(oldPrc)}</div>`:''}
        ${oldPrc&&price?`<div class="price-save">SAVE</div>`:''}
      </div>
      <div class="stock-row">
        <div class="sdot${inStock?'':' sdot-oos'}"></div>
        <div class="stext">${inStock?'<strong>In Stock</strong> — Ready to dispatch':'<strong>Out of Stock</strong> — Check back soon'}</div>
      </div>
      <button class="atc-btn" onclick="alert('Add to cart coming soon')">
        <span>🛒</span><span>Add to Cart</span>
      </button>
      <div class="sec-btns">
        <button class="sec-btn">❤ Save</button>
        <button class="sec-btn">📤 Share</button>
      </div>
      <div class="del-strip">
        <div class="del-item"><span class="del-ico">🚚</span><span><strong>Free Delivery</strong> on orders over AED 500</span></div>
        <div class="del-item"><span class="del-ico">🔄</span><span><strong>14-Day</strong> hassle-free returns</span></div>
        <div class="del-item"><span class="del-ico">🔒</span><span><strong>Secure</strong> checkout &amp; payment</span></div>
      </div>
    </div>
    ${(() => {
      const datasheets = product.datasheets || [];
      if (datasheets.length === 0 && (product.datasheetUrl || product.localDatasheetPath)) {
        datasheets.push({ url: product.datasheetUrl || product.localDatasheetPath, name: 'Technical Datasheet' });
      }
      return datasheets.map(ds => `
        <div class="ds-card" style="margin-top:8px">
          <div class="ds-ico">📄</div>
          <div class="ds-info"><h5>${ph3Esc(ds.name || ds.type || 'Document')}</h5><p>Professional technical data</p></div>
          <a class="ds-btn" href="${ph3Esc(ds.url)}" target="_blank">⬇ PDF</a>
        </div>`).join('');
    })()}
  </div>`;

  // ── TABS ──────────────────────────────────────────────────────
  const tabDefs = [
    { id:'overview',    label:'Overview' },
    { id:'features',    label:'Features & Benefits' },
    { id:'specs',       label:'Specifications' },
    { id:'applications',label:'Applications' },
    { id:'faqs',        label:'FAQs' }
  ];
  
  // Add dynamic tabs from product.tabs (like 'downloads')
  if (product.tabs) {
    Object.keys(product.tabs).forEach(key => {
      if (!tabDefs.find(t => t.id === key)) {
        tabDefs.push({ id: key, label: key.charAt(0).toUpperCase() + key.slice(1) });
      }
    });
  }

  const tabNavStr = tabDefs.map((t,i)=>
    `<button class="tab-btn${i===0?' active':''}" data-tab="${t.id}">${ph3Esc(t.label)}</button>`
  ).join('');

  const tabContent = tabDefs.map((t,i) => {
    let html = '';
    if (t.id === 'overview') html = ph3Overview(product, seo, iid);
    else if (t.id === 'features') html = ph3Features(product, seo);
    else if (t.id === 'specs') html = ph3Specs(product, seo);
    else if (t.id === 'applications') html = ph3Applications(product, seo);
    else if (t.id === 'faqs') html = ph3Faqs(product, seo, iid);
    else if (product.tabs && product.tabs[t.id]) html = `<div class="pane-inner">${product.tabs[t.id]}</div>`;
    
    return `<div class="tab-pane${i===0?' active':''}" id="${iid}-tp-${t.id}">${html}</div>`;
  }).join('');

  // ── BREADCRUMB ────────────────────────────────────────────────
  const cats = Array.isArray(product.categories)
    ? product.categories.map(c=>typeof c==='object'?c.name||c:c).filter(Boolean)
    : (product.category?[product.category]:[]);
  const bcHtml = cats.length
    ? `<div class="bc">${['Home',...cats].map((c,i,a)=>
        i<a.length-1
          ? `<span>${ph3Esc(c)}</span><span class="bc-sep">›</span>`
          : `<span class="bc-cur">${ph3Esc(c)}</span>`
      ).join('')}</div>`
    : '';

  // ── ASSEMBLE ──────────────────────────────────────────────────
  el.innerHTML = `
  <div class="ph3" id="${iid}">
    ${bcHtml}
    <div class="hero">
      ${colGal}
      ${colInfo}
      ${colBuy}
    </div>
    <div class="tabs-wrap">
      <nav class="tabs-nav">${tabNavStr}</nav>
      ${tabContent}
    </div>
  </div>`;

  // ── Wire up events (no global window.* functions needed) ──────
  const root = document.getElementById(iid);
  if (!root) return;

  // Tab switching
  root.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      root.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      root.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      const pane = document.getElementById(`${iid}-tp-${tabId}`);
      if (pane) pane.classList.add('active');
      btn.classList.add('active');
    });
  });

  // Gallery thumbnails
  root.querySelectorAll('.gthumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const idx = parseInt(thumb.dataset.galidx, 10);
      const mi = document.getElementById(`${iid}-mi`);
      if (mi && imgs[idx]) mi.src = imgs[idx];
      root.querySelectorAll('.gthumb').forEach((t, i) => t.classList.toggle('active', i === idx));
    });
  });

  // FAQ accordion
  root.querySelectorAll('.fq-q').forEach(q => {
    q.addEventListener('click', () => {
      const item = q.closest('.fq-item');
      if (!item) return;
      const grid = q.closest('.fq-grid');
      const wasOpen = item.classList.contains('open');
      if (grid) grid.querySelectorAll('.fq-item').forEach(f => f.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });
}

module.exports = { productTabbedView };
