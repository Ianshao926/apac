import type { Env } from './types';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 apac-radar/0.1';
const MAX_BYTES = 3_000_000;
const MIN_BYTES = 12_000;           // 太小多半是 icon / tracking pixel

export interface Candidate { url: string; credit: string; official: boolean; page?: string }

export interface StoredImage { kv_key: string; content_type: string; bytes: number; source_url: string; page_url: string | null; credit: string; is_official: number }

/** 從來源頁面抓 og:image / twitter:image,作為第二層圖片候選 */
export async function heroImageOf(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow', cf: { cacheTtl: 3600 } as any });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('html')) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    let html = ''; let got = 0;
    const dec = new TextDecoder();
    while (got < 250_000) {
      const { value, done } = await reader.read();
      if (done) break;
      got += value.byteLength; html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    try { await reader.cancel(); } catch { /* ignore */ }
    const pick = (re: RegExp) => { const m = re.exec(html); return m ? m[1] : null; };
    const og = pick(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)
      || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i)
      || pick(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i)
      || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i);
    if (!og) return null;
    return new URL(og.replace(/&amp;/g, '&'), pageUrl).toString();
  } catch { return null; }
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
    if (n > max + 3) break;                        // 總共最多試 max+3 次,控制子請求數
    try {
      const res = await fetch(c.url, { headers: { 'user-agent': UA, accept: 'image/avif,image/webp,image/*,*/*;q=0.8', referer: c.page || new URL(c.url).origin }, redirect: 'follow' });
      if (!res.ok) continue;
      const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!ct.startsWith('image/') || ct === 'image/svg+xml' || ct === 'image/gif') continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength < MIN_BYTES || buf.byteLength > MAX_BYTES) continue;
      const kv_key = `img/${itemId}/${out.length + 1}`;
      await env.IMG.put(kv_key, buf, { metadata: { ct, src: c.url } });
      out.push({ kv_key, content_type: ct, bytes: buf.byteLength, source_url: c.url, page_url: c.page ?? null, credit: c.credit, is_official: c.official ? 1 : 0 });
    } catch { /* next candidate */ }
  }
  return out;
}
