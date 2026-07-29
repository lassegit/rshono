import type { PageProps } from 'rshono';
import '../styles.css';

export default function Home({ url }: PageProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>postcss app</title>
      </head>
      {/* Utilities Tailwind only emits if it scanned this file, plus one from the fixture's @theme. */}
      <body className="bg-slate-50 font-sans">
        <h1 data-page="home" className="text-3xl font-bold text-fixture">
          PostCSS app
        </h1>
        <p data-url={url.href}>Compiled through the rspack hook in rshono.config.ts.</p>
      </body>
    </html>
  );
}
