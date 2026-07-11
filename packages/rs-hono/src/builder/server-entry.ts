/**
 * Server-bundle entry generator (`rs-hono build --target ...`).
 *
 * The tsx-based runtime discovers routes.ts / server.ts /
 * rs-hono.config.ts on disk at startup; a bundle must import them
 * statically instead. The build writes this little entry to a temp
 * file, points Rspack at it, and deletes it afterwards — the absolute
 * paths below are build-machine paths that exist only during the
 * compile; nothing of them survives into the emitted bundle.
 *
 * __RS_HONO_ASSETS__ is injected by DefinePlugin (the client compile's
 * asset manifest), so the bundle never reads assets.json at runtime.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerBundleTarget } from './rspack-server-config.js';

const FRAMEWORK_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

interface ServerEntryOptions {
    rootDir: string;
    outDir: string;
    publicDir: string;
    target: ServerBundleTarget;
}

export function generateServerEntry(options: ServerEntryOptions): string {
    const { rootDir, outDir, publicDir, target } = options;
    const srcDir = join(rootDir, 'src');
    const spec = (path: string) => JSON.stringify(path);

    const hasServerApp = existsSync(join(srcDir, 'server.ts'));
    const hasConfig = existsSync(join(rootDir, 'rs-hono.config.ts'));

    const imports = [
        `import { setAssets } from ${spec(join(FRAMEWORK_SRC, 'assets.tsx'))};`,
        `import { routes } from ${spec(join(srcDir, 'routes.ts'))};`,
    ];
    const consts = [
        hasServerApp ? `import subApp from ${spec(join(srcDir, 'server.ts'))};` : `const subApp = undefined;`,
        hasConfig
            ? `import * as configModule from ${spec(join(rootDir, 'rs-hono.config.ts'))};\nconst config = configModule.default ?? configModule;`
            : `const config = {};`,
    ];

    if (target === 'edge') {
        imports.push(
            `import { buildApp } from ${spec(join(FRAMEWORK_SRC, 'server', 'app.tsx'))};`,
            `import { renderToStream } from ${spec(join(FRAMEWORK_SRC, 'server', 'ssr-web.ts'))};`,
        );
        return [
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
    }

    return [
        // FIRST import so it evaluates before any user module (ESM
        // evaluates dependencies in import order): real env > .env.local
        // > .env, exactly like the tsx-based CLI.
        `import ${spec(join(FRAMEWORK_SRC, 'server', 'load-env.ts'))};`,
        `import { buildNodeApp } from ${spec(join(FRAMEWORK_SRC, 'server', 'handler.ts'))};`,
        `import { serve } from ${spec(join(FRAMEWORK_SRC, 'server', 'node-server.ts'))};`,
        ...imports,
        ...consts,
        `setAssets(__RS_HONO_ASSETS__);`,
        // Paths resolve from cwd: run `node ${outDir}/server/index.mjs`
        // from the directory that contains ${outDir}/.
        `const app = buildNodeApp({ routes, subApp, middleware: config.server?.middleware, rootDir: process.cwd(), outDir: ${JSON.stringify(outDir)}, publicDir: ${JSON.stringify(publicDir)}, isDev: false });`,
        `if (config.server?.onStart) await config.server.onStart();`,
        `const envPort = Number.parseInt(process.env.PORT ?? '', 10);`,
        `const port = Number.isInteger(envPort) ? envPort : (config.dev?.port ?? 3000);`,
        `await serve({ fetch: app.fetch, port });`,
        `console.log(\`  ➜  Serving at: http://localhost:\${port}\`);`,
        ``,
    ].join('\n');
}
