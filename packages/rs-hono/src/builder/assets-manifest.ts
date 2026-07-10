/**
 * Asset manifest — which bundler-emitted files the HTML must link.
 *
 * The SSR document is rendered by React, not by an HTML plugin, so the
 * server needs to know the (content-hashed) names of the CSS files the
 * client compiler emitted. dev/build read them straight from the
 * compiler stats; `build` also persists them to <outDir>/assets.json so
 * `start` can serve without a compiler in the process.
 */
import type { Stats } from '@rspack/core';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AssetManifest } from '../assets.js';

const MANIFEST_FILE = 'assets.json';

/**
 * Collect the emitted CSS from compiler stats. The Rspack config merges
 * all CSS into one "styles" chunk, so this is normally a single file.
 */
export function assetManifestFromStats(stats: Stats): AssetManifest {
    const assets = stats.toJson({ all: false, assets: true }).assets ?? [];
    const css = assets
        .map((asset) => asset.name)
        .filter((name) => name.endsWith('.css'))
        .sort()
        .map((name) => `/_static/${name}`);
    return { css };
}

export function writeAssetManifest(rootDir: string, outDir: string, manifest: AssetManifest): void {
    writeFileSync(join(rootDir, outDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n');
}

/** Returns undefined when the manifest is missing or malformed (old build). */
export function loadAssetManifest(rootDir: string, outDir: string): AssetManifest | undefined {
    try {
        const parsed = JSON.parse(readFileSync(join(rootDir, outDir, MANIFEST_FILE), 'utf8'));
        if (Array.isArray(parsed?.css) && parsed.css.every((href: unknown) => typeof href === 'string')) {
            return { css: parsed.css };
        }
    } catch {
        // fall through
    }
    return undefined;
}
