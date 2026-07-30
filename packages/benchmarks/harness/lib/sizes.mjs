import { readdir, stat, rm } from 'node:fs/promises';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import path from 'node:path';

/**
 * Compression is done here, identically for every target, rather than left to each app's own
 * compressor — see rule 4 in spec/APP_SPEC.md. Brotli at quality 11 is what a CDN would do to a
 * static asset; gzip at 9 is the realistic floor for a streamed response.
 */
export function gzipSize(buf) {
  return gzipSync(buf, { level: 9 }).byteLength;
}

export function brotliSize(buf) {
  return brotliCompressSync(buf, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: buf.byteLength,
    },
  }).byteLength;
}

export function sizes(buf) {
  const raw = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return { raw: raw.byteLength, gzip: gzipSize(raw), brotli: brotliSize(raw) };
}

/** Recursive size of a directory, following nothing and skipping what a deploy wouldn't ship. */
export async function dirSize(dir, { skip = ['node_modules', '.git'] } = {}) {
  let total = 0;
  let files = 0;
  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (skip.includes(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const s = await stat(full).catch(() => null);
        if (s) {
          total += s.size;
          files += 1;
        }
      }
    }
  }
  await walk(dir);
  return { bytes: total, files };
}

export async function fileSize(file) {
  const s = await stat(file).catch(() => null);
  return s ? s.size : null;
}

export async function removeAll(dir, relatives) {
  for (const rel of relatives) {
    await rm(path.join(dir, rel), { recursive: true, force: true });
  }
}
