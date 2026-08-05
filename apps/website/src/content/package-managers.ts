/**
 * One command in npm form, rendered as all four.
 *
 * Every command this site quotes is written once, the way npm spells it — as an ordinary fenced block in
 * `content/docs/*.md`, or as a string in a handwritten page. This module turns that one line into four
 * at **build time**, so the markup carries every variant and the reader only picks between them. There
 * is no translation table in the client bundle and nothing left to translate at runtime; the
 * [island](../components/package-manager-choice.tsx) does nothing but remember which one you chose.
 *
 * The list is exactly `PACKAGE_MANAGERS` from `@rshono/create` — the four the scaffolder can write a
 * project for. That is not a coincidence: which runner you use is also how it learns which one you use,
 * because every one of them sets `npm_config_user_agent` for the process it spawns. `pnpx
 * @rshono/create` scaffolds a pnpm project without being asked.
 */

/** How one package manager spells the commands this site quotes. */
export interface PackageManager {
  /** Matches the `--pm` flag, and the `data-pm-panel` value the island switches on. */
  id: string;
  label: string;
  /** Runs a package without installing it: `npx` and its three counterparts. */
  exec: string;
  /** Adds dependencies to the project. */
  add: string;
  /** The dev-dependency flag, spelled out because bun is the one that does not take `-D`. */
  dev: string;
}

/**
 * npm first: it is the runner everyone has, so it is the no-JavaScript default and the form commands are
 * authored in.
 *
 * `pnpx` is pnpm's own alias for `pnpm dlx` and is what the docs list first, so it is what a pnpm user
 * would type. (`pnx` is the newer, shorter alias — pnpm 10.16 and up only, which is why it is not this
 * one.) `yarn dlx` needs Yarn 2 or newer; Yarn Classic has no equivalent, so its users want `npx` plus
 * `--pm yarn`.
 */
export const PACKAGE_MANAGERS: readonly PackageManager[] = [
  { id: 'npm', label: 'npm', exec: 'npx', add: 'npm i', dev: '-D' },
  { id: 'pnpm', label: 'pnpm', exec: 'pnpx', add: 'pnpm add', dev: '-D' },
  { id: 'yarn', label: 'yarn', exec: 'yarn dlx', add: 'yarn add', dev: '-D' },
  { id: 'bun', label: 'bun', exec: 'bunx', add: 'bun add', dev: '--dev' },
];

/**
 * The two command shapes worth translating, and nothing else.
 *
 * Narrow on purpose: these two have an exact counterpart in all four package managers, so a translation
 * is a substitution rather than a guess. Anything else — `rshono dev`, `npm view`, a `pnpm --filter`
 * command that only makes sense in this repository — fails to match and is left alone.
 */
const EXEC = /^npx\s+(?=\S)/;
const ADD = /^npm\s+(?:i|install|add)\s+(?=\S)/;
const DEV_FLAG = /(^|\s)(?:-D|--save-dev)(?=\s|$)/g;

/** One command line in `pm`'s spelling, or `undefined` if it is not one of the two shapes above. */
function translateLine(line: string, pm: PackageManager): string | undefined {
  if (EXEC.test(line)) return line.replace(EXEC, `${pm.exec} `);
  if (ADD.test(line)) return line.replace(ADD, `${pm.add} `).replace(DEV_FLAG, `$1${pm.dev}`);
  return undefined;
}

/** One package manager's version of the whole snippet. */
export interface CommandVariant {
  pm: PackageManager;
  command: string;
}

/**
 * Every variant of a snippet, or `undefined` if any line in it is not translatable.
 *
 * All or nothing, because half a translated block is worse than none: a reader who picked pnpm would be
 * handed a mix and no way to tell which half was which.
 */
export function commandVariants(source: string): CommandVariant[] | undefined {
  const lines = source.trim().split('\n');
  const variants: CommandVariant[] = [];

  for (const pm of PACKAGE_MANAGERS) {
    const translated: string[] = [];
    for (const line of lines) {
      // A blank line inside a block is a separator, not a command — it survives untranslated.
      const next = line.trim() === '' ? '' : translateLine(line, pm);
      if (next === undefined) return undefined;
      translated.push(next);
    }
    variants.push({ pm, command: translated.join('\n') });
  }

  return variants;
}

/** The builder writes raw HTML, so everything interpolated into it goes through here. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export type CommandTabsOptions = {
  /**
   * Unique within the page: it becomes the radio group's `name`, so two groups sharing one would
   * switch each other rather than themselves.
   */
  id: string;
  /** The snippet, in npm form. */
  command: string;
} & (
  | { variant: 'pill'; highlight?: never }
  /** A code block wants the same Shiki treatment as the prose around it, hence the highlighter. */
  | { variant: 'block'; highlight: (code: string, lang: string) => string }
);

/**
 * The selector, as finished HTML — `undefined` when the snippet is not one this module can translate.
 *
 * A string rather than a component because both callers need it that way: the markdown pipeline replaces
 * a fenced block with it, and the handwritten pages inject it next to code samples they already inject.
 * One builder means one set of hooks for the island to find, rather than two spellings of the same markup
 * drifting apart.
 *
 * **Radios, not buttons.** Native radios come with the keyboard behaviour of a tab strip already
 * attached, and `styles.css` switches the panels on `:checked` — so the control works with no JavaScript
 * at all, which is the least a framework that advertises working forms without it can do. The island only
 * adds what CSS cannot: remembering the choice, and applying it to every other selector on the page.
 */
export function renderCommandTabs(options: CommandTabsOptions): string | undefined {
  const variants = commandVariants(options.command);
  if (!variants) return undefined;

  const tabs = variants.map(({ pm }, index) => {
    const inputId = `${options.id}-${pm.id}`;
    const checked = index === 0 ? ' checked' : '';
    return (
      `<input class="pm-input" type="radio" name="${options.id}" id="${inputId}" value="${pm.id}" data-pm-radio${checked}>` +
      `<label class="pm-tab" for="${inputId}">${escapeHtml(pm.label)}</label>`
    );
  });

  const panels = variants.map(({ pm, command }) => {
    const body = options.variant === 'block' ? options.highlight(command, 'bash') : `<code class="pm-pill">${escapeHtml(command)}</code>`;
    return `<div class="pm-panel" data-pm-panel="${pm.id}">${body}</div>`;
  });

  return (
    `<div class="pm-tabs" data-pm-tabs>` +
    `<fieldset class="pm-strip"><legend class="pm-legend">Package manager</legend>${tabs.join('')}</fieldset>` +
    `${panels.join('')}</div>`
  );
}

/**
 * The variants of a one-line command as `data-*` attributes, for a place with no room for a tab strip.
 *
 * The element keeps the npm form as its own text — the island swaps that text for the remembered choice,
 * and a reader without JavaScript is left with the command that needs no runner installed.
 */
export function inlineCommandAttributes(command: string): Record<string, string> {
  const attributes: Record<string, string> = { 'data-pm-command': '' };
  for (const { pm, command: translated } of commandVariants(command) ?? []) attributes[`data-pm-${pm.id}`] = translated;
  return attributes;
}
