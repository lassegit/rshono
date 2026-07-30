/**
 * Regenerates `data.json`. Committed output — running this invalidates every historical result in
 * `results/`, so don't, unless you mean to start a new baseline.
 *
 * Deterministic: a fixed-seed LCG, no Math.random, no dates.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIRST = [
  'Ada',
  'Grace',
  'Alan',
  'Edsger',
  'Barbara',
  'Donald',
  'Linus',
  'Margaret',
  'Ken',
  'Dennis',
  'Guido',
  'Anita',
  'Tim',
  'Radia',
  'John',
  'Frances',
  'Claude',
  'Katherine',
  'Vint',
  'Shafi',
];
const LAST = [
  'Lovelace',
  'Hopper',
  'Turing',
  'Dijkstra',
  'Liskov',
  'Knuth',
  'Torvalds',
  'Hamilton',
  'Thompson',
  'Ritchie',
  'Rossum',
  'Borg',
  'Berners-Lee',
  'Perlman',
  'McCarthy',
  'Allen',
  'Shannon',
  'Johnson',
  'Cerf',
  'Goldwasser',
];
const ROLES = ['admin', 'editor', 'viewer'];

// Numerical Recipes LCG — small, seeded, and identical on every platform.
let seed = 20260730;
const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000;

const users = Array.from({ length: 100 }, (_, i) => {
  // User 1 is pinned to Ada Lovelace: the payload checks in APP_SPEC.md assert on that name.
  const first = i === 0 ? 'Ada' : FIRST[Math.floor(next() * FIRST.length)];
  const last = i === 0 ? 'Lovelace' : LAST[Math.floor(next() * LAST.length)];
  return {
    id: i + 1,
    name: `${first} ${last}`,
    email: `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}${i + 1}@example.com`,
    role: ROLES[Math.floor(next() * ROLES.length)],
    score: Math.floor(next() * 1000),
  };
});

const out = fileURLToPath(new URL('./data.json', import.meta.url));
writeFileSync(out, `${JSON.stringify({ users }, null, 2)}\n`);
console.log(`wrote ${users.length} users to ${out}`);
