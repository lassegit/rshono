---
title: Styling
description: Native CSS, code-split per route — and the four lines that add Tailwind.
---

Import a stylesheet from any component:

```tsx
import './styles.css';
```

Rspack's native CSS pipeline compiles it, and the import **attaches the stylesheet to the importing
page's assets**. So CSS is code-split per route and arrives with the page that needs it, `<link>`ed in
the streamed HTML rather than fetched after hydration. `*.module.css` gets a class map.

## There is no PostCSS in the framework

Not as a dependency, not as an optional one. Native CSS is fast, and it is everything a plain stylesheet
needs.

What it cannot do is read CSS that isn't finished yet. `@import 'tailwindcss'`, `@theme` and `@apply`
are all parse-time nonsense to a CSS parser. A stylesheet that needs a plugin puts the plugin in front
of that parser itself, through the [`rspack` hook](/docs/configuration), and installs the two packages a
PostCSS pass takes.

## Tailwind

Tailwind is exactly that, and nothing else. Four things:

```bash
npm i -D tailwindcss @tailwindcss/postcss postcss postcss-loader
```

```ts
// rshono.config.ts — the hook is called once per compiler, so this reaches both graphs
export default defineConfig({
  rspack(config) {
    config.module!.rules!.push({ test: /\.css$/i, use: ['postcss-loader'], type: 'css/auto' });
  },
});
```

```js
// postcss.config.mjs — the plugin list, which postcss-loader finds on its own
export default { plugins: { '@tailwindcss/postcss': {} } };
```

```css
/* src/styles.css */
@import 'tailwindcss';
```

Keep `type: 'css/auto'` rather than `'css'`, or `*.module.css` stops being a CSS module.

`npx @rshono/create@latest --tailwind` writes all four of these for you.

## Any other PostCSS plugin

The same shape. The rule in the `rspack` hook is what puts postcss-loader in the chain; which plugins
run is `postcss.config.mjs`'s business, and postcss-loader finds that file on its own.
