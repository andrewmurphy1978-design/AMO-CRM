// Minimal ZIP reader (stored and deflated entries) for the brand-assets.zip an AI hands over.
// Uses the platform's DecompressionStream, so it runs on Cloudflare Workers without a dependency.

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZip(buf: Uint8Array, opts: { maxEntries?: number; maxEntryBytes?: number } = {}): Promise<{ entries: ZipEntry[]; skipped: string[] }> {
  const maxEntries = opts.maxEntries ?? 300;
  const maxEntryBytes = opts.maxEntryBytes ?? 3_000_000;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // End of central directory record.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip file");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  const skipped: string[] = [];
  const decoder = new TextDecoder("utf-8");
  for (let n = 0; n < count && entries.length < maxEntries; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/") || name.startsWith("__MACOSX/") || /(^|\/)\.DS_Store$/.test(name)) continue;
    if ((flags & 1) !== 0) {
      skipped.push(`${name} (encrypted)`);
      continue;
    }
    if (size > maxEntryBytes) {
      skipped.push(`${name} (too large)`);
      continue;
    }
    const lh = localOffset;
    if (view.getUint32(lh, true) !== 0x04034b50) continue;
    const start = lh + 30 + view.getUint16(lh + 26, true) + view.getUint16(lh + 28, true);
    const raw = buf.subarray(start, start + compSize);
    try {
      entries.push({ name, data: method === 0 ? raw.slice() : method === 8 ? await inflateRaw(raw) : (() => { throw new Error("method"); })() });
    } catch {
      skipped.push(`${name} (unreadable)`);
    }
  }
  return { entries, skipped };
}
