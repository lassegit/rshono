---
title: Server actions
description: "'use server' functions, callable from the client, with progressive enhancement."
---

`'use server'` modules export functions callable from client components, with typed arguments and
result:

```ts
'use server';

export async function createUser(data: { name: string; email: string }) {
  // runs on the server, always
}
```

Call them directly, or wire them to `<form action>` / `useActionState`. There is no route handler in
between.

## Progressive enhancement

A `<form action={createUser}>` posts **before hydration and with JavaScript disabled**. The client
runtime upgrades it to a fetch once loaded; until then the browser's own form post does the job.

Every action response carries a fresh page payload, so server-rendered UI updates after a mutation with
no refetch and no cache invalidation call.

## Every action is a public endpoint

That is the RSC model, not an rshono choice: the client is handed an id for each action and can call it
with whatever arguments it likes. The [CSRF check](/docs/configuration#csrf) proves a request came from
your own site; it says nothing about _who_ sent it. Authenticate, authorize and validate arguments
inside the action, exactly as in a route handler.

## Errors

Thrown action errors are logged server-side and **redacted in the production payload** — React sends no
message and no digest. Return values, not throws, for anything the user should see:

```ts
'use server';

export async function createUser(data: FormData) {
  const email = String(data.get('email') ?? '');
  if (!email.includes('@')) return { ok: false, error: 'That email looks wrong.' };
  return { ok: true };
}
```

Errors that do escape reach [`onServerError`](/docs/hono#error-reporting) like everything else the
framework catches.

## Secrets

Actions compile to server references and run only on the server, so they read the real `process.env`.
See [Environment & secrets](/docs/configuration#environment-and-secrets).
