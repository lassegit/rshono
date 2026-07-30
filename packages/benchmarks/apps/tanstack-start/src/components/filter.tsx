import { useState } from 'react';
import type { User } from '../server-fns';

/**
 * Receives all 100 users as a prop, so the list crosses the server/client boundary and shows up in
 * whatever the framework serializes into the document. Filtering is client-side.
 */
export function Filter({ users }: { users: User[] }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const matches = needle ? users.filter((u) => u.name.toLowerCase().includes(needle) || u.email.includes(needle)) : users;

  return (
    <>
      <div className="row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name or email" aria-label="Filter users" />
        <span>
          {matches.length} of {users.length}
        </span>
      </div>
      <ul className="matches">
        {matches.slice(0, 25).map((user) => (
          <li key={user.id}>
            {user.name} — {user.email} ({user.role})
          </li>
        ))}
      </ul>
    </>
  );
}
