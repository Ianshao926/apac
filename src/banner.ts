// 每週橫幅圖:SVG → PNG,用 resvg-wasm 與三個子集字型。
import { initWasm, Resvg } from '@resvg/resvg-wasm';
// @ts-ignore wrangler 會把 .wasm 打包成 WebAssembly.Module
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
// @ts-ignore .ttf 由 wrangler rules 以 Data(ArrayBuffer)匯入
import fontSerif from '../assets/fonts/banner-serif.ttf';
// @ts-ignore
import fontSans from '../assets/fonts/banner-sans.ttf';
// @ts-ignore
import fontZh from '../assets/fonts/banner-zh.ttf';
import type { Env, Issue } from './types';

let ready: Promise<void> | null = null;
function init() { return (ready ??= initWasm(resvgWasm as any).catch(e => { ready = null; throw e; })); }

function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function rangeLong(a: string, b: string) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  if (y1 !== y2) return `${MONTH[m1 - 1]} ${d1}, ${y1} – ${MONTH[m2 - 1]} ${d2}, ${y2}`;
  return m1 === m2 ? `${MONTH[m1 - 1]} ${d1} – ${d2}, ${y1}` : `${MONTH[m1 - 1]} ${d1} – ${MONTH[m2 - 1]} ${d2}, ${y1}`;
}

/** Teams 卡片的橫幅,字和網站一樣:Newsreader(英文大標)、Noto Serif TC(中文)、Instrument Sans(小字)。
 *  三個字型檔都是子集:英文兩套收了全部 ASCII,中文只收「亞太競品週報」六個字。要加中文字得重新下載子集。 */
export function bannerSvg(issue: Issue, stories: number, activeBrands: number, draft: boolean) {
  const no = String(issue.no ?? 1).padStart(2, '0');
  const week = String(Number(issue.week.slice(-2)));
  const line2 = `${stories} ${stories === 1 ? 'story' : 'stories'} from ${activeBrands} ${activeBrands === 1 ? 'brand' : 'brands'}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400">
  <rect width="1200" height="400" fill="#000000"/>
  <text x="44" y="66" font-family="Newsreader 72pt" font-size="26" fill="#FFFFFF" letter-spacing="5.2">APAC RADAR</text>
  <text x="40" y="236" font-family="Newsreader 72pt" font-size="112" fill="#FFFFFF" letter-spacing="-1">ISSUE ${no}</text>
  <text x="40" y="352" font-family="Newsreader 72pt" font-size="112" fill="#FFFFFF" letter-spacing="-1">WEEK ${week}</text>
  <text x="700" y="232" font-family="Noto Serif TC" font-size="52" fill="#FFFFFF">亞太競品週報</text>
  <text x="702" y="288" font-family="Instrument Sans" font-size="22" fill="#FFFFFF">${esc(rangeLong(issue.range_start, issue.range_end))}</text>
  <text x="702" y="322" font-family="Instrument Sans" font-size="22" fill="#D2D2D2">${esc(line2)}</text>
  ${draft ? '<text x="702" y="364" font-family="Instrument Sans" font-size="18" fill="#DCDED5" letter-spacing="0.5">Draft · not yet published</text>' : ''}
</svg>`;
}

export async function renderBanner(env: Env, issue: Issue, stories: number, activeBrands: number): Promise<Uint8Array> {
  const key = `banner/v3/${issue.week}/${issue.status}/${stories}-${activeBrands}`;   // v3:網站字型版,換版時改這裡讓舊快取失效
  const cached = await env.IMG.get(key, 'arrayBuffer');
  if (cached) return new Uint8Array(cached);
  await init();
  const svg = bannerSvg(issue, stories, activeBrands, issue.status !== 'published');
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: { fontBuffers: [new Uint8Array(fontSerif as ArrayBuffer), new Uint8Array(fontSans as ArrayBuffer), new Uint8Array(fontZh as ArrayBuffer)], loadSystemFonts: false, defaultFontFamily: 'Instrument Sans' },
  });
  const png = r.render().asPng();
  await env.IMG.put(key, png, { metadata: { ct: 'image/png' }, expirationTtl: 60 * 60 * 24 * 90 });
  return png;
}
