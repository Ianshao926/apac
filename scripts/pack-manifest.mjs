// 把 bot/manifest 打包成 Teams 安裝檔(zip):node scripts/pack-manifest.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

const dir = new URL('../bot/manifest/', import.meta.url);
const files = ['manifest.json', 'color.png', 'outline.png'];

// 最小的 zip 寫法,不靠第三方套件
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const u16 = (n) => Buffer.from([n & 255, (n >> 8) & 255]);
const u32 = (n) => Buffer.from([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]);

const locals = [], centrals = []; let offset = 0;
for (const name of files) {
  const data = readFileSync(new URL(name, dir));
  const comp = deflateRawSync(data);
  const nameBuf = Buffer.from(name);
  const head = Buffer.concat([u32(0x04034b50), u16(20), u16(0x0800), u16(8), u16(0), u16(0), u32(crc32(data)), u32(comp.length), u32(data.length), u16(nameBuf.length), u16(0), nameBuf]);
  locals.push(head, comp);
  centrals.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(8), u16(0), u16(0), u32(crc32(data)), u32(comp.length), u32(data.length), u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBuf]));
  offset += head.length + comp.length;
}
const central = Buffer.concat(centrals);
const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.length), u32(offset), u16(0)]);
const out = new URL('apac-baby.zip', dir);
writeFileSync(out, Buffer.concat([...locals, central, end]));
console.log('wrote', out.pathname);
