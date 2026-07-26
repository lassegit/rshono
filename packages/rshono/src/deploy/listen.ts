const CONFIG = __RSHONO_CONFIG__;

/** What to bind, for the targets where rshono owns the process rather than being handed a request. */
export interface ListenAddress {
  port: number;
  hostname: string;
}

/**
 * Resolves the address to listen on: an explicit override (the dev server, which picks the port for
 * its worker) beats the environment, which beats `rshono.config.ts`, which beats the built-in default.
 *
 * `PORT` and `HOST` stay env-overridable because that is the deployment convention everywhere this
 * runs — a container, a process manager, a PaaS. `??` rather than `||` so an explicit `PORT=0`, which
 * means "any free port", is honoured.
 */
export function listenAddress(overrides?: { port?: number; hostname?: string }): ListenAddress {
  const envPort = process.env.PORT !== undefined ? Number(process.env.PORT) : undefined;
  return {
    port: overrides?.port ?? envPort ?? CONFIG.port ?? 3000,
    hostname: overrides?.hostname ?? process.env.HOST ?? CONFIG.host ?? '0.0.0.0',
  };
}

/** What to print once listening — `localhost` rather than the wildcard the socket is actually bound to. */
export function readyMessage({ port, hostname }: ListenAddress): string {
  return `  ➜ rshono serving on http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${port}`;
}
