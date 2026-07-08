import { program } from "commander";
import { devCommand } from "./dev.js";
import { buildCommand } from "./build.js";
import { startCommand } from "./start.js";

function parsePort(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`✗ Invalid port: "${value}" (expected 0–65535)`);
    process.exit(1);
  }
  return port;
}

program
  .name("rs-hono")
  .description("Ultra-minimalist SSR framework — Hono + Rspack")
  .version("0.1.0");

program
  .command("dev")
  .description("Start the development server")
  .option("-p, --port <number>", "Port to listen on (default: config dev.port or 3000)")
  .action(async (options) => {
    await devCommand(parsePort(options.port));
  });

program
  .command("build")
  .description("Build for production")
  .action(async () => {
    await buildCommand();
  });

program
  .command("start")
  .description("Start the production server")
  .option("-p, --port <number>", "Port to listen on (default: config dev.port or 3000)")
  .action(async (options) => {
    await startCommand(parsePort(options.port));
  });

program.parse();
