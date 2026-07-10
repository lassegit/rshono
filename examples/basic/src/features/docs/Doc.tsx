import { Layout } from "../layout";

/**
 * Doc page — static with params (SSG via staticPaths).
 *
 * Every slug returned by staticPaths() in routes.ts is rendered to
 * HTML at build time; unknown slugs fall back to SSR at request time.
 */
export default function Doc(props: Record<string, unknown>) {
  const { doc } = props as unknown as {
    doc: { slug: string; title: string; body: string };
  };

  return (
    <Layout>
      <div className="docs-page">
        <h1>{doc.title}</h1>
        <p>{doc.body}</p>

        <p className="meta">
          This page is <code>kind: "static"</code> with a param path — its slug
          came from <code>staticPaths()</code> and was pre-rendered at build time.
        </p>
      </div>
    </Layout>
  );
}
