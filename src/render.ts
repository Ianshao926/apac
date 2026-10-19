// 報紙版週報(v3 設計):純白紙面、W 週數脊椎、邊欄後設、品牌活動度刻度圖。預設淺色,右上角可切深色。
import { CATEGORY_ZH, type Brand, type IssueBundle, type Item } from './types';
import { md, weekday } from './week';

const esc = (s: string | null | undefined) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
:root{--bg:#FFFFFF;--bg-2:#F3F3F1;--ink:#111417;--ink-2:#5B6168;--ink-3:#7B8188;--blue:#1F3D63;--brass:#8A5E1A;--rule:#E3E4E1;--rule-2:#C9CBC7;--photo:#ECECEA;--photo-line:#D6D7D3;
--sans:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;--serif:"Noto Serif TC","Songti TC","PMingLiU",serif;--latin:"Archivo","Helvetica Neue",Arial,sans-serif;color-scheme:light}
:root[data-theme="dark"]{--bg:#0F1216;--bg-2:#161A20;--ink:#EDEEF0;--ink-2:#A6ABB3;--ink-3:#8A9099;--blue:#9DB8D6;--brass:#D1A862;--rule:#262B33;--rule-2:#39404A;--photo:#181D24;--photo-line:#2A313B;color-scheme:dark}
*{box-sizing:border-box;min-width:0}html,body{overflow-x:clip}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--serif);font-size:15.5px;line-height:1.9;-webkit-font-smoothing:antialiased;text-wrap:pretty;font-variant-numeric:tabular-nums;font-feature-settings:"palt"}
p{margin:0}a{color:inherit;text-decoration-color:var(--blue);text-underline-offset:3px}a:focus-visible,button:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.wrap{max-width:1200px;margin:0 auto;padding-block:0 64px;padding-inline:clamp(16px,4vw,56px)}
.la{font-family:var(--latin);font-variant-numeric:lining-nums tabular-nums}.cap{font-family:var(--latin);font-size:12px;font-weight:500;letter-spacing:.02em;color:var(--ink-2)}
.topbar{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-block:14px;border-bottom:1px solid var(--ink);font-family:var(--sans);font-size:13px;font-weight:700;letter-spacing:.02em}
.topbar .mark{display:inline-flex;align-items:center;gap:10px}.topbar .mark svg{width:16px;height:16px;color:var(--ink)}
.topbar .r{font-family:var(--latin);font-weight:500;color:var(--ink-2);display:flex;align-items:center;gap:16px}
.tgl{width:28px;height:28px;padding:0;border:1px solid var(--rule-2);border-radius:50%;background:transparent;color:var(--ink);cursor:pointer;display:grid;place-items:center}.tgl svg{width:15px;height:15px;display:block}.tgl .moon{display:none}
:root[data-theme="dark"] .tgl .sun{display:none}:root[data-theme="dark"] .tgl .moon{display:block}
.draft{background:var(--brass);color:#fff;font-family:var(--sans);font-size:11px;font-weight:700;padding:2px 8px;letter-spacing:.06em}
.masthead{display:grid;grid-template-columns:auto minmax(0,1fr);gap:0 40px;align-items:end;padding-block:28px 24px;border-bottom:4px solid var(--ink)}
.wk{font-family:var(--latin);font-stretch:62%;font-weight:900;font-size:clamp(120px,18vw,224px);line-height:.8;letter-spacing:-.04em;color:var(--blue);transform:translateY(.06em)}
.mh h1{margin:0 0 10px;font-family:var(--sans);font-weight:900;font-size:clamp(34px,4.6vw,56px);letter-spacing:-.02em;line-height:1.05}
.mh .line{display:flex;flex-wrap:wrap;gap:4px 24px;font-family:var(--latin);font-size:14px;color:var(--ink-2);font-weight:500}.mh .line b{color:var(--ink);font-weight:700}.mh .line .zh{font-family:var(--sans);font-weight:500}
.pulse{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 40px;padding-block:20px 24px;border-bottom:1px solid var(--rule)}
.pulse>div{display:grid;grid-template-columns:auto minmax(0,1fr);gap:0 16px;align-items:baseline}
.pulse .n{font-family:var(--latin);font-stretch:75%;font-weight:800;font-size:44px;line-height:1;letter-spacing:-.03em}.pulse .t{font-family:var(--sans);font-weight:700;font-size:14px}
.pulse .ticks{grid-column:2;display:flex;gap:3px;margin-top:8px;height:10px}.pulse .ticks i{flex:1;background:var(--rule-2)}.pulse .ticks i.on{background:var(--blue)}.pulse .cap{grid-column:2;margin-top:6px}
.entry{display:grid;grid-template-columns:132px minmax(0,1fr);gap:0 32px;padding-block:32px;border-top:1px solid var(--rule);scroll-margin-top:24px}
.rail{display:flex;flex-direction:column;gap:6px;font-family:var(--latin);font-size:12.5px;color:var(--ink-2);line-height:1.5;padding-top:6px}
.rail .d{font-size:15px;font-weight:700;color:var(--ink);letter-spacing:-.01em}.rail .zh{font-family:var(--sans);font-weight:500}
.rail .src{margin-top:10px;padding-top:10px;border-top:1px solid var(--rule);font-size:12px}.rail .src b{display:block;font-weight:700;color:var(--blue)}.rail .src .one{color:var(--brass);font-weight:700}
.brand{font-family:var(--sans);font-size:13.5px;font-weight:700;letter-spacing:.01em;margin-bottom:8px}.brand span{color:var(--ink-2);font-weight:500;margin-left:10px}
.entry h3,.entry h2{margin:0 0 14px;font-family:var(--sans);font-weight:900;letter-spacing:-.02em;text-wrap:balance}.entry h3{font-size:22px;line-height:1.4}
.entry .body{display:grid;grid-template-columns:minmax(0,1fr) 180px;gap:0 32px;align-items:start}.entry .body.noimg{grid-template-columns:minmax(0,1fr)}
.entry p{max-width:38em}.entry p+p{margin-top:10px}
.note{margin-top:16px;padding-left:16px;border-left:1px solid var(--ink);font-family:var(--sans);font-size:14px;line-height:1.75;color:var(--ink)}.note b{font-weight:700;margin-right:8px}
.photo{width:100%;max-width:100%;aspect-ratio:1/1;background:var(--photo);box-shadow:inset 0 0 0 1px var(--photo-line);display:grid;place-items:center;overflow:hidden}
.photo img{width:100%;height:100%;object-fit:cover;display:block}
.photo span{font-family:var(--latin);font-size:11px;color:var(--ink-3);letter-spacing:.04em;text-align:center;padding:0 12px;line-height:1.6}
.credit{font-family:var(--latin);font-size:11px;color:var(--ink-3);margin-top:6px;letter-spacing:.02em}
.more{display:flex;gap:4px;margin-top:6px}.more a{display:block;width:28px;height:28px;background:var(--photo);box-shadow:inset 0 0 0 1px var(--photo-line);overflow:hidden}.more img{width:100%;height:100%;object-fit:cover;display:block}
.lead{display:grid;grid-template-columns:132px minmax(0,1fr) minmax(0,460px);gap:0 32px;padding-block:40px 36px;border-bottom:1px solid var(--ink)}
.lead .rail{padding-top:10px}.lead h2{font-size:clamp(30px,3.8vw,46px);line-height:1.25;margin:0 0 18px}
.lead .stand{font-family:var(--sans);font-weight:500;font-size:18px;line-height:1.7;max-width:30em;margin-bottom:14px}.lead .photo{aspect-ratio:4/3}
.sect{padding-top:44px}.sect .vt{display:flex;align-items:baseline;gap:16px;padding-bottom:14px;margin-bottom:8px;border-bottom:1px solid var(--ink)}
.sect .vt i{display:block;width:28px;height:10px;background:var(--blue);align-self:center}.sect .vt span{font-family:var(--sans);font-weight:900;font-size:26px;letter-spacing:-.02em;line-height:1;color:var(--ink)}
.sect .vt small{margin-left:auto;font-family:var(--latin);font-weight:600;font-size:13px;color:var(--ink-2)}.sect .list .entry:first-of-type{padding-top:24px;border-top:0}
.empty{font-family:var(--sans);color:var(--ink-2);font-size:14px;padding-block:20px}
.lower{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 64px;margin-top:48px;padding-top:24px;border-top:4px solid var(--ink)}
.lower h4{margin:0 0 20px;font-family:var(--sans);font-weight:900;font-size:20px;letter-spacing:-.01em}.lower h4 span{font-family:var(--latin);font-weight:500;color:var(--ink-2);font-size:13px;margin-left:12px;letter-spacing:0}
.bars{display:grid;gap:10px;font-family:var(--sans);font-size:13.5px}.bars .row{display:grid;grid-template-columns:150px minmax(0,1fr) 44px;gap:12px;align-items:center}
.bars .row b{font-weight:700}.bars .row b span{color:var(--ink-2);font-weight:500;margin-left:8px;font-size:12px}
.bars .track{display:flex;gap:2px;height:8px}.bars .track i{flex:1;background:var(--rule)}.bars .track i.on{background:var(--blue)}.bars .track i.now{background:var(--ink)}
.bars .row .la{text-align:right;font-size:12.5px;color:var(--ink-2)}
.bars .legend{margin-top:8px;font-family:var(--latin);font-size:12px;color:var(--ink-2);display:flex;gap:16px;flex-wrap:wrap}.bars .legend i{display:inline-block;width:10px;height:8px;vertical-align:middle;margin-right:6px;background:var(--rule)}.bars .legend i.on{background:var(--blue)}.bars .legend i.now{background:var(--ink)}
.quietp{font-family:var(--sans);font-size:14px;line-height:1.9;color:var(--ink-2)}
footer{margin-top:56px;padding-top:16px;border-top:1px solid var(--ink);display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:0 64px;font-family:var(--latin);font-size:12px;color:var(--ink-2);line-height:1.7}
footer ol{margin:6px 0 0;padding-left:1.4em;columns:2;column-gap:32px}footer li{break-inside:avoid;font-family:var(--sans);overflow-wrap:anywhere;padding-right:8px}
footer .how{font-family:var(--sans);font-size:13px}footer .how b{font-weight:700;color:var(--ink)}footer .sig{margin-top:16px;font-family:var(--sans);font-weight:900;color:var(--ink);font-size:13px;letter-spacing:-.01em}
@media (max-width:960px){.lead{grid-template-columns:minmax(0,1fr)}.lead .rail,.rail{flex-direction:row;flex-wrap:wrap;gap:4px 20px;padding-top:0;margin-bottom:12px}.rail .src{margin:0;padding:0;border:0}.rail .src b{display:inline;margin-right:8px}
.lead>div:last-child{order:-1;margin-bottom:12px}.entry{grid-template-columns:minmax(0,1fr)}.entry .body{grid-template-columns:minmax(0,1fr) 120px;gap:0 20px}.lower{grid-template-columns:minmax(0,1fr);gap:40px}footer{grid-template-columns:minmax(0,1fr);gap:24px}footer ol{columns:1}}
@media (max-width:560px){.masthead{grid-template-columns:minmax(0,1fr);gap:12px}.wk{font-size:120px;transform:none}.pulse{grid-template-columns:minmax(0,1fr);gap:16px}.entry .body{grid-template-columns:minmax(0,1fr)}.entry .body .photo{order:-1;aspect-ratio:16/9;margin-bottom:14px}.bars .row{grid-template-columns:110px minmax(0,1fr) 36px}}
`;

const RADAR = `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M8 8 A24 24 0 0 1 32 32"/><path d="M8 16 A16 16 0 0 1 24 32"/><path d="M8 24 A8 8 0 0 1 16 32"/><circle cx="8" cy="32" r="2.6" fill="var(--brass)" stroke="none"/></svg>`;
const TOGGLE = `<button class="tgl" id="theme-toggle" type="button" aria-pressed="false" aria-label="切換深淺色" title="切換深淺色"><svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg><svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg></button>`;
const SCRIPT = `<script>(function(){var r=document.documentElement,b=document.getElementById('theme-toggle');function a(t){if(t==='dark'){r.setAttribute('data-theme','dark');b.setAttribute('aria-pressed','true')}else{r.removeAttribute('data-theme');b.setAttribute('aria-pressed','false')}}var s=null;try{s=localStorage.getItem('radar-theme')}catch(e){}a(s==='dark'?'dark':'light');b.addEventListener('click',function(){var n=r.getAttribute('data-theme')==='dark'?'light':'dark';a(n);try{localStorage.setItem('radar-theme',n)}catch(e){}})})();</script>`;

function ticks(n: number, total = 8) { return Array.from({ length: total }, (_, i) => `<i${i < n ? ' class="on"' : ''}></i>`).join(''); }

export function renderIssue(b: IssueBundle, opts: { siteName: string; orgName: string; brandCount: number }): string {
  const { issue, items } = b;
  const brandOf = (id: string): Brand | undefined => b.brands.find(x => x.id === id);
  const bname = (id: string) => brandOf(id)?.name_zh ?? id;
  const bsub = (it: Item) => { const br = brandOf(it.brand_id); return br?.name_en && br.name_en !== br.name_zh ? br.name_en : it.market; };
  const srcIndex = new Map<string, number>();
  const allSources: { n: number; publisher: string; title: string; date: string | null }[] = [];
  for (const it of items) for (const s of b.sources[it.id] ?? []) {
    if (!srcIndex.has(s.url)) { srcIndex.set(s.url, allSources.length + 1); allSources.push({ n: allSources.length + 1, publisher: s.publisher ?? '', title: s.title ?? s.url, date: s.published_at }); }
  }
  const counts = { new_product: 0, campaign: 0, loyalty: 0 } as Record<string, number>;
  const brandsByCat: Record<string, Set<string>> = { new_product: new Set(), campaign: new Set(), loyalty: new Set() };
  for (const it of items) { counts[it.category]++; brandsByCat[it.category].add(it.brand_id); }
  const active = new Set(items.map(i => i.brand_id)).size;
  const wk = 'W' + issue.week.slice(-2);
  const draft = issue.status !== 'published';

  // 頭條:is_lead 優先,否則 rank 最低且有圖
  const lead = items.find(i => i.is_lead) ?? items.slice().sort((a, c) => ((b.images[a.id]?.length ? 0 : 100) + a.rank) - ((b.images[c.id]?.length ? 0 : 100) + c.rank))[0];

  const rail = (it: Item) => {
    const src = b.sources[it.id] ?? [];
    const nums = src.map(s => srcIndex.get(s.url)).filter(Boolean).join('、');
    return `<div class="rail"><span class="d">${esc(md(it.date_start)) || '—'}</span><span>${it.date_end ? '– ' + esc(md(it.date_end)) : esc(weekday(it.date_start))}</span><span class="zh">${esc(it.market)}${it.status_note ? ' · ' + esc(it.status_note) : ''}</span>
      <div class="src"><b>${src.length} source${src.length > 1 ? 's' : ''}</b>${it.confidence === 'verified' ? '已佐證' : '<span class="one">待佐證</span>'}${nums ? ` · ${nums}` : ''}</div></div>`;
  };
  const photo = (it: Item, big = false) => {
    const imgs = b.images[it.id] ?? [];
    if (!imgs.length) return `<div><div class="photo"><span>尚無圖片</span></div></div>`;
    const first = imgs[0];
    const more = imgs.length > 1 ? `<div class="more">${imgs.slice(1).map(im => `<a href="/img/${esc(im.kv_key)}" target="_blank" rel="noopener"><img src="/img/${esc(im.kv_key)}" alt="" loading="lazy"></a>`).join('')}</div>` : '';
    return `<div><a class="photo" href="/img/${esc(first.kv_key)}" target="_blank" rel="noopener"><img src="/img/${esc(first.kv_key)}" alt="${esc(it.title)}" loading="${big ? 'eager' : 'lazy'}"></a>${more}<div class="credit">${esc(first.credit)}</div></div>`;
  };
  const note = (it: Item) => it.observation ? `<div class="note"><b>觀察</b>${esc(it.observation)}</div>` : '';

  const leadHtml = lead ? `<article class="lead" id="${esc(lead.id)}">${rail(lead)}<div><div class="brand">${esc(bname(lead.brand_id))}<span>${esc(bsub(lead))}</span></div><h2>${esc(lead.title)}</h2><p class="stand">${esc(lead.summary)}</p>${note(lead)}</div>${photo(lead, true)}</article>` : '';

  const section = (cat: Item['category']) => {
    const list = items.filter(i => i.category === cat && i.id !== lead?.id);
    const body = list.length ? list.map(it => `<div class="entry" id="${esc(it.id)}">${rail(it)}<div><div class="brand">${esc(bname(it.brand_id))}<span>${esc(bsub(it))}</span></div><h3>${esc(it.title)}</h3><div class="body${b.images[it.id]?.length ? '' : ' noimg'}"><div><p>${esc(it.summary)}</p>${note(it)}</div>${b.images[it.id]?.length ? photo(it) : ''}</div></div></div>`).join('')
      : `<p class="empty">${lead?.category === cat ? '本週這一類只有頭條那一則。' : '本週沒有觀察到這一類的動態。'}</p>`;
    return `<section class="sect"><div class="vt"><i></i><span>${CATEGORY_ZH[cat]}</span><small>${brandsByCat[cat].size} / ${opts.brandCount}</small></div><div class="list">${body}</div></section>`;
  };

  const thisWeekActive = new Set(items.map(i => i.brand_id));
  const bars = b.brands.slice().sort((x, y) => (thisWeekActive.has(y.id) ? 1 : 0) - (thisWeekActive.has(x.id) ? 1 : 0) || ((b.activity[y.id]?.length ?? 0) - (b.activity[x.id]?.length ?? 0)) || x.sort - y.sort)
    .map(br => { const weeks = new Set(b.activity[br.id] ?? []); const k = weeks.size; const mk: string[] = JSON.parse(br.markets);
      return `<div class="row"><b>${esc(br.name_zh)}<span>${esc(mk.slice(0, 2).join(' · '))}</span></b><div class="track">${b.weeks8.map((w, i) => `<i class="${weeks.has(w) ? (i === b.weeks8.length - 1 ? 'now' : 'on') : ''}"></i>`).join('')}</div><span class="la">${k} / 8</span></div>`; }).join('');

  const pulseCap = (cat: string) => `${brandsByCat[cat].size} 個品牌有動態`;

  return `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${wk} 亞太競品週報 · ${esc(issue.range_start)} 至 ${esc(issue.range_end)}</title>
<meta name="robots" content="noindex,nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@500;700;900&family=Noto+Serif+TC:wght@400;600&family=Archivo:ital,wdth,wght@0,62..125,400..900;1,62..125,400..900&display=swap">
<style>${CSS}</style></head><body><div class="wrap">
<div class="topbar"><span class="mark">${RADAR}${esc(opts.siteName)}</span><span class="r">${draft ? '<span class="draft">草稿 · 尚未發布</span>' : ''}No. ${String(issue.no ?? 1).padStart(2, '0')} · 每週一 09:00 出刊${TOGGLE}</span></div>
<header class="masthead"><div class="wk">${wk}</div><div class="mh"><h1>亞太競品週報</h1><div class="line"><span><b>${esc(issue.range_start.replace(/-/g, '.'))}</b> – <b>${esc(issue.range_end.slice(5).replace(/-/g, '.'))}</b></span><span class="zh">${esc(opts.orgName)}</span><span>${opts.brandCount} brands · ${active} active · ${opts.brandCount - active} quiet</span></div></div></header>
<div class="pulse">
<div><span class="n">${counts.new_product}</span><span class="t">新品與菜單</span><div class="ticks">${ticks(counts.new_product)}</div><span class="cap">${pulseCap('new_product')}</span></div>
<div><span class="n">${counts.campaign}</span><span class="t">行銷檔期</span><div class="ticks">${ticks(counts.campaign)}</div><span class="cap">${pulseCap('campaign')}</span></div>
<div><span class="n">${counts.loyalty}</span><span class="t">會員經營</span><div class="ticks">${ticks(counts.loyalty)}</div><span class="cap">${pulseCap('loyalty')}</span></div>
</div>
${leadHtml}
${section('new_product')}${section('campaign')}${section('loyalty')}
<div class="lower">
<div><h4>${opts.brandCount} 個品牌的八週<span>activity, ${esc(b.weeks8[0]?.replace(/^\d{4}-/, ''))} – ${esc(b.weeks8[b.weeks8.length - 1]?.replace(/^\d{4}-/, ''))}</span></h4><div class="bars">${bars}<div class="legend"><span><i class="now"></i>本週有動態</span><span><i class="on"></i>該週有動態</span><span><i></i>安靜</span></div></div></div>
<div><h4>本週安靜<span>quiet, ${b.quiet.length} brands</span></h4><p class="quietp">${b.quiet.map(q => esc(q.name_zh)).join(' · ') || '沒有品牌安靜。'}<br>安靜代表這七天在官網、公開社群與新聞上沒有新品、檔期或會員方案的變動。連續三週安靜會標記。</p></div>
</div>
<footer><div><div>Sources</div><ol>${allSources.map(s => `<li>${esc(s.publisher)}${s.publisher ? ',' : ''}${esc(s.title)}${s.date ? ',' + esc(s.date) : ''}</li>`).join('')}</ol></div>
<div class="how"><p><b>怎麼讀。</b>每則左側是日期、市場與來源數。<b>「已佐證」</b>代表至少兩個獨立來源說法一致;黃銅色的<b>「待佐證」</b>只找到一個來源,先看、別轉述。圖片以品牌官方素材優先,其次為報導配圖,皆標示出處。</p><div class="sig">${esc(opts.siteName)} · 僅供內部閱讀</div></div></footer>
</div>${SCRIPT}</body></html>`;
}
