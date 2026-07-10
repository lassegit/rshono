import { Layout } from "./layout";

export default function HomePage() {
  return (
    <Layout title="Welcome to rs-hono">
      <div>
        <h1>Welcome to rs-hono</h1>
        <p>
          An ultra-minimalist SSR framework built on{" "}
          <a href="https://hono.dev">Hono</a> +{" "}
          <a href="https://rspack.dev">Rspack</a>.
        </p>
        <p>
          <a href="/about">Learn more →</a>
        </p>
      </div>
    </Layout>
  );
}
