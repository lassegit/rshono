import type { LoaderProps } from 'rs-hono';
import type { loader } from './Doc.server';
import { Layout } from './layout';

/**
 * Doc page — static with params (SSG via staticPaths).
 *
 * Every slug returned by staticPaths() in Doc.server.ts is rendered to
 * HTML at build time; unknown slugs fall back to SSR at request time.
 * Props are inferred from the loader via the type-only import above.
 */
export default function Doc({ doc }: LoaderProps<typeof loader>) {
    return (
        <Layout title={`${doc.title} — rs-hono docs`} description={doc.body}>
            <div className="docs-page">
                <h1>{doc.title}</h1>
                <p>{doc.body}</p>

                <p className="meta">
                    This page is <code>kind: "static"</code> with a param path — its slug came from <code>staticPaths()</code> and was pre-rendered at
                    build time.
                </p>
            </div>
        </Layout>
    );
}
