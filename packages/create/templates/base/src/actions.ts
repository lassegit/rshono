'use server';

/**
 * A server action: an ordinary async function the browser can call. React hands the client an id for
 * this export and posts to it, so **every `'use server'` export is a public HTTP endpoint** —
 * authenticate, authorize and validate the arguments exactly as you would in a route handler. The
 * framework's CSRF check proves a request came from your own site; it says nothing about who sent it.
 *
 * The signature is the one `useActionState` expects: previous state first, then the form data.
 */
export async function greet(_previous: string | null, formData: FormData): Promise<string> {
  // A form field is a string or a File, never only a string — a file input posted under this name would
  // stringify to "[object File]" rather than fail. Narrowing is the validation the endpoint owes itself.
  const field = formData.get('name');
  const name = typeof field === 'string' ? field.trim() : '';
  if (!name) return 'Type a name first.';

  // Where real work goes — a database write, an email, a queue push.
  await new Promise((resolve) => setTimeout(resolve, 300));

  return `Hello, ${name}. This ran on the server.`;
}
