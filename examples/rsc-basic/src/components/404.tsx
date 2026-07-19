import type { PageProps } from 'rsc-hono';
import { Layout } from './layout';

/**
 * The notFound page from routes.ts — an ordinary server component
 * (directive auto-injected, per-page assets, soft-nav aware). Rendered
 * with status 404 whenever no route matches an HTML or flight request.
 */
export default function NotFound({ url }: PageProps) {
    return (
        <Layout title="404 — rsc-hono">
            <div className="page">
                <h1>404 — nothing here</h1>
                <p className="description">
                    No page at <code>{url}</code>. <a href="/">Back to the start</a>.
                </p>
            </div>
        </Layout>
    );
}
