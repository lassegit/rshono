import { expect, test } from '@playwright/test';

/**
 * Marks the current document so a later assertion can tell a *soft* navigation (same document, new
 * payload) from a full browser load, which is the whole distinction these tests exist to check.
 */
async function markDocument(page) {
  await page.evaluate(() => {
    window.__rshonoDocumentId = Math.random().toString(36);
    return window.__rshonoDocumentId;
  });
  return page.evaluate(() => window.__rshonoDocumentId);
}

const documentId = (page) => page.evaluate(() => window.__rshonoDocumentId ?? null);

test.describe('hydration', () => {
  test('a client island hydrates and holds its own state', async ({ page }) => {
    await page.goto('/');
    const counter = page.getByRole('button', { name: /Clicked/ });

    // The server rendered "(hydrating…)"; React swapping it for "(hydrated ✓)" is the proof.
    await expect(page.getByText('(hydrated ✓)')).toBeVisible();
    await counter.click();
    await counter.click();
    await expect(counter).toHaveText(/Clicked 2 times/);
  });
});

test.describe('soft navigation', () => {
  test('a link click swaps the page without reloading the document', async ({ page }) => {
    await page.goto('/');
    const before = await markDocument(page);

    await page.getByRole('link', { name: 'Users', exact: true }).click();

    await expect(page).toHaveURL('/users');
    await expect(page.getByText('Ada Lovelace')).toBeVisible();
    expect(await documentId(page)).toBe(before);
  });

  test('client island state outside the changed subtree survives a navigation', async ({ page }) => {
    await page.goto('/');
    const counter = page.getByRole('button', { name: /Clicked/ });
    await counter.click();
    await expect(counter).toHaveText(/Clicked 1 time/);

    await page.getByRole('link', { name: 'Docs' }).click();
    await expect(page).toHaveURL('/docs/getting-started');
    await page.goBack();

    await expect(page).toHaveURL('/');
    // The home page is re-rendered from a fresh payload, so the counter resets — what must *not*
    // happen is a full document load, which is what the marker would catch.
    await expect(page.getByText('(hydrated ✓)')).toBeVisible();
  });

  test('a data-native link opts out and does a real browser load', async ({ page }) => {
    await page.goto('/');
    const before = await markDocument(page);

    await page.getByRole('link', { name: 'Reload home' }).click();
    await page.waitForLoadState('load');

    expect(await documentId(page)).not.toBe(before);
  });

  test('an off-site link is left to the browser', async ({ page }) => {
    await page.goto('/');
    const link = page.getByRole('link', { name: 'Hono' }).first();
    await expect(link).toHaveAttribute('href', /^https:\/\/hono\.dev/);
  });
});

test.describe('prefetch', () => {
  test('hovering a data-prefetch link warms the payload, and the navigation reuses it', async ({ page }) => {
    await page.goto('/');

    const flightRequests = [];
    page.on('request', (request) => {
      if (request.headers()['accept']?.includes('text/x-component')) flightRequests.push(request.url());
    });

    await page.getByRole('link', { name: 'Users', exact: true }).hover();
    await expect.poll(() => flightRequests.length, { message: 'hover should warm one flight payload' }).toBe(1);
    expect(flightRequests[0]).toContain('/users');

    await page.getByRole('link', { name: 'Users', exact: true }).click();
    await expect(page.getByText('Ada Lovelace')).toBeVisible();

    // The warmed payload is consumed rather than re-fetched, so the count must not have moved.
    expect(flightRequests).toHaveLength(1);
  });
});

test.describe('useNavigation', () => {
  test('router.push navigates and the hook reports the new location', async ({ page }) => {
    await page.goto('/profile/1?tab=activity');
    await expect(page.locator('[data-nav="pathname"]')).toHaveText('/profile/1');
    await expect(page.locator('[data-nav="param-id"]')).toHaveText('1');
    await expect(page.locator('[data-nav="query-tab"]')).toHaveText('activity');

    const before = await markDocument(page);
    await page.getByRole('button', { name: "push('/users')" }).click();

    await expect(page).toHaveURL('/users');
    expect(await documentId(page)).toBe(before);
  });

  test('router.refresh re-runs the server components in place', async ({ page }) => {
    await page.goto('/profile/1');
    const before = await markDocument(page);

    await page.getByRole('button', { name: 'refresh()' }).click();

    await expect(page.locator('[data-nav="pathname"]')).toHaveText('/profile/1');
    expect(await documentId(page)).toBe(before);
  });
});

