---
title: Static files
description: public/ is mounted at the web root, as a fallback that never shadows a route.
---

Drop anything you want served verbatim into `public/`. It is mounted at the **web root**:

```
public/favicon.ico       →  /favicon.ico
public/robots.txt        →  /robots.txt
public/.well-known/…     →  /.well-known/…
```

This is the home for the conventional files browsers and crawlers request by path.

## It is a fallback

Your routes always win, and unmatched paths still fall through to the `notFound` page — so a `public/`
file **never shadows a real route**.

`rshono build` copies `public/` into `dist/`, so a deployed build is self-contained.

## Caching

Two different policies, because the two kinds of file have different guarantees:

| What                 | Served from | Caching                             |
| -------------------- | ----------- | ----------------------------------- |
| Hashed bundle output | `/_static/` | long-lived, `immutable`             |
| `public/` files      | web root    | short `max-age` (`no-cache` in dev) |

A bundle filename contains its content hash, so it can be cached forever. `public/favicon.svg` is the
same URL whatever its contents, so it cannot.

On a platform with a CDN, both go straight to the CDN. [Prerendered pages do
not](/docs/deployment#prerendered-pages-are-never-cdn-served) — that one is worth reading before you
reach for a cache rule.
