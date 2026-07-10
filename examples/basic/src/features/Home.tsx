import { useEffect } from 'react';
import type { PageProps } from 'rs-hono';
import { Layout } from './layout';

/**
 * Home page — static (SSG).
 * Composes the Layout directly — no magic file, no auto-discovery.
 */
export default function Home(props: PageProps) {
    useEffect(() => {}, []);

    return (
        <Layout>
            <div className="hero">
                <h1>
                    <span className="emoji">⚡</span> rs-hono
                </h1>
                <p className="subtitle">Ultra-minimalist SSR framework</p>
                <p className="description">
                    Built on <a href="https://hono.dev">Hono</a> + <a href="https://rspack.dev">Rspack</a>. Under 10 dependencies.
                </p>

                <div className="features">
                    <div className="feature-card">
                        <h3>SSR & SSG</h3>
                        <p>Static pages pre-rendered at build time. Dynamic pages rendered on demand. You choose per-route.</p>
                    </div>
                    <div className="feature-card">
                        <h3>API Routes</h3>
                        <p>Full Hono power. JSON, streaming, cookies, WebSockets. Any HTTP method.</p>
                    </div>
                    <div className="feature-card">
                        <h3>Type-Safe</h3>
                        <p>Loader return types flow into page component props. End-to-end type inference.</p>
                    </div>
                </div>

                <div className="links">
                    <a href="/users" className="btn">
                        Browse Users →
                    </a>
                    <a href="/signup" className="btn btn-outline">
                        Sign Up →
                    </a>
                </div>

                <p className="meta">
                    This page is <code>kind: "static"</code> — pre-rendered at build time.
                    <br />
                    Current URL: <code>{props.url}</code>
                </p>
            </div>
        </Layout>
    );
}
