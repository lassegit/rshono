'use server-entry';

import type { PageProps } from 'rsc-hono';
import { fakeDB } from '../db.server';
import { Layout } from './layout';

/**
 * A `kind: 'static'` route — `rsc-hono build` prerenders one HTML file
 * per staticPaths() entry, served from disk in production. Unknown
 * slugs fall back to per-request rendering.
 */
export default async function Documentation({ params }: PageProps<'/docs/:slug'>) {
    const [doc, docs] = await Promise.all([fakeDB.getDoc(params.slug), fakeDB.listDocs()]);

    return (
        <Layout title={`${doc?.title ?? 'Docs'} — rsc-hono`}>
            <div className="page">
                <nav className="meta">
                    {docs.map((d, i) => (
                        <span key={d.slug}>
                            {i > 0 && ' · '}
                            {d.slug === params.slug ? <strong>{d.title}</strong> : <a href={`/docs/${d.slug}`}>{d.title}</a>}
                        </span>
                    ))}
                </nav>

                {doc ? (
                    <>
                        <h1>{doc.title}</h1>
                        <p className="description">{doc.body}</p>
                        <p className="meta">
                            This page is <code>kind: "static"</code> — pre-rendered at build time.
                        </p>
                    </>
                ) : (
                    <>
                        <h1>Not found</h1>
                        <p className="description">
                            No doc named <code>{params.slug}</code>.
                        </p>
                    </>
                )}
            </div>
        </Layout>
    );
}
