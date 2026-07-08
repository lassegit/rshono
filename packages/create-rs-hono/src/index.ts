#!/usr/bin/env node
/**
 * create-rs-hono — project scaffolder.
 *
 * Copies a template into the target directory and personalises its
 * package.json. Zero runtime dependencies.
 */
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const templatesDir = fileURLToPath(new URL("../templates", import.meta.url));

const HELP = `create-rs-hono — scaffold a new rs-hono project

Usage: create-rs-hono [project-directory] [options]

Options:
  -t, --template <name>  Template to use (default: "basic")
  -h, --help             Show this help
`;

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** npm package names: lowercase, no spaces, limited punctuation. */
function toPackageName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-._~]/g, "-")
    .replace(/^[-._]+/, "");
  return cleaned || "my-app";
}

let args;
try {
  args = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      template: { type: "string", short: "t", default: "basic" },
      help: { type: "boolean", short: "h" },
    },
  });
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

if (args.values.help) {
  console.log(HELP);
  process.exit(0);
}

const dir = args.positionals[0] ?? "my-app";
const targetDir = resolve(process.cwd(), dir);

// Validate against the shipped templates — also stops path traversal
// via `--template ../..`.
const template = args.values.template!;
const available = readdirSync(templatesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
if (!available.includes(template)) {
  fail(`Unknown template "${template}". Available: ${available.join(", ")}`);
}

if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
  fail(`Directory "${dir}" already exists and is not empty.`);
}

console.log(`\n🔧 Creating rs-hono project in ${targetDir}\n`);

cpSync(join(templatesDir, template), targetDir, { recursive: true });

// npm strips dotfiles when publishing — the template ships "gitignore"
// and the dot is restored here.
const gitignorePath = join(targetDir, "gitignore");
if (existsSync(gitignorePath)) {
  renameSync(gitignorePath, join(targetDir, ".gitignore"));
}

// Personalise package.json
const pkgPath = join(targetDir, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.name = toPackageName(basename(targetDir));
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// Match the "Next steps" to the package manager that invoked us.
const pm = process.env.npm_config_user_agent?.split("/")[0] ?? "npm";
const run = pm === "npm" ? "npm run" : pm;

console.log("  ✓ Project scaffolded");
console.log("\n  Next steps:\n");
if (targetDir !== process.cwd()) {
  console.log(`    cd ${/\s/.test(dir) ? JSON.stringify(dir) : dir}`);
}
console.log(`    ${pm} install`);
console.log(`    ${run} dev\n`);