test.describe('server actions', () => {
  test('a client-initiated action mutates and re-renders the server component', async ({ page }) => {
    await page.goto('/users');
    const email = `grace-${Date.now()}@example.com`;

    await page.getByPlaceholder('Grace Hopper').fill('Grace Hopper');
    await page.getByPlaceholder('grace@example.com').fill(email);
    await page.getByRole('button', { name: 'Add user' }).click();

    // The list is a server component: it can only show the new row if the action's fresh payload
    // was applied to the live tree.
    await expect(page.getByText(email)).toBeVisible();
  });

  test('a rejected action surfaces its message instead of tearing down the page', async ({ page }) => {
    await page.goto('/users');

    await page.getByPlaceholder('Grace Hopper').fill('');
    await page.getByPlaceholder('grace@example.com').fill('not-an-email');
    await page.getByRole('button', { name: 'Add user' }).click();

    await expect(page.locator('.notice.error')).toBeVisible();
    await expect(page.getByText('Ada Lovelace')).toBeVisible();
  });
});

test.describe('boundaries', () => {
  test('a failing section renders its fallback while the rest of the page stays up', async ({ page }) => {
    await page.goto('/boundary?fail=1');
    // SSR streams the *loading* fallback; the error fallback is what the boundary swaps in once the
    // payload carrying the failure is applied — so this asserts the client half of the mechanism.
    await expect(page.locator('[data-section="error"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Boundary' })).toBeVisible();
    await expect(page.locator('[data-rshono-fatal]')).toHaveCount(0, { timeout: 1000 });
  });

  test('the happy path resolves the suspended section', async ({ page }) => {
    await page.goto('/boundary');
    await expect(page.locator('[data-section="ok"]')).toBeVisible();
  });
});

test.describe('scroll restoration', () => {
  test('back restores the previous scroll position; a new navigation starts at the top', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 400 });
    await page.goto('/users');

    await page.evaluate(() => window.scrollTo(0, 300));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

    await page.getByRole('link', { name: 'Docs' }).click();
    await expect(page).toHaveURL('/docs/getting-started');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    await page.goBack();
    await expect(page).toHaveURL('/users');
    await expect.poll(() => page.evaluate(() => window.scrollY), { message: 'back should land where the user left off' }).toBeGreaterThan(100);
  });
});

test.describe('no blank screens', () => {
  test('a broken bootstrap payload paints the fatal overlay instead of a dead page', async ({ page }) => {
    // Corrupt the inlined flight payload so the client runtime cannot start. Without the overlay
    // this is a silent unhandled rejection and the page just sits there, half-rendered.
    await page.route('**/crash', async (route) => {
      const response = await route.fetch();
      const html = await response.text();
      // `response.text()` has already decoded the body, so the original encoding and length headers
      // would now be describing something that no longer exists — drop them rather than blank them.
      const headers = { ...response.headers() };
      delete headers['content-encoding'];
      delete headers['content-length'];
      await route.fulfill({
        status: response.status(),
        headers,
        contentType: 'text/html; charset=utf-8',
        body: html.replaceAll('self.__FLIGHT_DATA||=[]).push("', 'self.__FLIGHT_DATA||=[]).push("!corrupted!'),
      });
    });

    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto('/crash');

    const overlay = page.locator('[data-rshono-fatal]');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('Something went wrong');
    await expect(overlay.getByRole('button', { name: 'Reload page' })).toBeVisible();
    // Production must not put the stack on screen — that is the dev-only branch.
    await expect(overlay).not.toContainText('Component stack:');
    expect(consoleErrors.join('\n')).toContain('the client runtime failed to start');
  });
});
