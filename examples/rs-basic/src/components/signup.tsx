import { Layout } from './layout';
import { SignupForm } from './signup-form';

export default function Signup() {
  return (
    <Layout title="Sign Up — rshono">
      <div className="page">
        <h1>Sign Up</h1>
        <p className="description">
          This form calls a <code>'use server'</code> action through <code>useActionState</code>. It works before hydration and even with JavaScript
          disabled.
        </p>
        <SignupForm />
      </div>
    </Layout>
  );
}
