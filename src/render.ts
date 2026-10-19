// 網站版面 v4,版型參考 Kinfolk:白底黑字、襯線大標、13px 無襯線標籤、滿版圖、灰綠色帶、黑底頁尾。
// 頁面:首頁與每期首頁(雜誌式)、每期全部動態(四欄圖卡)、單則動態、全部期數、全部動態與分類、品牌一覽、單一品牌。
import { LOGO_IDS } from './logo-ids';
import { CATEGORIES, CATEGORY_EN, CATEGORY_ZH, type Brand, type BrandStat, type IssueBundle, type IssueSummary, type Item, type ItemImage, type ItemSource, type ItemsBundle } from './types';

export interface Site { siteName: string; orgName: string; link: (p: string) => string; admin: boolean }
type Cat = Item['category'];

// ---------- 小工具 ----------
const esc = (s: string | number | null | undefined) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : '');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function parts(s: string | null | undefined) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; }
function dShort(s: string | null | undefined) { const p = parts(s); return p ? `${MON[p.m - 1]} ${p.d}` : ''; }
function rangeShort(a: string, b: string) { const x = parts(a), y = parts(b); if (!x || !y) return ''; return x.m === y.m ? `${MON[x.m - 1]} ${x.d} – ${y.d}` : `${MON[x.m - 1]} ${x.d} – ${MON[y.m - 1]} ${y.d}`; }
function rangeLong(a: string, b: string) {
  const x = parts(a), y = parts(b); if (!x || !y) return '';
  if (x.y !== y.y) return `${MONTH[x.m - 1]} ${x.d}, ${x.y} – ${MONTH[y.m - 1]} ${y.d}, ${y.y}`;
  return x.m === y.m ? `${MONTH[x.m - 1]} ${x.d} – ${y.d}, ${y.y}` : `${MONTH[x.m - 1]} ${x.d} – ${MONTH[y.m - 1]} ${y.d}, ${y.y}`;
}
const wnum = (w: string) => String(Number(w.slice(-2)));
const wlabel = (w: string) => `Week ${wnum(w)}`;
const pad2 = (n: number | null | undefined) => String(n ?? 1).padStart(2, '0');
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const enName = (b: Brand | undefined, fallback = '') => (b ? (b.name_en || b.name_zh) : fallback);
/** 中文說明裡的日期用台灣常見的寫法:10/13起、10/16–10/18、至10/31 */
function zhDate(x: string | null | undefined) { const p = parts(x); return p ? `${p.m}/${p.d}` : ''; }
function itemDates(it: Item) {
  if (it.date_start && it.date_end) return `${zhDate(it.date_start)}–${zhDate(it.date_end)}`;
  if (it.date_start) return `${zhDate(it.date_start)}起`;
  if (it.date_end) return `至${zhDate(it.date_end)}`;
  return '';
}

/** 頭條:指定頭條優先,其次有圖、rank 低、較早寫入的(listIssues 的 SQL 用同一套規則) */
export function pickLead(items: Item[], images: Record<string, ItemImage[]>): Item | undefined {
  const score = (i: Item) => (images[i.id]?.length ? 0 : 100) + (maxBytes(images[i.id]) < 150000 ? 30 : 0) + i.rank;
  return items.find(i => i.is_lead) ?? items.slice().sort((a, c) => score(a) - score(c))[0];
}
const maxBytes = (ims: ItemImage[] | undefined) => (ims ?? []).reduce((m, x) => Math.max(m, x.bytes || 0), 0);
/** 同一則動態的圖,檔案最大的(通常解析度最高)排第一,用在大版位 */
function bySize(ims: ItemImage[] | undefined): ItemImage[] { return (ims ?? []).slice().sort((a, b) => (b.bytes || 0) - (a.bytes || 0) || a.sort - b.sort); }

