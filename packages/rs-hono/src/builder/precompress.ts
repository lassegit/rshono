/**
 * Build-time asset precompression.
 *
 * Emits .br and .gz siblings next to every compressible file under
 * <outDir>/client (bundle chunks and copied public/ assets alike), so
 * the production static middleware (`precompressed: true`) can serve
 * them with zero CPU cost per request. Brotli at max quality — build
 * time is the right place to spend the cycles; JS/CSS typically
 * shrinks 65–75%.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

/** Text-like outputs worth compressing; images/fonts are already compressed. */
const COMPRESSIBLE = new Set(['.js', '.mjs', '.css', '.html', '.svg', '.json', '.txt', '.xml', '.webmanifest', '.map']);

/** Below one network packet, the encoding negotiation isn't worth it. */
const MIN_SIZE = 1024;

/** Precompress a directory tree in place. Returns the file count handled. */
export function precompressDir(dir: string): number {
    let compressed = 0;

    for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
        if (!entry.isFile() || !COMPRESSIBLE.has(extname(entry.name))) continue;

        const source = readFileSync(join(entry.parentPath, entry.name));
        if (source.length < MIN_SIZE) continue;

        const brotli = brotliCompressSync(source, {
            params: {
                [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
                [constants.BROTLI_PARAM_SIZE_HINT]: source.length,
            },
        });
        const gzip = gzipSync(source, { level: constants.Z_BEST_COMPRESSION });

        // A variant that doesn't actually shrink the file isn't written —
        // serveStatic then falls through to the original.
        if (brotli.length < source.length) writeFileSync(join(entry.parentPath, entry.name + '.br'), brotli);
        if (gzip.length < source.length) writeFileSync(join(entry.parentPath, entry.name + '.gz'), gzip);
        compressed++;
    }

    return compressed;
}
