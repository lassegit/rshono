import type { PageProps } from 'rshono';
import { CrashForm } from './crash-form';
import { Layout } from './layout';

export default function Crash({ url }: PageProps) {
  // ?render=1 throws during the render itself rather than from an action. That fails SSR before any
  // of the shell has been sent, which is the one path the app's `error` page can't be reached from —
  // the framework's own 500 document answers instead. Without it the browser would show nothing at
  // all, so the e2e suite asserts that document is visible.
  if (new URL(url).searchParams.get('render') === '1') {
    throw new Error('Intentional render failure (SSR-failure demo).');
  }

  return (
    <Layout title="Error handling — rshono">
      <div className="page">
        <h1>Progressive-enhancement error handling</h1>
        <p className="description">
          This form calls a <code>'use server'</code> action that throws. Even with JavaScript disabled, the framework routes the failure to the{' '}
          <code>error</code> page instead of returning a blank 500.
        </p>
        <CrashForm />
        <p className="description">
          <a href="/crash?render=1">Throw during render instead</a> — SSR fails before the shell is sent, so the framework's own 500 document answers.
        </p>
      </div>
    </Layout>
  );
}
