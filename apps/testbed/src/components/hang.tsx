import { Boundary } from '@rshono/core/client';
import { hang } from '../actions';
import { Layout } from './layout';

// The form is rendered by this server component directly — no 'use client' island — so React emits
// the $ACTION_* fields for progressive enhancement and the action is reachable with a plain POST.
//
// <Boundary> is a 'use client' component, so its fallbacks have to be plain nodes here: a render
// function can't cross the server→client boundary. The <form> itself travels as children, which is
// fine — a server-action reference is serializable.
export default function Hang() {
  return (
    <Layout title="Hanging action — rshono">
      <div className="page">
        <h1>Hanging action</h1>
        <p className="description">
          This form calls a <code>'use server'</code> action that never settles. The request deadline (<code>renderTimeout</code>) covers the action as
          well as the render, so the request is cut off instead of holding the socket open forever.
        </p>
        <p className="description">
          Without JavaScript the cut-off request is a plain 500 and the <code>error</code> page renders. With JavaScript the failure comes back through
          the action call instead, and the <code>&lt;Boundary&gt;</code> below contains it — the rest of the page stays interactive.
        </p>

        <Boundary
          loading={<p data-section="loading">Waiting on the server…</p>}
          error={<p data-section="error">The action was cut off by the request deadline. The rest of the page is fine.</p>}
        >
          <form action={hang} className="form">
            <button className="btn" type="submit">
              Never finishes
            </button>
          </form>
        </Boundary>
      </div>
    </Layout>
  );
}
