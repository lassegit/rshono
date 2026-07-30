# website

The rshono website — landing page and documentation, built with rshono.

```bash
pnpm --filter website dev        # dev server with HMR, http://localhost:3000
pnpm --filter website build      # production build (deploy target from rshono.config.ts)
pnpm --filter website typecheck  # tsc --noEmit
pnpm --filter website lint       # eslint . (lint:fix to write)
```

Formatting is the repository's, not this app's — `pnpm format` at the root. The ESLint config carries no
stylistic rules, so the two do not overlap.

## The TypeScript pin

This app pins **TypeScript `~6.0.3`** while the rest of the repository is on 7. That is ESLint's price:
`typescript-eslint` reads the compiler API directly and accepts `>=4.8.4 <6.1.0`, so type-aware linting
and TypeScript 7 cannot both be installed. The pin is a tilde, not a caret — 6.1 is outside the range.

pnpm keeps it to this workspace, so `packages/core` and the other apps still build and typecheck on 7.
When typescript-eslint widens its range, this pin and the note in `eslint.config.mjs` are what to
delete.

## Layout

```
content/docs/       the documentation, one markdown file per page
eslint.config.mjs   flat config, type-aware — see the TypeScript pin above
rshono.config.ts    deploy target, siteUrl, and the two Rspack rules this app needs
src/
  routes.ts         the route table — the one file rshono requires
  server.ts         trailing-slash redirects and the error funnel
  content/
    docs.ts         the page list, in sidebar order — an import and a line per page
    markdown.ts     markdown → HTML + table of contents, with Shiki highlighting
  routes/           endpoint handlers: /docs/:slug.md, /llms.txt, /llms-full.txt
  components/       pages and components
  styles.css        Tailwind, plus the prose and Shiki rules
```

## Everything runs at build time

Every page is `render: 'static'`, so the markdown parse, the Shiki highlight and the table of contents
all happen once during `rshono build`. A documentation page is finished HTML by the time a browser sees
it, and the only client JavaScript it ships is a ~1 KB island that adds copy buttons to code blocks.

That is also why no page reads `ctx`: a prerendered page has no request to read one from. `url` is the
build-time URL, which is the right canonical only because `siteUrl` is set in `rshono.config.ts`.

## Adding a documentation page

Three steps, no codegen:

1. Write `content/docs/<slug>.md` with `title` and `description` frontmatter.
2. Add an import and an entry to the right section in `src/content/docs.ts`.
3. Nothing else — `routes.ts` derives `staticPaths` from that list, and so do the sidebar, the index
   page, `/llms.txt` and prev/next.

Frontmatter is YAML, so a `description` that starts with a quote needs quoting:
`description: "'use server' functions …"`.

## Markdown as a first-class output

Every page is served twice: as HTML, and as its own source.

| URL                | What                                                |
| ------------------ | --------------------------------------------------- |
| `/docs/routing`    | the rendered page (prerendered)                     |
| `/docs/routing.md` | the markdown source, verbatim, frontmatter included |
| `/llms.txt`        | [llms.txt](https://llmstxt.org) index of every page |
| `/llms-full.txt`   | every page concatenated, in reading order           |

The markdown is **imported**, not read from disk — an `asset/source` rule in `rshono.config.ts` bundles
it. That is what lets the `.md` endpoints work on a target with no filesystem, and it means the bytes
served are the same bytes the prerender parsed.

The `.md` route is registered **ahead of** `/docs/:slug` and carries a regex, because a `.` is not a
path separator: `/docs/:slug` would otherwise match `/docs/routing.md` and hand the page a slug it has
no content for.

## Deploying

The target is `deploy` in `rshono.config.ts`. Build for somewhere else without editing the file with
`rshono build --deploy <name>`, or `RSHONO_DEPLOY=<name>` in CI. `dev` always runs the Node dev server,
whatever the target.
