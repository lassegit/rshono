---
title: Prerendering
description: render 'static' builds a route once, in both the representations a page is asked for.
---

Mark a route `render: 'static'` and it is built once, at build time, instead of per request.

```ts
{
  path: '/docs/:slug',
  render: 'static',
  component: () => import('./components/documentation'),
  staticPaths: async () => (await db.docs.all()).map((d) => ({ slug: d.slug })),
}
```

## Both representations, not just the document

A static route is served from disk in **both** the forms a page is asked for:

- `index.html` — the document, for a hard load.
- `index.rsc` — the flight payload a soft navigation asks for.

Serving only the document would mean every in-app click re-rendered a page the build had already
produced, so the prerender would pay off for crawlers and nobody else. Both carry a weak `ETag`, so a
revalidation costs a 304 rather than the page.

## `staticPaths`

A static route **with params** needs `staticPaths` — the param sets to prerender, one file each. It runs
at build time only, on the server, so it may hit a database or read the filesystem.

Wildcard (`*`), optional and regex params cannot be prerendered.

A parameterised static route _without_ `staticPaths` falls back to rendering per request, and the build
warns. So does a page that didn't render cleanly at build time. Either way the build tells you, and that
route quietly keeps working as a dynamic one.

## `siteUrl` is not optional here

Set [`siteUrl`](/docs/configuration) if your static pages build absolute URLs — a canonical tag, an
`og:url`, an absolute link.

A prerendered file is one set of bytes handed to everyone, so there is no request to read a `Host` from
and the origin has to be decided at build time. Without `siteUrl` it is `http://localhost`, and the
build warns.

Dynamic routes are unaffected — they resolve the URL per request, `siteUrl` or not.

## What a static page cannot do

- **Reading `ctx` throws.** There is no request. Use `params` and `url`, or make the route dynamic.
- **`url.searchParams` is always empty.** The page was rendered against `siteUrl` plus the path, with no
  query, and that one file answers every request whatever its own query. Read the query with
  `useNavigation().url` on the client instead.

## The CSP interaction

With [`csp: true`](/docs/security), the **document** for a static route is rendered per request — a
prerendered file cannot carry a per-request nonce. Its flight payload never carries one, so soft
navigations are still served from the prerender.
