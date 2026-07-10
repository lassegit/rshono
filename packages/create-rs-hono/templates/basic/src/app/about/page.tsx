import { Layout } from "../layout";

export default function AboutPage() {
  return (
    <Layout title="About rs-hono">
      <div>
        <h1>About rs-hono</h1>
        <p>
          rs-hono combines the minimal HTTP framework Hono with the
          lightning-fast Rspack bundler to give you:
        </p>
        <ul>
          <li>Server-Side Rendering (SSR) with streaming & hydration</li>
          <li>One explicit route manifest — src/routes.ts</li>
          <li>API endpoints as plain Hono handlers</li>
          <li>A real server/client boundary: *.server.ts files never reach the browser</li>
        </ul>
      </div>
    </Layout>
  );
}
