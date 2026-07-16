'use server-entry';

import type { PageProps } from 'rsc-hono';
import { Counter } from './counter';
import { Layout } from './layout';

/**
 * A server component page: rendered on the server per request, shipped
 * to the browser as a serialized payload. The <Counter/> island is the
 * only part that hydrates.
 */
export default function Home(props: PageProps) {
    return (
        <Layout title="rsc-hono — Ultra-minimalist RSC framework" description="Hono + Rspack + React Server Components">
            <div className="hero">
                <h1>
                    <span className="emoji">⚡</span> rsc-hono
                </h1>
                <p className="subtitle">Ultra-minimalist RSC framework</p>
                <p className="description">
                    Built on <a href="https://hono.dev">Hono</a> + <a href="https://rspack.dev">Rspack</a> +{' '}
                    <a href="https://react.dev/reference/rsc/server-components">React Server Components</a>.
                </p>

                <div className="features">
                    <div className="feature-card">
                        <h3>Server Components</h3>
                        <p>Pages run on the server and fetch data with plain async/await — no loaders, no client bundles for static parts.</p>
                    </div>
                    <div className="feature-card">
                        <h3>Server Actions</h3>
                        <p>'use server' functions callable from the browser — with progressive enhancement for JS-free forms.</p>
                    </div>
                    <div className="feature-card">
                        <h3>API Routes</h3>
                        <p>Full Hono power. JSON, streaming, cookies. Any HTTP method.</p>
                    </div>
                </div>

                <Counter />

                <div className="links">
                    <a href="/users" className="btn">
                        Browse Users →
                    </a>
                    <a href="/signup" className="btn btn-outline">
                        Sign Up →
                    </a>
                </div>

                <p className="meta">
                    Rendered on the server for <code>{props.url}</code>
                </p>
            </div>
        </Layout>
    );
}
