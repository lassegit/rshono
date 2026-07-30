export function readSecretFromHelper() {
  const { DATABASE_URL } = process.env;
  return DATABASE_URL ?? process.env.DATABASE_URL ?? '(no secret)';
}
