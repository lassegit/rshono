import type { PageProps } from "rs-hono";
import { Layout } from "../layout";

export default function Signup(props: PageProps) {
  return (
    <Layout>
    <div className="signup-page">
      <h1>Sign Up</h1>
      <p>Create your account. Form submission goes to an API endpoint.</p>

      <form action="/api/users" method="POST" className="signup-form">
        <label>
          Name
          <input type="text" name="name" placeholder="Your name" required />
        </label>
        <label>
          Email
          <input type="email" name="email" placeholder="you@example.com" required />
        </label>
        <button type="submit" className="btn">
          Create Account
        </button>
      </form>

      <p className="meta">
        This page is <code>kind: "static"</code>. The form submits to{" "}
        <code>POST /api/users</code> (an endpoint route).
      </p>
    </div>
    </Layout>
  );
}
