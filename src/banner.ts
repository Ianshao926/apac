// 每週橫幅圖:SVG → PNG,用 resvg-wasm 與三個子集字型。
import { initWasm, Resvg } from '@resvg/resvg-wasm';
// @ts-ignore wrangler 會把 .wasm 打包成 WebAssembly.Module
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
// @ts-ignore .ttf 由 wrangler rules 以 Data(ArrayBuffer)匯入
import fontCjk from '../assets/fonts/radar-cjk.ttf';
// @ts-ignore
import fontCond from '../assets/fonts/radar-cond.ttf';
// @ts-ignore
import fontLatin from '../assets/fonts/radar-latin.ttf';
import type { Env, Issue } from './types';

let ready: Promise<void> | null = null;
function init() { return (ready ??= initWasm(resvgWasm as any).catch(e => { ready = null; throw e; })); }

function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export function bannerSvg(issue: Issue, activeBrands: number, totalBrands: number, draft: boolean) {
  const wk = 'W' + issue.week.slice(-2);
  const date = `${issue.range_start.replace(/-/g, '.')} – ${issue.range_end.slice(5).replace(/-/g, '.')}`;
  const line = `${date} · ${totalBrands} brands · ${activeBrands} active`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400">
  <rect width="1200" height="400" fill="#1F3D63"/>
  <text x="44" y="338" font-family="RadarCond" font-size="340" fill="#FFFFFF" letter-spacing="-14">${wk}</text>
  <text x="600" y="232" font-family="RadarCJK" font-size="78" fill="#FFFFFF" letter-spacing="-1">亞太競品週報</text>
  <text x="602" y="292" font-family="RadarLatin" font-size="30" fill="#FFFFFF" fill-opacity="0.92">${esc(line)}</text>
  ${draft ? '<text x="602" y="340" font-family="RadarCJK" font-size="26" fill="#C9A25C">設計稿 · 未發布</text>' : ''}
  <circle cx="1150" cy="50" r="9" fill="#C9A25C"/>
</svg>`;
}

export async function renderBanner(env: Env, issue: Issue, activeBrands: number, totalBrands: number): Promise<Uint8Array> {
  const key = `banner/${issue.week}/${issue.status}/${activeBrands}-${totalBrands}`;
  const cached = await env.IMG.get(key, 'arrayBuffer');
  if (cached) return new Uint8Array(cached);
  await init();
  const svg = bannerSvg(issue, activeBrands, totalBrands, issue.status !== 'published');
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: { fontBuffers: [new Uint8Array(fontCjk as ArrayBuffer), new Uint8Array(fontCond as ArrayBuffer), new Uint8Array(fontLatin as ArrayBuffer)], loadSystemFonts: false, defaultFontFamily: 'RadarCJK' },
  });
  const png = r.render().asPng();
  await env.IMG.put(key, png, { metadata: { ct: 'image/png' }, expirationTtl: 60 * 60 * 24 * 90 });
  return png;
}
