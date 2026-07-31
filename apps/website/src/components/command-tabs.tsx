import { inlineCommandAttributes, renderCommandTabs } from '../content/package-managers';

/**
 * The command this site quotes, in the form every other one is derived from.
 *
 * `@latest` because `npx` will happily run a version it cached weeks ago otherwise, and the scaffolder
 * carries the framework's pins — an old one writes an app pinned to a release that has moved on.
 */
export const SCAFFOLD_COMMAND = 'npx @rshono/create@latest my-app';

/**
 * A command with a package manager selector above it, for a handwritten page.
 *
 * The markup comes from [the same builder the docs use](../content/package-managers.ts), so a fenced
 * block in `content/docs/*.md` and a snippet on the landing page are the same control — one set of hooks,
 * one stylesheet, one island. `pill` is the compact presentation: a bordered command rather than a code
 * block, for a page that is not prose.
 *
 * `id` has to be unique within the page; it names the radio group. An untranslatable command falls back
 * to itself rather than failing the build, because the fallback is exactly what the page said before.
 */
export function CommandTabs({ id, command }: { id: string; command: string }) {
  const html = renderCommandTabs({ id, command, variant: 'pill' });
  if (!html) return <code className="pm-pill">{command}</code>;

  // Built above from constants in this repository, not from user input — as with the code samples the
  // landing page injects.
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * A one-line command with no room for a tab strip — the header chip.
 *
 * Carries every variant as a `data-*` attribute and its own text as the npm form, so the island can swap
 * the text to whatever the reader last chose and a reader with no JavaScript keeps a command that works.
 */
export function InlineCommand({ command, className }: { command: string; className?: string }) {
  return (
    <code className={className} {...inlineCommandAttributes(command)}>
      {command}
    </code>
  );
}
