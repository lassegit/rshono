'use server-entry';

import type { PageProps } from 'rshono';
import { fakeDB } from '../db';
import { Layout } from './layout';

export default async function Documentation({ params, url }: PageProps<'/docs/:slug'>) {
  const [doc, docs] = await Promise.all([fakeDB.getDoc(params.slug), fakeDB.listDocs()]);

  return (
    <Layout title={`${doc?.title ?? 'Docs'} — rshono`}>
      {/*
        The absolute URL of a prerendered page is decided at build time — there is no request to
        read a Host from — so this is what `siteUrl` in rshono.config exists for. Without it the
        canonical tag baked into this file would point at localhost. React 19 hoists the link into
        <head> on its own.
      */}
      <link rel="canonical" href={url} />
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
