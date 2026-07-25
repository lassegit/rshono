import { hang } from '../actions';
import { Layout } from './layout';

// The form is rendered by this server component directly — no 'use client' island — so React emits
// the $ACTION_* fields for progressive enhancement and the action is reachable with a plain POST.
export default function Hang() {
  return (
    <Layout title="Hanging action — rshono">
      <div className="page">
        <h1>Hanging action</h1>
        <p className="description">
          This form calls a <code>'use server'</code> action that never settles. The request deadline (<code>renderTimeout</code>) covers the action as
          well as the render, so the request is cut off instead of holding the socket open forever.
        </p>
        <form action={hang} className="form">
          <button className="btn" type="submit">
            Never finishes
          </button>
        </form>
      </div>
    </Layout>
  );
}
