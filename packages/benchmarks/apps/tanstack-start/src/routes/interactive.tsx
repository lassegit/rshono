import { createFileRoute } from '@tanstack/react-router';
import { getUsers } from '../server-fns';
import { MARKER } from '../touch-marker';
import { Counter } from '../components/counter';
import { Filter } from '../components/filter';
import { SignupForm } from '../components/signup-form';

/**
 * APP_SPEC.md `/interactive`: three interactive components — local state, a filtered list over the
 * full fixture, and a server function.
 */
export const Route = createFileRoute('/interactive')({
  loader: () => getUsers(),
  component: Interactive,
});

function Interactive() {
  const { users } = Route.useLoaderData();

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
