import type { Env } from './types';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 apac-radar/0.1';
const MAX_BYTES = 3_000_000;
const MIN_BYTES = 12_000;           // 太小多半是 icon / tracking pixel

export interface Candidate { url: string; credit: string; official: boolean; page?: string }

export interface StoredImage { kv_key: string; content_type: string; bytes: number; width: number | null; height: number | null; source_url: string; page_url: string | null; credit: string; is_official: number }

/** 從檔頭讀出圖片尺寸(PNG / JPEG / WebP),不解碼整張圖 */
export function imageSize(buf: ArrayBuffer, ct: string): { w: number; h: number } | null {
  const b = new Uint8Array(buf);
  const dv = new DataView(buf);
  try {
    if (ct === 'image/png' && b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { w: dv.getUint32(16), h: dv.getUint32(20) };
    if (ct === 'image/jpeg' && b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        const len = dv.getUint16(i + 2);
        if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
          return { h: dv.getUint16(i + 5), w: dv.getUint16(i + 7) };
        }
        i += 2 + len;
      }
    }
    if (ct === 'image/webp' && b.length > 30 && b[8] === 0x57 && b[9] === 0x45) {
      const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (tag === 'VP8X') return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
      if (tag === 'VP8 ') return { w: dv.getUint16(26, true) & 0x3fff, h: dv.getUint16(28, true) & 0x3fff };
      if (tag === 'VP8L') { const bits = dv.getUint32(21, true); return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) }; }
    }
  } catch { /* 讀不出來就算了 */ }
  return null;
}

/** 補上沒有 scheme 的網址(有些站的 og:image 寫成 www.example.com/a.jpg) */
function absolutize(u: string, base: string): string | null {
  try {
    let s = u.trim().replace(/&amp;/g, '&');
    if (/^[\w.-]+\.[a-z]{2,}\//i.test(s) && !/^https?:\/\//i.test(s)) s = 'https://' + s;
    return new URL(s, base).toString();
  } catch { return null; }
}

const NOISE = /logo|icon|favicon|sprite|avatar|default-user|placeholder|blank|pixel|spacer|arrow|btn|button|banner_ad|\.svg|\.gif/i;

/** 來源頁面的圖片候選:og:image / twitter:image 優先,其次內文裡看起來像上傳素材的 <img>。最多 `max` 個。 */
export async function pageImages(pageUrl: string, max = 3): Promise<string[]> {
  try {
    const res = await fetch(pageUrl, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow', cf: { cacheTtl: 3600 } as any });
    if (!res.ok) return [];
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('html')) return [];
    const reader = res.body?.getReader();
    if (!reader) return [];
    let html = ''; let got = 0;
    const dec = new TextDecoder();
    while (got < 400_000) {
      const { value, done } = await reader.read();
      if (done) break;
      got += value.byteLength; html += dec.decode(value, { stream: true });
    }
    try { await reader.cancel(); } catch { /* ignore */ }
    const out: string[] = [];
    const push = (u: string | null) => { if (u && !NOISE.test(u) && !out.includes(u)) out.push(u); };
    const pick = (re: RegExp) => { const m = re.exec(html); return m ? absolutize(m[1], pageUrl) : null; };
    push(pick(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)
      || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i));
    push(pick(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i)
      || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i));
    // 內文圖:路徑含 upload / uploads / media / news 的,通常是新聞稿或貼文的圖
    for (const m of html.matchAll(/<img[^>]+(?:data-src|src)=["']([^"']+)["'][^>]*>/gi)) {
      if (out.length >= max) break;
      const u = absolutize(m[1], pageUrl);
      if (!u || !/\/(upload|uploads|media|news|images?\/20\d\d|wp-content\/uploads)\//i.test(u)) continue;
      // 路徑裡帶著兩年前以上的年份,多半是版型素材不是這則新聞的圖
      const yr = /\/(20\d\d)\//.exec(u);
      if (yr && Number(yr[1]) < new Date().getUTCFullYear() - 1) continue;
      push(u);
    }
    return out.slice(0, max);
  } catch { return []; }
}

/** 相容舊呼叫:只要第一張 */
export async function heroImageOf(pageUrl: string): Promise<string | null> {
  return (await pageImages(pageUrl, 1))[0] ?? null;
}

/** 逐一嘗試候選圖片,成功的存進 KV。最多 `max` 張。 */
export async function storeImages(env: Env, itemId: string, candidates: Candidate[], max = 3): Promise<StoredImage[]> {
  const out: StoredImage[] = [];
  const seen = new Set<string>();
  let n = 0;
  for (const c of candidates) {
    if (out.length >= max) break;
    const key = c.url.split('#')[0];
    if (seen.has(key)) continue; seen.add(key);
    n++;
    if (n > max + 4) break;                        // 總共最多試 max+4 次,控制子請求數
    try {
      const res = await fetch(c.url, { headers: { 'user-agent': UA, accept: 'image/avif,image/webp,image/*,*/*;q=0.8', referer: c.page || new URL(c.url).origin }, redirect: 'follow' });
      if (!res.ok) continue;
      const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!ct.startsWith('image/') || ct === 'image/svg+xml' || ct === 'image/gif') continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength < MIN_BYTES || buf.byteLength > MAX_BYTES) continue;
      const dim = imageSize(buf, ct);
      if (dim && (dim.w < 300 || dim.h < 300)) continue;   // 太小的圖放不上版面
      const kv_key = `img/${itemId}/${out.length + 1}`;
      await env.IMG.put(kv_key, buf, { metadata: { ct, src: c.url } });
      out.push({ kv_key, content_type: ct, bytes: buf.byteLength, width: dim?.w ?? null, height: dim?.h ?? null, source_url: c.url, page_url: c.page ?? null, credit: c.credit, is_official: c.official ? 1 : 0 });
    } catch { /* next candidate */ }
  }
  return out;
}
