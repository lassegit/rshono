/** APP_SPEC.md: no React on this path at all — router and response construction only. */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true, route: 'health' });
}
