import fixture from './generated/data.json';

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  score: number;
}

/** Parsed once at module scope. APP_SPEC.md rule 1: no I/O, no delay, on any request path. */
export const users: User[] = fixture.users;

export const summary = {
  count: users.length,
  totalScore: users.reduce((a, u) => a + u.score, 0),
  admins: users.filter((u) => u.role === 'admin').length,
};
