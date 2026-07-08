#!/usr/bin/env node
import { program } from "commander";
import { copy } from "fs-extra";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

program
  .name("create-rs-hono")
  .description("Scaffold a new rs-hono project")
  .argument("[project-directory]", "Directory to create the project in")
  .option("-t, --template <name>", "Template to use", "basic")
  .action(async (dir = "my-app", options) => {
    const targetDir = resolve(process.cwd(), dir);
    const templateDir = join(__dirname, "..", "templates", options.template);

    console.log(`\n🔧 Creating rs-hono project in ${targetDir}\n`);

    // Copy template
    await copy(templateDir, targetDir);

    // Update package.json name
    const pkgPath = join(targetDir, "package.json");
    const pkg = await import(pkgPath, { with: { type: "json" } });
    pkg.name = dir;

    console.log("  ✓ Project scaffolded");
    console.log(`\n  Next steps:\n`);
    console.log(`    cd ${dir}`);
    console.log(`    npm install`);
    console.log(`    npm run dev\n`);
  });

program.parse();
