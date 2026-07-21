export function publicEnv(isDev: boolean): Record<string, string> {
  const entries = Object.entries(process.env).filter((entry): entry is [string, string] => entry[0].startsWith('PUBLIC_') && entry[1] !== undefined);
  return { NODE_ENV: isDev ? 'development' : 'production', ...Object.fromEntries(entries) };
}
