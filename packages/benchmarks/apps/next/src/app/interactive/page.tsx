import { users } from '@/data';
import { MARKER } from '@/touch-marker';
import { Counter } from '@/components/counter';
import { Filter } from '@/components/filter';
import { SignupForm } from '@/components/signup-form';

/**
 * APP_SPEC.md `/interactive`: a server shell around three client components. This is where the
 * hydration cost, the serialized boundary payload and the mutation path all land.
 *
 * Forced dynamic to match the other two apps, where this route is dynamic by default.
 */
export const dynamic = 'force-dynamic';

export default function Interactive() {
  return (
    <>
      <h1>Interactive</h1>
      <p className="subtitle">Three client components: local state, a filtered list, a server function.</p>

      <section>
        <h2>Counter</h2>
        <Counter />
      </section>

      <section>
        <h2>Filter</h2>
        <Filter users={users} />
      </section>

      <section>
        <h2>Sign up</h2>
        <SignupForm />
      </section>

      <p className="summary" data-marker={MARKER}>
        Server-rendered shell.
      </p>
    </>
  );
}