// ---------- 樣式 ----------
const CSS = `
:root{--paper:#fff;--ink:#000;--mute:#6b6b6b;--faint:#8a8a8a;--hair:#e2e2e2;--sage:#dcded5;--ph:#efefec;--g:clamp(16px,2.4vw,34px);
--serif:"Newsreader","Noto Serif TC","Songti TC",Georgia,serif;--zh:"Noto Serif TC","Songti TC","PMingLiU",serif;--sans:"Instrument Sans","Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;
--body:"Instrument Sans","Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif}
*{box-sizing:border-box;min-width:0}html{-webkit-text-size-adjust:100%}html,body{overflow-x:clip}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--serif);font-size:19px;line-height:1.7;-webkit-font-smoothing:antialiased;font-optical-sizing:auto}
a{color:inherit;text-decoration:none}p{margin:0}h1,h2,h3{margin:0;font-weight:400}img{display:block;max-width:100%}ol,ul{list-style:none;margin:0;padding:0}
a:focus-visible,button:focus-visible,select:focus-visible{outline:1px solid currentColor;outline-offset:3px}
.lb{font-family:var(--sans);font-size:13px;line-height:17px;letter-spacing:.03em}
.top{display:flex;justify-content:space-between;align-items:center;height:76px;padding-inline:var(--g)}
.logo{font-family:var(--serif);font-size:26px;letter-spacing:.2em;line-height:1;white-space:nowrap}
.burger{width:36px;height:36px;margin-right:-4px;border:0;background:none;padding:0 4px;cursor:pointer;display:grid;align-content:center;gap:6px;color:inherit}.burger i{display:block;height:1.5px;background:currentColor}
.menu{position:fixed;inset:0;z-index:50;background:var(--paper);display:none;overflow:auto}.menu.open{display:block}
.menu .x i:first-child{transform:translateY(3.75px) rotate(45deg)}.menu .x i:last-child{transform:translateY(-3.75px) rotate(-45deg)}
.menu nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:48px var(--g);padding:56px var(--g) 80px}
.menu nav .lb{display:block;color:var(--mute);margin-bottom:20px}.menu nav a{display:block;font-family:var(--serif);font-size:clamp(34px,4.6vw,60px);line-height:1.18}.menu nav a:hover{color:var(--mute)}
.draftbar{position:sticky;bottom:0;z-index:30;display:flex;justify-content:space-between;gap:16px;background:#000;color:#fff;padding:14px var(--g);font-family:var(--sans);font-size:13px;line-height:18px}
/* 每期首頁 */
.ihead{text-align:center;padding:24px var(--g) 0}
.ihead h1{font-family:var(--serif);font-size:clamp(34px,3.5vw,50px);line-height:1.04;letter-spacing:-.01em;text-transform:uppercase}
.ihead .lb{margin-top:16px}
.cover{display:block;position:relative;width:min(316px,64vw);aspect-ratio:3/4;margin:56px auto 0;overflow:hidden;background:var(--sage);color:#000}
.cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cover.img{color:#fff}.cover.img::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.42),rgba(0,0,0,0) 28%,rgba(0,0,0,0) 62%,rgba(0,0,0,.5))}
.cover .m{position:absolute;z-index:1;top:7%;left:0;right:0;text-align:center;font-size:clamp(17px,1.9vw,25px);letter-spacing:.2em;line-height:1;white-space:nowrap}
.cover .c{position:absolute;z-index:1;left:7%;right:7%;bottom:6%;font-size:12.5px;line-height:1.35;text-align:left}.cover .c b{display:block;font-weight:400;text-transform:uppercase}
.cover .w{position:absolute;z-index:1;right:7%;bottom:6%;font-size:clamp(40px,5vw,64px);line-height:.8}
.duo{display:flex;justify-content:center;align-items:center;gap:16px;margin:44px 0 0;font-family:var(--sans);font-size:15px}.duo i{width:1px;height:16px;background:var(--ink)}.duo a:hover{color:var(--mute)}
.hero{position:relative;margin-top:44px;height:min(88vh,800px);min-height:480px;overflow:hidden;background:#1b1b1b;color:#fff}
.hero>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hero::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.66),rgba(0,0,0,.12) 52%,rgba(0,0,0,0) 72%);pointer-events:none}
.hero .in{position:absolute;z-index:1;left:var(--g);right:var(--g);bottom:40px;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:48px;align-items:end}
.hero .k{display:block;font-family:var(--serif);font-size:clamp(26px,2.3vw,32px);line-height:1.15;text-transform:uppercase;margin-bottom:8px}
.hero h2{font-family:var(--zh);font-size:clamp(22px,2.1vw,30px);line-height:1.42;max-width:22em}.hero h2 a:hover{opacity:.85}
.hero .ls>p{font-size:15px;line-height:20px;text-transform:uppercase;margin-bottom:10px}
.hero .ls{justify-self:end;width:min(100%,420px)}.hero .ls ol{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:28px;font-family:var(--serif);font-size:15px;line-height:20px}
.hero .ls li{display:contents}.hero .ls span{opacity:.75}.hero .ls a{opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hero .ls a:hover{opacity:1}
.sect{padding-top:clamp(88px,9vw,140px)}
.sh{display:flex;justify-content:space-between;align-items:baseline;gap:24px;margin:0 var(--g) 40px;padding-bottom:12px;border-bottom:1px solid var(--ink)}
.sh h2{font-family:var(--serif);font-size:clamp(26px,2.3vw,32px);line-height:1.2}.sh a,.sh span{font-family:var(--sans);font-size:13px;white-space:nowrap}.sh a:hover{color:var(--mute)}
.row{display:grid;grid-auto-flow:column;grid-auto-columns:calc((100% - 4*18px)/4.55);gap:18px;overflow-x:auto;padding:0 var(--g);scroll-padding-inline:var(--g);scroll-snap-type:x mandatory;scrollbar-width:none}.row::-webkit-scrollbar{display:none}.row>*{scroll-snap-align:start}
.card{display:block}.card .im{position:relative;aspect-ratio:3/4;background:var(--ph);overflow:hidden}.card .im img{width:100%;height:100%;object-fit:cover;transition:opacity .25s}.card:hover .im img{opacity:.88}
.card .lb{margin-top:8px;display:flex;align-items:center;gap:8px}.card h3{font-family:var(--sans);font-size:15px;line-height:1.6;font-weight:500;margin-top:10px}.card:hover h3{text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
.card .d{font-family:var(--sans);font-size:14px;line-height:1.55;color:var(--mute);margin-top:4px}
.mk,.mkM,.mkL{flex:none;object-fit:contain;background:#fff;box-shadow:0 0 0 1px var(--hair)}.mk{width:20px;height:20px}.mkM{width:52px;height:52px}.mkL{display:block;width:112px;height:112px;margin:0 auto 32px}
.mk.t,.mkM.t,.mkL.t{display:grid;place-items:center;background:#000;color:#fff;box-shadow:none;font-family:var(--serif);line-height:1}.mk.t{font-size:12px}.mkM.t{font-size:28px}.mkL.t{font-size:60px}
.mono{position:absolute;inset:0;display:grid;place-items:center;background:#000;color:#fff;font-family:var(--serif);font-size:clamp(120px,13vw,220px);line-height:1}
.feat{text-align:center;padding:clamp(104px,10vw,170px) var(--g) 0}
.feat .k{display:block;font-family:var(--serif);font-size:clamp(28px,3.1vw,46px);line-height:1.08;text-transform:uppercase;margin-bottom:14px}
.feat h2{font-family:var(--zh);font-size:clamp(22px,2.5vw,34px);line-height:1.55;max-width:26em;margin:0 auto}
.feat .ph{display:block;width:min(212px,52vw);aspect-ratio:3/4;margin:56px auto 0;overflow:hidden;background:var(--ph);position:relative}.feat .ph img{width:100%;height:100%;object-fit:cover}
.feat .lb{margin-top:16px}.feat .lb a{text-decoration:underline;text-underline-offset:3px}
.band{background:var(--sage);margin-top:clamp(104px,10vw,170px);padding:clamp(72px,8vw,120px) var(--g)}
.band .bh{text-align:center;margin-bottom:clamp(48px,5vw,72px);font-family:var(--serif);font-size:clamp(24px,2.3vw,32px);line-height:1.2}.band .bh h2{text-transform:uppercase}
.band .cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:48px 18px;max-width:1000px;margin:0 auto}
.band .more{display:inline-block;margin-top:14px;font-family:var(--sans);font-size:13px;text-decoration:underline;text-underline-offset:3px}
.band .none{font-family:var(--sans);font-size:14px;color:var(--mute);padding-top:12px;border-top:1px solid var(--ink)}
.wrow{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1.6fr) 110px;gap:24px;align-items:center;margin:0 var(--g);padding:20px 0;border-bottom:1px solid var(--ink)}
.wrow .n{display:flex;align-items:center;gap:18px;font-family:var(--serif);font-size:clamp(22px,2.2vw,32px);line-height:1.1;text-transform:uppercase}.wrow .n small{display:block;margin-top:6px;font-family:var(--sans);font-size:13px;text-transform:none;color:var(--mute)}
a.wrow:hover .n{color:var(--mute)}.wrow .c{text-align:right}
.ticks{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px}.ticks i{height:10px;box-shadow:inset 0 0 0 1px var(--ink)}.ticks i.on{background:var(--ink)}
.quiet{margin:40px var(--g) 0;font-family:var(--serif);font-size:clamp(20px,1.9vw,26px);line-height:1.5}.quiet .lb{display:block;margin-bottom:10px;color:var(--mute)}
.issues{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:72px 18px;padding:0 var(--g)}
.iss{display:block;text-align:center}.iss .cover{width:min(230px,62%);margin:0 auto}.iss .lb{margin-top:40px}.iss .lb u{text-underline-offset:4px;margin-right:8px}
.iss h3{font-family:var(--serif);font-size:17px;line-height:1.3;text-transform:uppercase;margin-top:12px}.iss .d{font-family:var(--sans);font-size:14px;margin-top:10px;color:var(--mute)}.iss:hover h3{color:var(--mute)}
.cats{text-align:center;padding:clamp(104px,10vw,170px) var(--g) 0;font-family:var(--serif);font-size:clamp(22px,2.3vw,32px);line-height:1.4}.cats a:hover{color:var(--mute)}.cats a[aria-current]{color:var(--faint)}
.hr{height:1px;background:var(--ink);margin:56px var(--g) 0}
.foot{background:#000;color:#fff;margin-top:clamp(88px,9vw,140px);padding:64px var(--g) 28px}
.foot .ft{text-align:center;font-family:var(--serif);font-size:clamp(24px,2.3vw,32px);line-height:1.2}.foot .ft h2{text-transform:uppercase;letter-spacing:.2em}
.foot .about{max-width:38em;margin:40px auto 0;text-align:center;font-family:var(--sans);font-size:14px;line-height:1.85;color:#d2d2d2}.foot .about b{color:#fff;font-weight:500}
.foot .bot{display:flex;justify-content:space-between;gap:12px 24px;flex-wrap:wrap;margin-top:72px;padding-top:16px;border-top:1px solid #fff;font-family:var(--sans);font-size:13px;line-height:18px;text-transform:uppercase;letter-spacing:.03em}
.foot nav{display:flex;gap:20px;flex-wrap:wrap}.foot a:hover{color:#bdbdbd}
img.lo{object-fit:scale-down!important;background:var(--sage)}.hero>img.lo{background:#1b1b1b}
/* 每期統整文章 */
.theme{max-width:30em;margin:28px auto 0;font-family:var(--zh);font-size:clamp(18px,1.7vw,22px);line-height:1.8}
.ihead+.hero{margin-top:56px}
.toc{padding-top:clamp(88px,9vw,140px)}.toc .cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:40px 18px;padding:0 var(--g)}
.toc h3{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding-bottom:10px;border-bottom:1px solid var(--ink);font-family:var(--serif);font-size:24px;line-height:1.2}.toc h3 span{font-family:var(--sans);font-size:13px;color:var(--mute)}
.toc li{border-bottom:1px solid var(--hair)}.toc li a{display:block;padding:14px 0;font-family:var(--body);font-size:15.5px;line-height:1.7;letter-spacing:.02em}.toc li a:hover{color:var(--mute)}
.toc li b{display:flex;align-items:center;gap:8px;font-weight:400;font-family:var(--sans);font-size:13px;line-height:17px;margin-bottom:6px}.toc .none{padding:14px 0;font-family:var(--sans);font-size:14px;color:var(--mute)}
.chap{padding-top:clamp(104px,10vw,170px);scroll-margin-top:16px}.chap-h{text-align:center;margin:0 var(--g) clamp(40px,5vw,72px)}
.chap-h h2{font-family:var(--serif);font-size:clamp(44px,5.4vw,80px);line-height:1;text-transform:uppercase;letter-spacing:-.01em}.chap-h p{font-family:var(--zh);font-size:clamp(17px,1.5vw,20px);margin-top:14px}.chap-h .lb{display:block;margin-top:10px;color:var(--mute)}
.sb{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start;margin:0 var(--g);padding:clamp(40px,4vw,64px) 0;border-top:1px solid var(--ink);scroll-margin-top:16px}
.sb.rev .pic{order:2;justify-self:end}.sb .pic{position:sticky;top:24px;width:min(100%,520px)}.sb .ph{display:block;aspect-ratio:4/5;background:var(--ph);overflow:hidden}.sb .ph img{width:100%;height:100%;object-fit:cover}.sb .cap{margin-top:8px;color:var(--mute)}
.sb .nm{font-family:var(--serif);font-size:clamp(56px,7vw,112px);line-height:.94;text-transform:uppercase;letter-spacing:-.015em;overflow-wrap:anywhere;padding-top:8px}
.sb .st{max-width:34em;padding:4px 0 0 clamp(0px,2vw,40px)}.sb.rev .st{padding:4px clamp(0px,2vw,40px) 0 0;justify-self:end}
.sb .who{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.sb .who a{text-transform:uppercase;letter-spacing:.04em}.sb .who a:hover{color:var(--mute)}.sb .who span{color:var(--mute)}
.sb h3{font-family:var(--zh);font-size:clamp(22px,2.1vw,30px);line-height:1.5;margin:18px 0 12px}.sb h3 a:hover{color:var(--mute)}
.sb .when{color:var(--mute);margin-bottom:28px}.sb .sum{font-family:var(--body);font-size:16.5px;line-height:2;letter-spacing:.02em;text-indent:2em}
.sb .why{margin-top:32px;padding-top:14px;border-top:1px solid var(--ink)}.sb .why h4{margin:0 0 8px;font-family:var(--serif);font-weight:400;font-size:17px;text-transform:uppercase;letter-spacing:.02em}.sb .why p{font-family:var(--body);font-size:15.5px;line-height:1.95;letter-spacing:.02em}
.sb .src{margin-top:28px;color:var(--mute);line-height:1.8}.sb .src a{text-decoration:underline;text-decoration-color:var(--faint);text-underline-offset:3px}.sb .src a:hover{color:var(--ink)}
.back{padding:20px var(--g) 0}.back a{text-decoration:underline;text-underline-offset:3px}
/* 列表頁(每期全部動態、全部動態、品牌) */
.phd{text-align:center;padding:72px var(--g) 0}
.phd h1{font-family:var(--serif);font-size:clamp(34px,3.5vw,50px);line-height:1.04;text-transform:uppercase}
.phd .zh{font-family:var(--zh);font-size:clamp(18px,1.6vw,22px);margin-top:12px}
.phd .lb{margin-top:16px}.phd .p{max-width:36em;margin:20px auto 0;font-family:var(--sans);font-size:15px;line-height:1.8;color:var(--mute)}
.sel{position:relative;display:inline-flex;align-items:center;font-family:var(--sans);font-size:15px;line-height:20px;text-transform:uppercase}
.sel select{appearance:none;-webkit-appearance:none;border:0;border-radius:0;background:transparent;font:inherit;text-transform:inherit;color:inherit;padding:4px 26px 4px 0;cursor:pointer}
.sel svg{position:absolute;right:0;width:14px;height:14px;pointer-events:none}
.filters{margin-top:28px;font-family:var(--serif);font-size:clamp(22px,2.3vw,32px);line-height:1.4}.filters a:hover{color:var(--mute)}.filters a[aria-current]{color:var(--faint)}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:64px 18px;padding:56px var(--g) 0}
.empty{text-align:center;padding:72px var(--g) 0;font-family:var(--sans);font-size:15px;color:var(--mute)}
.viewing{position:sticky;bottom:0;z-index:20;display:grid;grid-template-columns:1fr auto 1fr;gap:16px;margin-top:96px;padding:14px var(--g);background:var(--paper);border-top:1px solid var(--hair);font-family:var(--sans);font-size:13px;line-height:18px;text-transform:uppercase}
.viewing>:last-child{text-align:right}.viewing a:hover{color:var(--mute)}
.pager{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:96px var(--g) 0;padding-top:16px;border-top:1px solid var(--ink)}
.pager a{display:block}.pager .nx{grid-column:2;text-align:right}.pager .lb{color:var(--mute)}.pager b{display:block;font-weight:400;font-family:var(--serif);font-size:clamp(26px,2.3vw,32px);line-height:1.2;margin-top:6px;text-transform:uppercase}.pager a:hover b{color:var(--mute)}
/* 單則動態 */
.split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));min-height:min(calc(100vh - 76px),920px)}
.split .im{position:relative;background:var(--ph);overflow:hidden;min-height:540px}.split .im img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.split .tx{display:grid;grid-template-rows:auto 1fr;padding:44px var(--g) 44px 44px}
.split .by{text-align:right;font-size:20px;line-height:1.3}.split .by span{text-transform:uppercase}
.split h1{align-self:center;text-align:center;font-family:var(--serif);text-transform:uppercase;line-height:.94;letter-spacing:-.015em;overflow-wrap:anywhere}
.credit{padding:8px var(--g) 0;width:50%}
.dek{padding:72px var(--g) 0;max-width:calc(30em + 2*var(--g));font-family:var(--zh);font-size:clamp(22px,2.3vw,32px);line-height:1.5}
.meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;padding:88px var(--g) 0;font-family:var(--sans);font-size:15px;line-height:20px}
.meta>div>b{display:flex;align-items:center;gap:8px;font-weight:400;text-transform:uppercase;letter-spacing:.01em}.meta span{display:block;color:var(--mute);margin-top:2px}
.body{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;padding:104px var(--g) 0;align-items:start}
.body .side figure{margin:0 0 48px;width:min(330px,100%)}.body .side figure a{display:block;background:var(--ph)}.body .side figcaption{margin-top:8px}
.txt{max-width:34em;font-family:var(--body);font-size:17px;line-height:2;letter-spacing:.02em}.txt>p{text-indent:2em}.txt>p+p{margin-top:1em}
.why{margin-top:56px;padding-top:16px;border-top:1px solid var(--ink)}.why h2{font-family:var(--serif);font-size:20px;line-height:1.3;text-transform:uppercase;margin-bottom:12px}
.facts{margin-top:56px;border-top:1px solid var(--ink)}.facts div{display:grid;grid-template-columns:7em minmax(0,1fr);gap:16px;padding:12px 0;border-bottom:1px solid var(--hair);font-family:var(--sans);font-size:14px;line-height:1.75}
.facts dt{color:var(--mute)}.facts dd{margin:0}.facts a{text-decoration:underline;text-decoration-color:var(--faint);text-underline-offset:3px}.facts a:hover{text-decoration-color:var(--ink)}
.facts li+li{margin-top:6px}
@media (max-width:1000px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}.row{grid-auto-columns:calc((100% - 2*18px)/2.6)}}
@media (max-width:900px){.hero .in{grid-template-columns:minmax(0,1fr)}.hero .ls{display:none}.toc .cols,.sb{grid-template-columns:minmax(0,1fr)}.sb .pic{position:static;width:100%}.sb.rev .pic{order:0}.sb .st,.sb.rev .st{padding:24px 0 0;justify-self:start}.sb .nm{font-size:56px}
.split,.body{grid-template-columns:minmax(0,1fr)}.split{min-height:0}.split .im{min-height:0;aspect-ratio:4/5}.split .tx{padding:28px var(--g) 8px}.split h1{margin:40px 0 8px}.credit{width:auto}
.meta{grid-template-columns:repeat(2,minmax(0,1fr));gap:24px 16px}.body .side{order:2;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.body .side figure{width:auto;margin:48px 0 0}
.band .cols,.issues{grid-template-columns:minmax(0,1fr)}.wrow{grid-template-columns:minmax(0,1fr) 120px}.wrow .ticks{display:none}}
@media (max-width:700px){.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:44px 12px}.row{grid-auto-columns:72%;gap:12px}.top{height:60px}.logo{font-size:20px}
.menu nav{grid-template-columns:minmax(0,1fr)}.viewing{grid-template-columns:1fr 1fr}.viewing>:nth-child(2){display:none}.dek,.meta,.body{padding-top:56px}.foot .bot{flex-direction:column}}
`;

