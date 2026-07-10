/**
 * Server-side CSS import hooks.
 *
 * The server runs the user's TypeScript source directly via tsx — there
 * is no server bundle — so `import './styles.css'` in a layout or page
 * would reach Node as-is and crash (Node parses the CSS as JavaScript).
 * These hooks make CSS imports inert on the server; the CLIENT bundle is
 * where Rspack extracts the real rules, and <Assets/> links the emitted
 * files into <head>.
 *
 * - `*.css`        → empty module (pure side-effect import, no exports)
 * - `*.module.css` → named exports mapping each class to the SAME name
 *   Rspack generates in the client bundle. The Rspack config pins
 *   `localIdentName: '[name]__[local]'`, which is reproducible here from
 *   the filename alone: "Button.module.css" + ".hero" → "Button.module__hero".
 *   Only classes that are valid JS identifiers are exported (kebab-case
 *   class names cannot be named exports — same limitation as the client).
 *
 * Plain .mjs on purpose: `module.register()` loads this file in Node's
 * hooks thread, where tsx's TypeScript transform is not guaranteed to
 * be active.
 */
import { readFileSync } from 'node:fs';
import { createRequire, register } from 'node:module';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS_MODULE = /\.module\.css$/;

/**
 * Install CSS handling for both module systems. Must run before any
 * user code (routes, pages, layouts) is imported.
 */
export function registerCssHooks() {
    // ESM — the normal path (projects are "type": "module"): the load
    // hook below runs in Node's hooks thread and sees every import.
    register(import.meta.url);

    // CJS belt-and-braces for projects without "type": "module", where
    // tsx compiles imports to require() calls that consult
    // require.extensions instead of the ESM hooks.
    const require = createRequire(import.meta.url);
    require.extensions['.css'] = (mod, filename) => {
        mod.exports = CSS_MODULE.test(filename) ? classNameMap(filename) : {};
    };
}

/** ESM load hook: replace CSS sources with server-safe stubs. */
export async function load(url, context, nextLoad) {
    // tsx watch may append ?query cache-busters to module URLs.
    const clean = url.split('?')[0].split('#')[0];
    if (!clean.startsWith('file:') || !clean.endsWith('.css')) {
        return nextLoad(url, context);
    }
    const filename = fileURLToPath(clean);
    if (!CSS_MODULE.test(filename)) {
        return { format: 'module', shortCircuit: true, source: '' };
    }
    const source = Object.entries(classNameMap(filename))
        .map(([local, generated]) => `export const ${local} = ${JSON.stringify(generated)};`)
        .join('\n');
    return { format: 'module', shortCircuit: true, source };
}

// Class extraction: comments are stripped, then anything that looks like
// a class selector is collected. Over-matching (e.g. ".png" inside a
// url()) only produces harmless extra exports.
const CLASS_SELECTOR = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g;
const JS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const RESERVED = new Set(
    (
        'await break case catch class const continue debugger default delete do else enum export extends ' +
        'false finally for function if import in instanceof new null return super switch this throw true ' +
        'try typeof var void while with yield let static'
    ).split(' '),
);

/** Map local class names to the client bundle's generated names. */
function classNameMap(filename) {
    let css;
    try {
        css = readFileSync(filename, 'utf8');
    } catch {
        return {};
    }
    // "[name]" in Rspack's localIdentName keeps the ".module" part:
    // Button.module.css → "Button.module".
    const prefix = basename(filename).replace(/\.css$/, '');
    const map = {};
    for (const match of css.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(CLASS_SELECTOR)) {
        const local = match[1];
        if (JS_IDENTIFIER.test(local) && !RESERVED.has(local)) {
            map[local] = `${prefix}__${local}`;
        }
    }
    return map;
}
