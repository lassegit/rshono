/**
 * Server actions — 'use server' marks every exported function as a
 * server reference: client components import this module and receive
 * typed async stubs that POST back here. Importing server-only modules
 * (db.server) is safe — this code never leaves the server.
 *
 * The .server.ts suffix is optional for action modules: the framework's
 * client-bundle guard recognizes the 'use server' directive and lets
 * the RSC transform do its job. Wearing both is belt-and-braces — if
 * the directive were ever removed, the suffix would fail the build
 * instead of letting this module ship to the browser.
 */
'use server';

import { fakeDB, type User } from './db.server';

/** Called directly from client code (AddUserForm) with typed args. */
export async function createUser(data: { name: string; email: string }): Promise<User> {
    if (!data.name.trim() || !data.email.includes('@')) {
        throw new Error('A name and a valid email are required.');
    }
    return fakeDB.createUser({ name: data.name.trim(), email: data.email.trim() });
}

export interface SignupState {
    message?: string;
    error?: string;
}

/**
 * useActionState-shaped action: (previousState, formData) => newState.
 * Wired to a <form action={...}>, it also works before hydration or
 * with JavaScript disabled (progressive enhancement).
 */
export async function signup(_prev: SignupState, formData: FormData): Promise<SignupState> {
    const name = String(formData.get('name') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim();
    if (!name || !email.includes('@')) {
        return { error: 'Please provide a name and a valid email address.' };
    }
    const user = await fakeDB.createUser({ name, email });
    return { message: `Welcome aboard, ${user.name}! (user #${user.id})` };
}
