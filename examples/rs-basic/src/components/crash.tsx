import { CrashForm } from './crash-form';
import { Layout } from './layout';

export default function Crash() {
  return (
    <Layout title="Error handling — rshono">
      <div className="page">
        <h1>Progressive-enhancement error handling</h1>
        <p className="description">
          This form calls a <code>'use server'</code> action that throws. Even with JavaScript disabled, the framework routes the failure to the{' '}
          <code>error</code> page instead of returning a blank 500.
        </p>
        <CrashForm />
      </div>
    </Layout>
  );
}
