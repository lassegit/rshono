'use client';

import { useNavigation } from 'rshono/client';

export function NavInfo() {
  const nav = useNavigation();

  return (
    <div className="feature-card" style={{ margin: '1.5rem auto', maxWidth: '28rem' }}>
      <h3>useNavigation()</h3>
      <p className="meta">
        pathname: <code data-nav="pathname">{nav.pathname}</code>
        <br />
        param id: <code data-nav="param-id">{nav.params.id ?? '(none)'}</code>
        <br />
        query tab: <code data-nav="query-tab">{nav.searchParams.get('tab') ?? '(none)'}</code>
        <br />
        pending: <code data-nav="pending">{nav.router.pending ? 'yes' : 'no'}</code>
      </p>
      <p>
        <button className="btn" onClick={() => nav.router.push('/users')}>
          push('/users')
        </button>{' '}
        <button className="btn btn-outline" onClick={() => nav.router.refresh()}>
          refresh()
        </button>
      </p>
    </div>
  );
}
