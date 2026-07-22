import type { PageProps } from 'rshono';
import { Boundary } from 'rshono/client';
import { getContext } from 'rshono/server';
import { Layout } from './layout';

// A slow async server component — shows the Suspense loading half of <Boundary>.
async function SlowOk() {
  await new Promise((resolve) => setTimeout(resolve, 20));
  return <p data-section="ok">Section loaded fine.</p>;
}

// Sync so `fail` throws during render (caught by the error half of <Boundary>)
// rather than suspending first.
function Section({ fail }: { fail: boolean }) {
  if (fail) throw new Error('the section blew up on purpose');
  return <SlowOk />;
}

export default function BoundaryDemo(_props: PageProps) {
  const fail = getContext().searchParams.get('fail') === '1';

  return (
    <Layout title="Boundary — rshono">
      <div className="page">
        <h1>Boundary</h1>
        <p className="description">
          A single <code>&lt;Boundary&gt;</code> wraps an async section with both a loading and an error fallback. Add <code>?fail=1</code> to make
          the section throw — the error stays contained here instead of taking down the page.
        </p>

        <Boundary
          loading={<p data-section="loading">Loading section…</p>}
          error={<p data-section="error">This section failed to load, but the rest of the page is fine.</p>}
        >
          <Section fail={fail} />
        </Boundary>
      </div>
    </Layout>
  );
}
