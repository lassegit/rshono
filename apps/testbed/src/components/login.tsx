import { Layout } from './layout';
import { LoginForm } from './login-form';

export default function Login() {
  return (
    <Layout title="Log in — rshono">
      <div className="page">
        <h1>Log in</h1>
        <p className="description">
          A <code>'use server'</code> action sets a session cookie and calls <code>redirect('/dashboard')</code> — a real POST-redirect-GET that works
          with JavaScript disabled.
        </p>
        <LoginForm />
      </div>
    </Layout>
  );
}
