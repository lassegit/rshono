import { users } from '../data';
import { MARKER } from '../touch-marker';
import { Counter } from './counter';
import { Filter } from './filter';
import { Layout } from './layout';
import { SignupForm } from './signup-form';

/**
 * APP_SPEC.md `/interactive`: a server shell around three client components. This is where the
 * hydration cost, the serialized boundary payload and the mutation path all land.
 */
export default function Interactive() {
  return (
    <Layout title="Interactive">
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
    </Layout>
  );
}
