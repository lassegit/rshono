/**
 * One optional thing a scaffolded app can have. Every difference between two scaffolds is expressed
 * as one of these fields, which is what keeps the generator itself free of `if (tailwind)` branches:
 * it selects features, then merges whatever they declare.
 *
 * Adding an option to the CLI is therefore three edits and no new machinery — a `Feature` here, a
 * template directory it names, and (if it deserves a question of its own) an entry in the prompt flow.
 */
export interface Feature {
  /** Stable identifier, used in error messages and as the conventional name of its template directory. */
  id: string;
  /**
   * Template directories copied over the base, relative to `templates/`, applied in the order listed.
   * A file that already exists is replaced — that is how the Tailwind overlay ships its own
   * `styles.css` rather than trying to patch the base one.
   */
  overlays?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  /** Merged into `scripts`; a later feature wins a collision, so keep the names distinct. */
  scripts?: Record<string, string>;
  /** Appended to `.gitignore` under a heading naming the feature. */
  gitignore?: string[];
  /**
   * Install scripts this feature's dependencies bring with them, and whether the app should run them —
   * pnpm's `allowBuilds`, which a pnpm scaffold cannot install without. `false` says the script is not
   * needed, so say why in a comment beside the entry.
   */
  allowBuilds?: Record<string, boolean>;
  /** Extra lines for the closing "next steps" block, e.g. a platform's own login step. */
  notes?: string[];
}
