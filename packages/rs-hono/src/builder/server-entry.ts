/**
 * Server-bundle entry generator (`rs-hono build --target ...`).
 *
 * The tsx-based runtime discovers routes.ts / the *.server.ts sub-app /
 * rs-hono.config.ts on disk at startup; a bundle must import them
 * statically instead. The build writes these little modules to temp
 * files, points Rspack at the entry, and deletes them afterwards — the
 * absolute paths below are build-machine paths that exist only during
 * the compile; nothing of them survives into the emitted bundle.
 *
 * The node bundle is location-independent: paths are derived from
 * `import.meta.dirname`, which Rspack rewrites to resolve to the
 * emitted bundle's real directory at runtime (raw `import.meta.url`
 * would be baked to the build-machine source path — verified). So
 * `node <anywhere>/dist/server/index.mjs` works from any cwd, as long
 * as dist/ keeps its layout (client/, ssg/ as siblings of server/).
 *
 * __RS_HONO_ASSETS__ is injected by DefinePlugin (the client compile's
 * asset manifest), so the bundle never reads assets.json at runtime.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveServerAppPath } from '../server/load.js';
import type { ServerBundleTarget } from './rspack-server-config.js';

const FRAMEWORK_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

interface ServerEntryOptions {
    rootDir: string;
    outDir: string;
    publicDir: string;
    target: ServerBundleTarget;
}

export interface GeneratedServerEntry {
    /** Absolute path of the module Rspack uses as the bundle entry. */
    entryPath: string;
    /** Every file to write before the compile (and delete after). */
    files: Array<{ path: string; source: string }>;
}

export function generateServerEntry(options: ServerEntryOptions): GeneratedServerEntry {
    const { rootDir, outDir, publicDir, target } = options;
    const srcDir = join(rootDir, 'src');
    const spec = (path: string) => JSON.stringify(path);

    const serverAppPath = resolveServerAppPath(srcDir);
    const hasConfig = existsSync(join(rootDir, 'rs-hono.config.ts'));

    // The bundle lives at <rootDir>/<outDir>/server/<file>.mjs — the
    // project (deploy) root is one `..` per outDir segment, plus one
    // for server/. Emitted as literal '..' args so the expression
    // survives into the bundle and resolves at runtime.
    const ups = outDir.split(/[\\/]/).filter(Boolean).length + 1;
    const rootExpr = `join(import.meta.dirname, ${Array(ups).fill("'..'").join(', ')})`;

    const imports = [
        `import { setAssets } from ${spec(join(FRAMEWORK_SRC, 'assets.tsx'))};`,
        `import { routes } from ${spec(join(srcDir, 'routes.ts'))};`,
    ];
    const consts = [
        serverAppPath ? `import subApp from ${spec(serverAppPath)};` : `const subApp = undefined;`,
        hasConfig
            ? `import * as configModule from ${spec(join(rootDir, 'rs-hono.config.ts'))};\nconst config = configModule.default ?? configModule;`
            : `const config = {};`,
    ];

    if (target === 'edge') {
        imports.push(
            `import { buildApp } from ${spec(join(FRAMEWORK_SRC, 'server', 'app.tsx'))};`,
            `import { renderToStream } from ${spec(join(FRAMEWORK_SRC, 'server', 'ssr-web.ts'))};`,
        );
        const entryPath = join(rootDir, outDir, '.server-entry.edge.mjs');
        const source = [
            ...imports,
            ...consts,
            `setAssets(__RS_HONO_ASSETS__);`,
            `const app = buildApp({ routes, subApp, isDev: false, middleware: config.server?.middleware, render: renderToStream });`,
            // Module evaluation is edge "startup"; top-level await is
            // supported in module workers.
            `if (config.server?.onStart) await config.server.onStart();`,
            // The Workers/Bun module shape (app.fetch is the handler);
            // Deno: import it and call Deno.serve(app.fetch).
            `export default app;`,
            ``,
        ].join('\n');
        return { entryPath, files: [{ path: entryPath, source }] };
    }

    // .env preamble — a SEPARATE module imported first, because ESM
    // evaluates imports before the entry body: env must be set before
    // any user module (the sub-app's top-level, config) can read it.
    const envPreamblePath = join(rootDir, outDir, '.server-env.node.mjs');
    const envPreambleSource = [
        `import { loadEnvFiles } from ${spec(join(FRAMEWORK_SRC, 'server', 'load-env.ts'))};`,
        `import { join } from 'node:path';`,
        `loadEnvFiles(${rootExpr});`,
        ``,
    ].join('\n');

    const entryPath = join(rootDir, outDir, '.server-entry.node.mjs');
    const source = [
        `import ${spec(envPreamblePath)};`,
        `import { join } from 'node:path';`,
        `import { buildNodeApp } from ${spec(join(FRAMEWORK_SRC, 'server', 'handler.ts'))};`,
        `import { serve } from ${spec(join(FRAMEWORK_SRC, 'server', 'node-server.ts'))};`,
        ...imports,
        ...consts,
        `setAssets(__RS_HONO_ASSETS__);`,
        `const app = buildNodeApp({ routes, subApp, middleware: config.server?.middleware, rootDir: ${rootExpr}, outDir: ${JSON.stringify(outDir)}, publicDir: ${JSON.stringify(publicDir)}, isDev: false });`,
        `if (config.server?.onStart) await config.server.onStart();`,
        // Same strictness as `rs-hono start`: a malformed PORT is a
        // deploy mistake — refuse to fall back silently.
        `let port = config.dev?.port ?? 3000;`,
        `if (process.env.PORT) {`,
        `    port = Number(process.env.PORT);`,
        `    if (!Number.isInteger(port) || port < 0 || port > 65535) {`,
        `        console.error(\`  ✗ Invalid PORT environment variable: "\${process.env.PORT}"\`);`,
        `        process.exit(1);`,
        `    }`,
        `}`,
        `await serve({ fetch: app.fetch, port });`,
        `console.log(\`  ➜  Serving at: http://localhost:\${port}\`);`,
        ``,
    ].join('\n');

    return {
        entryPath,
        files: [
            { path: envPreamblePath, source: envPreambleSource },
            { path: entryPath, source },
        ],
    };
}
