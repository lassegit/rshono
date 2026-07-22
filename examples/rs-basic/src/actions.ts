'use server';

import { getContext, redirect } from 'rshono/server';
import { fakeDB, type User } from './db';

export async function createUser(data: { name: string; email: string }): Promise<User> {
  if (!data.name.trim() || !data.email.includes('@')) {
    throw new Error('A name and a valid email are required.');
  }
  return fakeDB.createUser({ name: data.name.trim(), email: data.email.trim() });
}

export interface LoginState {
  error?: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email.includes('@')) return { error: 'Enter a valid email address.' };
  getContext().cookies.set('session', encodeURIComponent(email), { path: '/', httpOnly: true, sameSite: 'Lax' });
  redirect('/dashboard');
}

export interface SignupState {
  message?: string;
  error?: string;
}

export async function signup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  if (!name || !email.includes('@')) {
    return { error: 'Please provide a name and a valid email address.' };
  }
  const user = await fakeDB.createUser({ name, email });
  getContext().cookies.set('welcomed', encodeURIComponent(user.name), { path: '/', httpOnly: true });
  return { message: `Welcome aboard, ${user.name}! (user #${user.id})` };
}
