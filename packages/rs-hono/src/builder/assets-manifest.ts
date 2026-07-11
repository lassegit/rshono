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
 * Collect the linkable outputs from compiler stats: the emitted CSS
 * (the Rspack config merges all CSS into one "styles" chunk, so this is
 * normally a single file) and the JS of the "main" entrypoint — the
 * hydration entry, content-hashed in prod builds.
 */
export function assetManifestFromStats(stats: Stats): AssetManifest {
    const json = stats.toJson({ all: false, assets: true, entrypoints: true });
    const css = (json.assets ?? [])
        .map((asset) => asset.name)
        .filter((name) => name.endsWith('.css'))
        .sort()
        .map((name) => `/_static/${name}`);
    const js = (json.entrypoints?.main?.assets ?? [])
        .map((asset) => asset.name)
        .filter((name) => name.endsWith('.js'))
        .map((name) => `/_static/${name}`);
    return { css, js };
}

export function writeAssetManifest(rootDir: string, outDir: string, manifest: AssetManifest): void {
    writeFileSync(join(rootDir, outDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n');
}

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

/** Returns undefined when the manifest is missing or malformed (old build). */
export function loadAssetManifest(rootDir: string, outDir: string): AssetManifest | undefined {
    try {
        const parsed = JSON.parse(readFileSync(join(rootDir, outDir, MANIFEST_FILE), 'utf8'));
        if (isStringArray(parsed?.css) && isStringArray(parsed?.js)) {
            return { css: parsed.css, js: parsed.js };
        }
    } catch {
        // fall through
    }
    return undefined;
}