const FONTS = 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..600&family=Noto+Sans+TC:wght@400;500&family=Noto+Serif+TC:wght@400;600&display=swap';
const CHEVRON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M3 6l5 5 5-5"/></svg>';
const SCRIPT = `<script>(function(){var m=document.getElementById('menu');document.querySelectorAll('[data-menu]').forEach(function(b){b.addEventListener('click',function(){var o=!m.classList.contains('open');m.classList.toggle('open',o);document.body.style.overflow=o?'hidden':'';var f=m.querySelector(o?'nav a':null);if(f)f.focus()})});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&m.classList.contains('open')){m.classList.remove('open');document.body.style.overflow=''}});function fit(i){if(!i.naturalWidth)return;var r=i.getBoundingClientRect();if(i.naturalWidth<r.width*.9||i.naturalHeight<r.height*.9)i.classList.add('lo')}document.querySelectorAll('img[data-fit]').forEach(function(i){if(i.complete)fit(i);else i.addEventListener('load',function(){fit(i)})});document.querySelectorAll('select[data-go]').forEach(function(s){s.addEventListener('change',function(){if(s.value)location.href=s.value})})})();</script>`;

// ---------- 外框 ----------
function page(s: Site, o: { title: string; body: string; draft?: string | null; desc?: string }): string {
  const L = s.link;
  const nav = `<div class="top"><a class="logo" href="${esc(L('/'))}">APAC RADAR</a><button class="burger x" type="button" data-menu aria-label="關閉選單"><i></i><i></i></button></div>
<nav aria-label="網站選單"><div><span class="lb">Read</span><a href="${esc(L('/'))}">This Week</a><a href="${esc(L('/w'))}">All Issues</a><a href="${esc(L('/c'))}">All Stories</a><a href="${esc(L('/b'))}">Brands</a></div>
<div><span class="lb">Categories</span>${CATEGORIES.map(c => `<a href="${esc(L('/c/' + c))}">${CATEGORY_EN[c]}</a>`).join('')}</div></nav>`;
  return `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(o.title)}</title><meta name="robots" content="noindex,nofollow">${o.desc ? `<meta name="description" content="${esc(o.desc)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${FONTS}">
<style>${CSS}</style></head><body>
<header class="top"><a class="logo" href="${esc(L('/'))}">APAC RADAR</a><button class="burger" type="button" data-menu aria-label="開啟選單" aria-controls="menu"><i></i><i></i></button></header>
<div class="menu" id="menu">${nav}</div>
<main>${o.body}</main>
${footer(s)}
${o.draft ? `<div class="draftbar"><span>草稿預覽：這一期還沒發布，只有帶管理金鑰的人看得到。</span><span>${esc(wlabel(o.draft))}</span></div>` : ''}
${SCRIPT}</body></html>`;
}

function footer(s: Site): string {
  const L = s.link;
  return `<footer class="foot"><div class="ft"><h2>APAC Radar</h2><p>A weekly read on tea brands across Asia Pacific</p></div>
<p class="about">每週一早上，系統替17個茶飲品牌整理上一週的<b>新品</b>、<b>行銷檔期</b>與<b>會員經營</b>動態。每則都附來源；標示<b>已佐證</b>代表至少兩個獨立來源說法一致，<b>單一來源</b>的請先看、別轉述。圖片以品牌官方素材優先，其次是報導配圖，都標出處。</p>
<div class="bot"><span>${esc(s.orgName)}</span><nav><a href="${esc(L('/'))}">This Week</a><a href="${esc(L('/w'))}">All Issues</a><a href="${esc(L('/c'))}">All Stories</a><a href="${esc(L('/b'))}">Brands</a></nav><span>Internal use only</span></div></footer>`;
}

// ---------- 元件 ----------
interface Ctx { s: Site; brands: Map<string, Brand>; images: Record<string, ItemImage[]> }
const ctxOf = (s: Site, brands: Brand[], images: Record<string, ItemImage[]>): Ctx => ({ s, brands: new Map(brands.map(b => [b.id, b])), images });
const storyHref = (c: Ctx, it: Item) => c.s.link(`/s/${it.id}`);
const imgSrc = (im: ItemImage) => `/img/${im.kv_key.replace(/^img\//, '')}`;
const initial = (c: Ctx, it: Item) => (enName(c.brands.get(it.brand_id), it.brand_id).trim()[0] ?? '·').toUpperCase();

/** 品牌標誌:有 logo 用 logo,沒有就用黑底首字母方塊 */
function mark(id: string, b: Brand | undefined, cls: 'mk' | 'mkM' | 'mkL') {
  const px = cls === 'mk' ? 20 : cls === 'mkM' ? 52 : 112;
  if (LOGO_IDS.has(id)) return `<img class="${cls}" src="/logo/${esc(id)}.png" alt="" width="${px}" height="${px}" loading="lazy" decoding="async">`;
  return `<span class="${cls} t" aria-hidden="true">${esc((enName(b, id).trim()[0] ?? '·').toUpperCase())}</span>`;
}

function picture(c: Ctx, it: Item, eager = false) {
  const im = bySize(c.images[it.id])[0];
  return im ? `<img data-fit src="${esc(imgSrc(im))}" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async">` : `<span class="mono" aria-hidden="true">${esc(initial(c, it))}</span>`;
}

/** 圖卡。issue:同一期裡,標籤寫品牌;cross:跨期,標籤寫第幾週 */
function card(c: Ctx, it: Item, mode: 'issue' | 'cross', href?: string) {
  const b = c.brands.get(it.brand_id);
  const label = mode === 'issue' ? `${CATEGORY_EN[it.category]}, ${enName(b, it.brand_id)}` : `${CATEGORY_EN[it.category]}, ${wlabel(it.week)}`;
  const dek = mode === 'issue' ? [it.market, itemDates(it)].filter(Boolean).join(' · ') : [b?.name_zh ?? it.brand_id, it.market].filter(Boolean).join(' · ');
  return `<a class="card" href="${esc(href ?? storyHref(c, it))}"><div class="im">${picture(c, it)}</div><p class="lb">${mark(it.brand_id, b, 'mk')}<span>${esc(label)}</span></p><h3>${esc(it.title)}</h3><p class="d">${esc(dek)}</p></a>`;
}

function coverBlock(issue: { week: string; no: number | null; range_start: string; range_end: string }, key: string | null, href: string, tag = 'a') {
  const img = key ? `<img data-fit src="${esc('/img/' + key.replace(/^img\//, ''))}" alt="" loading="lazy">` : '';
  return `<${tag} class="cover${key ? ' img' : ''}"${tag === 'a' ? ` href="${esc(href)}"` : ''}>${img}<span class="m">APAC RADAR</span><span class="c"><b>Week ${esc(wnum(issue.week))} Issue</b>${esc(rangeShort(issue.range_start, issue.range_end))}</span><span class="w">${esc(pad2(issue.no))}</span></${tag}>`;
}

function issueSelect(s: Site, issues: IssueSummary[], current: string | null, suffix: string, allLabel?: string) {
  const opts = [
    ...(allLabel ? [`<option value="${esc(s.link('/c' + suffix))}"${current ? '' : ' selected'}>${esc(allLabel)}</option>`] : []),
    ...issues.map(i => `<option value="${esc(s.link(`/w/${i.week}/stories${suffix ? '?c=' + suffix.slice(1) : ''}`))}"${i.week === current ? ' selected' : ''}>${esc(wlabel(i.week))}${i.status === 'published' ? '' : '（草稿）'}</option>`),
  ];
  return `<label class="sel"><span class="vh" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">選擇期數</span><select data-go>${opts.join('')}</select>${CHEVRON}</label>`;
}

function filterLine(hrefs: { all: string; cat: (c: Cat) => string }, current: Cat | null) {
  const a = (href: string, text: string, on: boolean) => `<a href="${esc(href)}"${on ? ' aria-current="page"' : ''}>${text}</a>`;
  return `<p class="filters">${[a(hrefs.all, 'All', !current), ...CATEGORIES.map(c => a(hrefs.cat(c), CATEGORY_EN[c], current === c))].join(', ')}</p>`;
}

// ---------- 首頁(雜誌封面式,點進去是當期統整文章) ----------
export function renderHome(b: IssueBundle, s: Site, issues: IssueSummary[]): string {
  const L = s.link;
  const c = ctxOf(s, b.brands, b.images);
  const { issue, items } = b;
  const issueHref = L(`/w/${issue.week}`);
  const anchor = (it: Item) => `${issueHref}#${it.id}`;
  const lead = pickLead(items, b.images);
  const active = new Set(items.map(i => i.brand_id)).size;
  const coverKey = bySize(items.filter(i => i !== lead).flatMap(i => b.images[i.id] ?? []))[0]?.kv_key ?? (lead ? bySize(b.images[lead.id])[0]?.kv_key ?? null : null);

  const head = `<section class="ihead"><h1>Issue ${esc(pad2(issue.no))}<br>${esc(wlabel(issue.week))}</h1>
<p class="lb">${esc(rangeLong(issue.range_start, issue.range_end))} · ${items.length} stories from ${active} brands</p>
${coverBlock(issue, coverKey, issueHref)}
<p class="duo"><a href="${esc(issueHref)}">Read the Issue</a><i aria-hidden="true"></i><a href="${esc(L('/w'))}">All Issues</a></p></section>`;

  const hero = lead ? heroBlock(c, b, lead, issueHref, anchor) : '';

  const band = `<section class="band"><div class="bh"><h2>In This Issue</h2><p>Three ways into ${esc(wlabel(issue.week))}</p></div><div class="cols">${CATEGORIES.map(cat => {
    const list = items.filter(i => i.category === cat);
    const top = pickLead(list.filter(i => i !== lead).length ? list.filter(i => i !== lead) : list, b.images);
    return `<div>${top ? card(c, top, 'issue', anchor(top)) + `<a class="more" href="${esc(issueHref + '#' + cat)}">${list.length} ${list.length === 1 ? 'story' : 'stories'} in ${CATEGORY_EN[cat]}</a>` : `<p class="lb" style="margin-bottom:8px">${CATEGORY_EN[cat]}</p><p class="none">這一週沒有${CATEGORY_ZH[cat]}的動態。</p>`}</div>`;
  }).join('')}</div><p class="bh" style="margin:64px 0 0"><a class="more" style="font-size:15px" href="${esc(issueHref)}">Read the full issue, ${items.length} stories</a></p></section>`;

  const past = issues.slice(0, 3);
  const pastHtml = past.length > 1 ? `<section class="sect"><div class="sh"><h2>Recent Issues</h2><a href="${esc(L('/w'))}">View All</a></div>
<div class="issues">${past.map((p, i) => issueTile(s, p, i === 0)).join('')}</div></section>` : '';

  const body = `${head}${hero}${band}${brandWatch(c, b)}${pastHtml}
<p class="cats"><a href="${esc(L('/c'))}">All</a>, ${CATEGORIES.map(cat => `<a href="${esc(L('/c/' + cat))}">${CATEGORY_EN[cat]}</a>`).join(', ')}, <a href="${esc(L('/b'))}">Brands</a></p><div class="hr"></div>`;
  return page(s, { title: `APAC Radar · ${wlabel(issue.week)}, ${rangeShort(issue.range_start, issue.range_end)}`, body, draft: issue.status !== 'published' ? issue.week : null, desc: lead?.title });
}

function heroBlock(c: Ctx, b: IssueBundle, lead: Item, issueHref: string, anchor: (it: Item) => string) {
  const im = bySize(b.images[lead.id])[0];
  return `<section class="hero">${im ? `<img data-fit src="${esc(imgSrc(im))}" alt="" loading="eager">` : ''}
<div class="in"><div><span class="k">${esc(enName(c.brands.get(lead.brand_id), lead.brand_id))}</span><h2><a href="${esc(anchor(lead))}">${esc(lead.title)}</a></h2></div>
<div class="ls"><p>This Week</p><ol>${b.items.map(i => `<li><span>${esc(CATEGORY_EN[i.category])}</span><a href="${esc(anchor(i))}" title="${esc(i.title)}">${esc(enName(c.brands.get(i.brand_id), i.brand_id))} · ${esc(i.market)}</a></li>`).join('')}</ol></div></div></section>`;
}

function brandWatch(c: Ctx, b: IssueBundle) {
  const L = c.s.link;
  const thisWeek = new Set(b.items.map(i => i.brand_id));
  const rows = b.brands.filter(br => thisWeek.has(br.id))
    .sort((x, y) => ((b.activity[y.id]?.length ?? 0) - (b.activity[x.id]?.length ?? 0)) || x.sort - y.sort).map(br => {
      const weeks = new Set(b.activity[br.id] ?? []); const n = b.items.filter(i => i.brand_id === br.id).length; const mk: string[] = JSON.parse(br.markets);
      return `<a class="wrow" href="${esc(L('/b/' + br.id))}"><span class="n">${mark(br.id, br, 'mkM')}<span>${esc(enName(br))}<small>${esc(br.name_zh)} · ${esc(mk.join(' · '))}</small></span></span><span class="ticks" title="近八週有動態的週">${b.weeks8.map(w => `<i${weeks.has(w) ? ' class="on"' : ''}></i>`).join('')}</span><span class="lb c">${n} ${n === 1 ? 'story' : 'stories'}</span></a>`;
    }).join('');
  return `<section class="sect"><div class="sh"><h2>Brand Watch</h2><span>Last eight weeks</span></div>${rows}
<p class="quiet"><span class="lb">Quiet this week · 本週安靜</span>${b.quiet.map(q => `<a href="${esc(L('/b/' + q.id))}">${esc(q.name_zh)}</a>`).join(', ') || '沒有品牌安靜。'}</p></section>`;
}

/** 統整文章裡的一則動態:圖文左右交錯,全文、為什麼重要、來源都在這裡 */
function storyBlock(c: Ctx, b: IssueBundle, it: Item, i: number) {
  const br = c.brands.get(it.brand_id);
  const im = bySize(b.images[it.id])[0];
  const srcs = b.sources[it.id] ?? [];
  const meta = [it.market, itemDates(it), it.status_note].filter(Boolean).join(' · ');
  const links = srcs.map(x => { const u = safeUrl(x.url); const t = x.publisher || host(x.url); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t); }).join('、');
  const left = im ? `<a class="ph" href="${esc(storyHref(c, it))}"><img data-fit src="${esc(imgSrc(im))}" alt="" loading="lazy" decoding="async"></a><p class="lb cap">${esc(im.credit)}</p>`
    : `<p class="nm" aria-hidden="true">${esc(enName(br, it.brand_id))}</p>`;
  return `<article class="sb${i % 2 ? ' rev' : ''}" id="${esc(it.id)}"><div class="pic">${left}</div><div class="st">
<p class="lb who">${mark(it.brand_id, br, 'mk')}<a href="${esc(c.s.link('/b/' + it.brand_id))}">${esc(enName(br, it.brand_id))}</a><span>${esc(br?.name_zh ?? '')}</span></p>
<h3><a href="${esc(storyHref(c, it))}">${esc(it.title)}</a></h3><p class="lb when">${esc(meta)}</p>
<p class="sum">${esc(it.summary)}</p>
${it.observation ? `<div class="why"><h4>Why it matters</h4><p>${esc(it.observation)}</p></div>` : ''}
<p class="lb src">${it.confidence === 'verified' ? '已佐證' : '單一來源'}${links ? ' · 來源：' + links : ''}</p></div></article>`;
}

// ---------- 每期統整文章 ----------
export function renderIssue(b: IssueBundle, s: Site, issues: IssueSummary[]): string {
  const L = s.link;
  const c = ctxOf(s, b.brands, b.images);
  const { issue, items } = b;
  const active = new Set(items.map(i => i.brand_id)).size;
  const lead = pickLead(items, b.images);
  const anchor = (it: Item) => `#${it.id}`;
  const idx = issues.findIndex(i => i.week === issue.week);
  const older = idx >= 0 ? issues[idx + 1] : undefined, newer = idx > 0 ? issues[idx - 1] : undefined;

  const head = `<section class="ihead"><h1>Issue ${esc(pad2(issue.no))}<br>${esc(wlabel(issue.week))}</h1>
<p class="lb">${esc(rangeLong(issue.range_start, issue.range_end))} · ${items.length} stories from ${active} brands · ${b.quiet.length} quiet</p>
${issue.theme_line ? `<p class="theme">${esc(issue.theme_line)}</p>` : ''}</section>`;

  const toc = `<section class="toc"><div class="sh"><h2>Contents</h2><span>本期目錄</span></div><div class="cols">${CATEGORIES.map(cat => {
    const list = items.filter(i => i.category === cat);
    return `<div><h3><a href="#${cat}">${CATEGORY_EN[cat]}</a><span>${CATEGORY_ZH[cat]} · ${list.length}</span></h3><ol>${list.length ? list.map(i => `<li><a href="${anchor(i)}"><b>${mark(i.brand_id, c.brands.get(i.brand_id), 'mk')}${esc(enName(c.brands.get(i.brand_id), i.brand_id))}</b>${esc(i.title)}</a></li>`).join('') : `<li class="none">這一週沒有${CATEGORY_ZH[cat]}的動態。</li>`}</ol></div>`;
  }).join('')}</div></section>`;

  const chapters = CATEGORIES.map(cat => {
    const list = items.filter(i => i.category === cat);
    if (!list.length) return '';
    const ordered = lead && lead.category === cat ? [lead, ...list.filter(i => i !== lead)] : list;
    return `<section class="chap" id="${cat}"><div class="chap-h"><h2>${CATEGORY_EN[cat]}</h2><p>${CATEGORY_ZH[cat]}</p><span class="lb">${list.length} ${list.length === 1 ? 'story' : 'stories'}</span></div>${ordered.map((it, i) => storyBlock(c, b, it, i)).join('')}</section>`;
  }).join('');

  const pager = older || newer ? `<nav class="pager" aria-label="上一期下一期">${older ? `<a href="${esc(L(`/w/${older.week}`))}"><span class="lb">Previous Issue</span><b>${esc(wlabel(older.week))}</b></a>` : ''}${newer ? `<a class="nx" href="${esc(L(`/w/${newer.week}`))}"><span class="lb">Next Issue</span><b>${esc(wlabel(newer.week))}</b></a>` : ''}</nav>` : '';

  const body = `${head}${lead ? heroBlock(c, b, lead, '', anchor) : ''}${toc}${chapters}${brandWatch(c, b)}${pager}
<div class="viewing"><a href="${esc(L('/'))}">Home</a><span>Reading: Issue ${esc(pad2(issue.no))}, ${esc(wlabel(issue.week))}</span><a href="${esc(L(`/w/${issue.week}/stories`))}">All Stories</a></div>`;
  return page(s, { title: `Issue ${pad2(issue.no)} · ${wlabel(issue.week)}, ${rangeShort(issue.range_start, issue.range_end)} · APAC Radar`, body, draft: issue.status !== 'published' ? issue.week : null, desc: lead?.title });
}

function issueTile(s: Site, p: IssueSummary, latest: boolean) {
  const href = s.link(`/w/${p.week}`);
  return `<a class="iss" href="${esc(href)}">${coverBlock(p, p.cover_key, href, 'div')}<p class="lb">${latest ? '<u>New</u>' : ''}${p.status === 'published' ? 'Issue ' + esc(pad2(p.no)) : '草稿'}</p>
<h3>${esc(wlabel(p.week))}<br>${esc(rangeShort(p.range_start, p.range_end))}</h3><p class="d">${p.items} stories · ${p.brands} brands</p></a>`;
}

// ---------- 每期全部動態 ----------
export function renderIssueStories(b: IssueBundle, s: Site, issues: IssueSummary[], cat: Cat | null): string {
  const L = s.link;
  const c = ctxOf(s, b.brands, b.images);
  const { issue } = b;
  const list = cat ? b.items.filter(i => i.category === cat) : b.items;
  const idx = issues.findIndex(i => i.week === issue.week);
  const older = idx >= 0 ? issues[idx + 1] : undefined, newer = idx > 0 ? issues[idx - 1] : undefined;
  const pager = older || newer ? `<nav class="pager" aria-label="上一期下一期">${older ? `<a href="${esc(L(`/w/${older.week}/stories`))}"><span class="lb">Previous Issue</span><b>${esc(wlabel(older.week))}</b></a>` : ''}${newer ? `<a class="nx" href="${esc(L(`/w/${newer.week}/stories`))}"><span class="lb">Next Issue</span><b>${esc(wlabel(newer.week))}</b></a>` : ''}</nav>` : '';
  const body = `<section class="phd">${issueSelect(s, issues.length ? issues : [{ ...issue, items: 0, brands: 0, lead_title: null, lead_brand: null, cover_key: null }], issue.week, cat ? '/' + cat : '', 'All Issues')}
${filterLine({ all: L(`/w/${issue.week}/stories`), cat: x => L(`/w/${issue.week}/stories?c=${x}`) }, cat)}
<p class="lb">${esc(rangeLong(issue.range_start, issue.range_end))} · <a href="${esc(L(`/w/${issue.week}`))}" style="text-decoration:underline;text-underline-offset:3px">Read the full issue</a></p></section>
<div class="hr"></div>
${list.length ? `<div class="grid">${list.map(i => card(c, i, 'issue')).join('')}</div>` : `<p class="empty">這一期沒有${cat ? CATEGORY_ZH[cat] + '的' : ''}動態。</p>`}
${!cat && b.quiet.length ? `<p class="quiet" style="margin-top:96px"><span class="lb">Quiet this week · 本週安靜</span>${b.quiet.map(q => `<a href="${esc(L('/b/' + q.id))}">${esc(q.name_zh)}</a>`).join(', ')}</p>` : ''}
${pager}
<div class="viewing"><a href="${esc(L('/c'))}">Stories</a><span>Viewing: ${esc(wlabel(issue.week))}${cat ? ', ' + CATEGORY_EN[cat] : ''} (${list.length})</span><a href="${esc(L('/w'))}">All Issues</a></div>`;
  return page(s, { title: `${wlabel(issue.week)}${cat ? ' · ' + CATEGORY_EN[cat] : ''} · APAC Radar`, body, draft: issue.status !== 'published' ? issue.week : null });
}

// ---------- 全部動態 / 分類 ----------
export function renderStories(bundle: ItemsBundle, brands: Brand[], s: Site, issues: IssueSummary[], cat: Cat | null): string {
  const L = s.link;
  const c = ctxOf(s, brands, bundle.images);
  const intro: Record<Cat, string> = {
    new_product: '新飲品、季節系列、菜單改版、品項下架與價格調整。',
    campaign: '聯名、快閃、促銷、節慶活動、名人合作，以及開幕檔期的促銷機制。',
    loyalty: 'App改版、點數與等級規則、訂閱制、生日禮與入會禮、會員專屬活動，以及公開揭露的會員數字。',
  };
  const body = `<section class="phd">${issueSelect(s, issues, null, cat ? '/' + cat : '', 'All Issues')}
${filterLine({ all: L('/c'), cat: x => L('/c/' + x) }, cat)}
${cat ? `<p class="p">${esc(intro[cat])}</p>` : `<p class="p">每一期收錄的全部動態，新的在前。</p>`}</section>
<div class="hr"></div>
${bundle.items.length ? `<div class="grid">${bundle.items.map(i => card(c, i, 'cross')).join('')}</div>` : `<p class="empty">目前還沒有${cat ? CATEGORY_ZH[cat] + '的' : ''}動態。</p>`}
<div class="viewing"><a href="${esc(L('/c'))}">Stories</a><span>Viewing: ${cat ? CATEGORY_EN[cat] : 'All'} (${bundle.items.length})</span><a href="${esc(L('/b'))}">Brands</a></div>`;
  return page(s, { title: `${cat ? CATEGORY_EN[cat] : 'All Stories'} · APAC Radar`, body });
}

// ---------- 全部期數 ----------
export function renderArchive(issues: IssueSummary[], s: Site): string {
  const body = `<section class="phd"><h1>All Issues</h1><p class="lb">${issues.length} ${issues.length === 1 ? 'issue' : 'issues'} so far · 每週一出刊</p></section><div class="hr" style="margin-bottom:72px"></div>
${issues.length ? `<div class="issues">${issues.map((p, i) => issueTile(s, p, i === 0)).join('')}</div>` : '<p class="empty">還沒有任何一期。</p>'}`;
  return page(s, { title: 'All Issues · APAC Radar', body });
}

// ---------- 品牌一覽 ----------
const TIERS: [string, string, string][] = [['core', 'Key Competitors', '重點追蹤'], ['apac', 'Across Asia', '亞太在地品牌'], ['tw', 'Taiwan', '台灣品牌']];
export function renderBrands(brands: Brand[], stats: BrandStat[], s: Site): string {
  const L = s.link;
  const st = new Map(stats.map(x => [x.brand_id, x]));
  const sections = TIERS.map(([tier, en, zh]) => {
    const list = brands.filter(b => b.tier === tier);
    if (!list.length) return '';
    return `<section class="sect"><div class="sh"><h2>${en}</h2><span>${zh}</span></div>${list.map(br => {
      const x = st.get(br.id); const mk: string[] = JSON.parse(br.markets);
      return `<a class="wrow" href="${esc(L('/b/' + br.id))}"><span class="n">${mark(br.id, br, 'mkM')}<span>${esc(enName(br))}<small>${esc(br.name_zh)}</small></span></span><span class="lb">${esc(mk.join(' · '))}</span><span class="lb c">${x ? `${x.items} ${x.items === 1 ? 'story' : 'stories'}<br>Latest ${esc(wlabel(x.last_week ?? ''))}` : 'No stories yet'}</span></a>`;
    }).join('')}</section>`;
  }).join('');
  const body = `<section class="phd"><h1>Brands</h1><p class="p">我們每週追蹤的${brands.length}個茶飲品牌。點品牌可以看它歷來的所有動態。</p></section>${sections}`;
  return page(s, { title: 'Brands · APAC Radar', body });
}

// ---------- 單一品牌 ----------
export function renderBrand(br: Brand, bundle: ItemsBundle, brands: Brand[], s: Site, cat: Cat | null): string {
  const L = s.link;
  const c = ctxOf(s, brands, bundle.images);
  const mk: string[] = JSON.parse(br.markets);
  const list = cat ? bundle.items.filter(i => i.category === cat) : bundle.items;
  const tier = TIERS.find(t => t[0] === br.tier);
  const body = `<section class="phd">${mark(br.id, br, 'mkL')}<h1>${esc(enName(br))}</h1><p class="zh">${esc(br.name_zh)}</p>
<p class="lb">${esc(mk.join(' · '))}${tier ? ' · ' + tier[1] : ''}</p><p class="p">${esc(br.focus)}</p>
${filterLine({ all: L('/b/' + br.id), cat: x => L(`/b/${br.id}?c=${x}`) }, cat)}</section>
<div class="hr"></div>
${list.length ? `<div class="grid">${list.map(i => card(c, i, 'cross')).join('')}</div>` : `<p class="empty">目前收錄的期數裡，${esc(br.name_zh)}還沒有${cat ? CATEGORY_ZH[cat] + '的' : '符合條件的'}動態。</p>`}
<div class="viewing"><a href="${esc(L('/b'))}">Brands</a><span>Viewing: ${esc(enName(br))} (${list.length})</span><a href="${esc(L('/c'))}">All Stories</a></div>`;
  return page(s, { title: `${enName(br)} ${br.name_zh} · APAC Radar`, body });
}

// ---------- 單則動態 ----------
export function renderStory(b: IssueBundle, it: Item, s: Site): string {
  const L = s.link;
  const c = ctxOf(s, b.brands, b.images);
  const br = c.brands.get(it.brand_id);
  const name = enName(br, it.brand_id);
  const imgs = bySize(b.images[it.id]);
  const srcs: ItemSource[] = b.sources[it.id] ?? [];
  const n = name.length;
  const fs = n <= 6 ? 'clamp(68px,9vw,140px)' : n <= 10 ? 'clamp(58px,7vw,112px)' : 'clamp(44px,5.2vw,84px)';
  const first = imgs[0];
  const left = first ? `<a href="${esc(imgSrc(first))}" target="_blank" rel="noopener" class="im"><img data-fit src="${esc(imgSrc(first))}" alt="${esc(it.title)}" loading="eager"></a>` : `<div class="im"><span class="mono" aria-hidden="true">${esc(initial(c, it))}</span></div>`;
  const verified = it.confidence === 'verified';
  const others = b.items.filter(x => x.id !== it.id).sort((x, y) => (+(y.category === it.category) - +(x.category === it.category)) || ((b.images[x.id]?.length ? 0 : 100) + x.rank) - ((b.images[y.id]?.length ? 0 : 100) + y.rank)).slice(0, 3);

  const facts = [
    ['期間', itemDates(it) || '未標示'],
    ['狀態', it.status_note || ''],
    ['市場', it.market],
    ['可信度', verified ? '已佐證：至少兩個獨立來源說法一致' : '單一來源：只找到一個來源，先看、別轉述'],
  ].filter(f => f[1]).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  const srcList = srcs.length ? `<div><dt>來源</dt><dd><ol>${srcs.map(x => { const u = safeUrl(x.url); const t = `${x.publisher || host(x.url)}${x.title ? ',' + x.title : ''}${x.published_at ? ',' + x.published_at : ''}`; return `<li>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t)}</li>`; }).join('')}</ol></dd></div>` : '';

  const body = `<article><section class="split">${left}<div class="tx"><p class="by">${esc(wlabel(it.week))}<br><span>${esc(rangeShort(b.issue.range_start, b.issue.range_end))}</span></p><h1 style="font-size:${fs}">${esc(name)}</h1></div></section>
${first ? `<p class="lb credit">${esc(first.credit)}</p>` : ''}
<p class="dek">${esc(it.title)}</p><p class="lb back"><a href="${esc(L(`/w/${it.week}#${it.id}`))}">Read it in Issue ${esc(pad2(b.issue.no))}, ${esc(wlabel(it.week))}</a></p>
<div class="meta"><div><b>${esc(wlabel(it.week))}, Issue ${esc(pad2(b.issue.no))}</b><span>${esc(rangeShort(b.issue.range_start, b.issue.range_end))}</span></div>
<div><b><a href="${esc(L('/c/' + it.category))}">${CATEGORY_EN[it.category]}</a></b><span>${CATEGORY_ZH[it.category]}</span></div>
<div><b>${mark(it.brand_id, br, 'mk')}<a href="${esc(L('/b/' + it.brand_id))}">${esc(name)}</a></b><span>${esc(br?.name_zh ?? '')} · ${esc(it.market)}</span></div>
<div><b>${srcs.length} ${srcs.length === 1 ? 'Source' : 'Sources'}</b><span>${verified ? '已佐證' : '單一來源'}</span></div></div>
<div class="body"><div class="side">${imgs.slice(1).map(im => `<figure><a href="${esc(imgSrc(im))}" target="_blank" rel="noopener"><img src="${esc(imgSrc(im))}" alt="" loading="lazy"></a><figcaption class="lb">${esc(im.credit)}</figcaption></figure>`).join('')}</div>
<div class="txt"><p>${esc(it.summary)}</p>
${it.observation ? `<div class="why"><h2>Why it matters</h2><p>${esc(it.observation)}</p></div>` : ''}
<dl class="facts">${facts}${srcList}</dl></div></div></article>
${others.length ? `<section class="band"><div class="bh"><h2>More from ${esc(wlabel(it.week))}</h2><p><a href="${esc(L(`/w/${it.week}`))}">Read the full issue</a></p></div><div class="cols">${others.map(o => card(c, o, 'issue')).join('')}</div></section>` : ''}`;
  return page(s, { title: `${name}:${it.title} · APAC Radar`, body, draft: b.issue.status !== 'published' ? b.issue.week : null, desc: it.summary.slice(0, 140) });
}

/** 沒有任何一期時的首頁 */
export function renderEmpty(s: Site): string {
  return page(s, { title: 'APAC Radar', body: `<section class="phd"><h1>Coming Soon</h1><p class="p">第一期還沒發布。每週一早上整理好之後，這裡會出現最新一期。</p></section>` });
}
