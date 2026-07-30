/**
 * Markdown → HTML, a table of contents, and the frontmatter, in one pass.
 *
 * Everything here runs at **build time**: the pages that call it are `render: 'static'`, so the parse
 * and the highlight happen once during `rshono build` and what reaches a browser is finished HTML.
 * That is the whole reason a docs page ships no JavaScript of its own — there is no highlighter in the
 * client bundle because there is no highlighting left to do.
 */

import langCss from '@shikijs/langs/css';
import langDiff from '@shikijs/langs/diff';
import langHtml from '@shikijs/langs/html';
import langJavaScript from '@shikijs/langs/javascript';
import langJson from '@shikijs/langs/json';
import langJsx from '@shikijs/langs/jsx';
import langMarkdown from '@shikijs/langs/markdown';
import langBash from '@shikijs/langs/shellscript';
import langTsx from '@shikijs/langs/tsx';
import langTypeScript from '@shikijs/langs/typescript';
import themeDark from '@shikijs/themes/github-dark';
import themeLight from '@shikijs/themes/github-light';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/** One heading in the on-page table of contents. Only `h2` and `h3` are collected. */
export interface TocEntry {
  /** The anchor id `markdown-it-anchor` gave the heading — the `href` is `#` + this. */
  id: string;
  /** The heading's text, with inline markdown stripped back to something a link can hold. */
  text: string;
  /** `2` or `3`; the renderer indents the deeper level rather than nesting a second list. */
  depth: 2 | 3;
}

/** A rendered documentation page. */
export interface RenderedDoc {
  title: string;
  description: string;
  /** Finished HTML, highlighted and anchored. Injected with `dangerouslySetInnerHTML`. */
  html: string;
  toc: TocEntry[];
}

/** Frontmatter every content file is expected to carry. */
interface DocFrontmatter {
  title?: string;
  description?: string;
}

/**
 * The languages the docs actually use, imported one by one rather than through `shiki/bundle/full`.
 *
 * The full bundle carries every grammar Shiki ships — several megabytes of them — into the server
 * bundle for the handful used here. Naming them costs an import line each and keeps the build small.
 */
const LANGS = [langTypeScript, langTsx, langJavaScript, langJsx, langJson, langBash, langCss, langHtml, langMarkdown, langDiff];

/**
 * Grammars are matched by name *and* alias, so `\`\`\`ts` and `\`\`\`typescript` both resolve. Anything
 * not in here is rendered as plain text rather than failing the build over a fenced block.
 */
const KNOWN_LANGS = new Set(LANGS.flatMap(([grammar]) => [grammar.name, ...(grammar.aliases ?? [])]));

/**
 * Built once and reused. Creating a highlighter compiles every grammar, which is far too expensive to
 * repeat per page — and the docs render one page after another during the prerender.
 *
 * The **JavaScript** regex engine, not Oniguruma: the alternative loads a WASM binary, which is one
 * more thing that has to resolve inside a bundled server on every deploy target. The JS engine is pure
 * JavaScript, so it bundles like any other module.
 */
let highlighterPromise: Promise<HighlighterCore> | undefined;

function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [themeLight, themeDark],
    langs: LANGS,
    engine: createJavaScriptRegexEngine(),
  });
  return highlighterPromise;
}

/**
 * `#`-anchored headings, with the text kept clickable.
 *
 * The heading renders its own text plus a trailing link rather than wrapping the text in one, so a
 * heading containing a `<code>` span doesn't become a link with code inside it.
 */
const anchorOptions: anchor.AnchorOptions = {
  level: [2, 3],
  /**
   * Plain `[a-z0-9-]` ids.
   *
   * The default slugify only `encodeURIComponent`s the lowercased text, which turns *Vary: Accept*
   * into `vary%3A-accept` and *CSP (opt-in)* into `csp-(opt-in)`. Both work, but neither is something
   * you would type into a cross-page link by hand — and this file's whole job is producing anchors
   * other pages link to.
   */
  slugify: (heading) =>
    heading
      .trim()
      .toLowerCase()
      .replace(/[^\w\- ]+/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, ''),
  permalink: anchor.permalink.linkInsideHeader({
    symbol: '<span aria-hidden="true">#</span>',
    placement: 'after',
    class: 'heading-anchor',
    ariaHidden: false,
  }),
};

/** Inline markdown a TOC label should not carry: code ticks, emphasis, and link syntax. */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .trim();
}

let mdPromise: Promise<MarkdownIt> | undefined;

async function getMarkdownIt(): Promise<MarkdownIt> {
  mdPromise ??= (async () => {
    const highlighter = await getHighlighter();

    const md = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: false,
      /**
       * Shiki emits the whole `<pre class="shiki">…</pre>`, so this returns finished HTML and
       * markdown-it wraps it in nothing further.
       *
       * `defaultColor: false` is what makes one build serve both themes: instead of baking one
       * theme's colours in, every token carries `--shiki-light` and `--shiki-dark` custom properties
       * and `styles.css` picks between them. No flash, no second stylesheet, no client JS.
       */
      highlight: (code, lang) =>
        highlighter.codeToHtml(code, {
          lang: KNOWN_LANGS.has(lang) ? lang : 'text',
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false,
        }),
    });

    md.use(anchor, anchorOptions);
    return md;
  })();

  return mdPromise;
}

/** Collect the `h2`/`h3` headings out of an already-parsed token stream. */
function tableOfContents(tokens: ReturnType<MarkdownIt['parse']>): TocEntry[] {
  const toc: TocEntry[] = [];

  for (const [index, token] of tokens.entries()) {
    if (token.type !== 'heading_open' || (token.tag !== 'h2' && token.tag !== 'h3')) continue;
    const id = token.attrGet('id');
    const inline = tokens[index + 1];
    if (!id || !inline) continue;
    toc.push({ id, text: stripInlineMarkdown(inline.content), depth: token.tag === 'h2' ? 2 : 3 });
  }

  return toc;
}

/**
 * Render one markdown source into everything a docs page needs.
 *
 * Parsed once and rendered from those same tokens, so the ids in the table of contents are literally
 * the ids in the HTML — deriving them separately is how a TOC ends up linking to anchors that moved.
 */
export async function renderDoc(source: string): Promise<RenderedDoc> {
  const { data, content } = matter(source);
  const frontmatter = data as DocFrontmatter;
  const md = await getMarkdownIt();

  const env = {};
  const tokens = md.parse(content, env);

  return {
    title: frontmatter.title ?? 'Untitled',
    description: frontmatter.description ?? '',
    html: md.renderer.render(tokens, md.options, env),
    toc: tableOfContents(tokens),
  };
}

/**
 * A single code sample, highlighted the same way a fenced block in the docs is.
 *
 * For handwritten pages like the landing page, where the sample is JSX rather than markdown but should
 * not look like it came from somewhere else.
 */
export async function highlightCode(code: string, lang: string): Promise<string> {
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(code.trim(), {
    lang: KNOWN_LANGS.has(lang) ? lang : 'text',
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
  });
}

/** The frontmatter alone, without paying for a render — used to build nav and index listings. */
export function readFrontmatter(source: string): { title: string; description: string } {
  const frontmatter = matter(source).data as DocFrontmatter;
  return { title: frontmatter.title ?? 'Untitled', description: frontmatter.description ?? '' };
}
