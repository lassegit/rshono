---
title: Server actions
description: "'use server' functions, callable from the client, with progressive enhancement."
---

`'use server'` modules export functions callable from client components:

```ts
'use server';

export async function createUser(data: { name: string; email: string }) {
  // runs on the server, always
}
```

Call them directly from client code, with typed arguments and result, or wire them to `<form action>` /
`useActionState`.

## Progressive enhancement

Forms keep working **before hydration and with JavaScript disabled**. A `<form action={createUser}>`
posts to the action either way; the client runtime upgrades it to a fetch once it has loaded, and until
then the browser's own form post does the job.

Every action response carries a fresh page payload, so server-rendered UI updates automatically after a
mutation — no manual refetch, no cache invalidation call.

## Every action is a public endpoint

**Every `'use server'` export is a public HTTP endpoint.** That is the RSC model, not an rshono choice:
the client is handed an id for each action and can call it with whatever arguments it likes.

The [CSRF check](/docs/security) proves a request came from your own site. It says nothing about _who_
sent it. Authenticate and authorize inside the action, and validate its arguments, exactly as you would
in a route handler.

## Errors

Thrown server-action errors are logged server-side and **redacted in the production payload** — React
sends no message and no digest for them. So return values, not throws, for anything the user should
see:

```ts
'use server';

export async function createUser(data: FormData) {
  const email = String(data.get('email') ?? '');
  if (!email.includes('@')) return { ok: false, error: 'That email looks wrong.' };
  // …
  return { ok: true };
}
```

Errors that do escape reach the same funnel as everything else the framework catches — register a
handler with `onServerError` in `src/server.ts` to send them somewhere real.

## Secrets

Server actions compile to server references and run only on the server, so they read the real
`process.env`. A secret read inside an action never reaches the browser. See
[Environment & secrets](/docs/environment) for where the line is drawn and how it is enforced.
