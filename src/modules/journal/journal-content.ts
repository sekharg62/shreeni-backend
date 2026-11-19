import sanitizeHtml from 'sanitize-html';

/*
 * The Journal editor (Tiptap, in the admin) saves a JSON document. Everything the storefront shows is
 * derived from it here, with plain functions (no database) so it's easy to test:
 *
 *   analyzeContent(doc)  → table of contents, word count, reading time, links (for the link report)
 *   renderContent(doc)   → safe HTML for the article page
 *
 * Safety: only known node/mark types are rendered, every text is escaped, every attribute is
 * whitelisted, and the result goes through sanitize-html as a second layer.
 */

export type JNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

/** Internal link targets the editor can point at (stored by id, so later slug changes never break them). */
export const INTERNAL_TYPES = ['PRODUCT', 'CATEGORY', 'POST', 'PAGE'] as const;
export type InternalType = (typeof INTERNAL_TYPES)[number];
const REL_TOKENS = ['nofollow', 'sponsored', 'ugc'] as const;

export type Heading = { id: string; text: string; level: 2 | 3 };

export type ExtractedLink = {
  kind: 'INTERNAL' | 'EXTERNAL';
  targetType: InternalType | 'URL';
  targetId: string | null;
  href: string;
  anchorText: string;
  rel: string | null;
  newTab: boolean;
};

export type ContentAnalysis = {
  headings: Heading[];
  wordCount: number;
  readingMinutes: number;
  links: ExtractedLink[];
  images: string[];
  /** First paragraph's text (fallback meta description). */
  firstParagraph: string;
};

/** Resolves an internal link target to its current URL, or null if it's gone / not public. */
export type ResolveLink = (type: InternalType, id: string | null, href: string) => string | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORDS_PER_MINUTE = 200;

export function isDoc(value: unknown): value is JNode {
  return !!value && typeof value === 'object' && (value as JNode).type === 'doc';
}

const textOf = (n: JNode): string =>
  n.type === 'text' ? (n.text ?? '') : n.type === 'hardBreak' ? ' ' : (n.content ?? []).map(textOf).join('');

/** "Caring for silk: the basics" → "caring-for-silk-the-basics" (stable, for heading anchors). */
export function anchorId(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'section'
  );
}

/** Heading levels shown: the post title is the only H1, so H1 in the body becomes H2; H4+ become H3. */
const headingLevel = (n: JNode): 2 | 3 => (Number(n.attrs?.level) >= 3 ? 3 : 2);

/** Walks headings in document order, giving each a unique anchor id (same order on save and render). */
function headingIds(doc: JNode): Map<JNode, string> {
  const ids = new Map<JNode, string>();
  const used = new Map<string, number>();
  const walk = (n: JNode) => {
    if (n.type === 'heading') {
      const base = anchorId(textOf(n));
      const count = used.get(base) ?? 0;
      used.set(base, count + 1);
      ids.set(n, count ? `${base}-${count + 1}` : base);
    }
    n.content?.forEach(walk);
  };
  walk(doc);
  return ids;
}

/** The link mark's attributes, normalised. */
function linkInfo(attrs: Record<string, unknown> = {}) {
  const href = typeof attrs.href === 'string' ? attrs.href.trim() : '';
  const type = typeof attrs.internalType === 'string' ? attrs.internalType.toUpperCase() : '';
  const internalType = (INTERNAL_TYPES as readonly string[]).includes(type) ? (type as InternalType) : null;
  const rawId = typeof attrs.internalId === 'string' ? attrs.internalId : '';
  const internalId = UUID.test(rawId) ? rawId.toLowerCase() : null;
  const rel = (typeof attrs.rel === 'string' ? attrs.rel : '')
    .toLowerCase()
    .split(/\s+/)
    .filter((t): t is (typeof REL_TOKENS)[number] => (REL_TOKENS as readonly string[]).includes(t));
  const newTab = attrs.target === '_blank';
  return { href, internalType, internalId, rel: [...new Set(rel)], newTab };
}

/** External URLs the article may link to. */
export function isSafeExternal(href: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(href) || /^mailto:[^\s]+$/i.test(href) || /^tel:\+?[\d\s-]+$/i.test(href);
}

/** Same-site paths (for PAGE links): "/shipping", "/sarees/tant". Not "//evil.com". */
const isSitePath = (href: string) => href.startsWith('/') && !href.startsWith('//') && !/\s/.test(href);

export function analyzeContent(doc: JNode): ContentAnalysis {
  const ids = headingIds(doc);
  const headings: Heading[] = [];
  const links: ExtractedLink[] = [];
  const images: string[] = [];
  let words = 0;
  let firstParagraph = '';

  const walk = (n: JNode) => {
    if (n.type === 'heading') headings.push({ id: ids.get(n)!, text: textOf(n).trim(), level: headingLevel(n) });
    if (n.type === 'paragraph' && !firstParagraph) firstParagraph = textOf(n).trim();
    if (n.type === 'image' && typeof n.attrs?.src === 'string') images.push(n.attrs.src);
    if (n.type === 'text' && n.text) {
      words += n.text.split(/\s+/).filter(Boolean).length;
      const link = n.marks?.find((m) => m.type === 'link');
      if (link) {
        const l = linkInfo(link.attrs);
        const anchorText = n.text.slice(0, 300);
        if (l.internalType) {
          links.push({ kind: 'INTERNAL', targetType: l.internalType, targetId: l.internalId, href: l.href, anchorText, rel: null, newTab: false });
        } else if (l.href) {
          links.push({ kind: 'EXTERNAL', targetType: 'URL', targetId: null, href: l.href, anchorText, rel: l.rel.join(' ') || null, newTab: l.newTab });
        }
      }
    }
    n.content?.forEach(walk);
  };
  walk(doc);

  // A link split over several text runs (e.g. partly bold) is one link: merge neighbours with the same target.
  const merged: ExtractedLink[] = [];
  for (const l of links) {
    const prev = merged.at(-1);
    if (prev && prev.href === l.href && prev.targetId === l.targetId && prev.kind === l.kind) prev.anchorText = (prev.anchorText + l.anchorText).slice(0, 300);
    else merged.push({ ...l });
  }

  return {
    headings,
    wordCount: words,
    readingMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
    links: merged,
    images,
    firstParagraph,
  };
}

/** The internal targets a document links to, by type (to look up their current URLs in one go). */
export function internalTargets(doc: JNode): Record<'PRODUCT' | 'CATEGORY' | 'POST', string[]> {
  const out = { PRODUCT: new Set<string>(), CATEGORY: new Set<string>(), POST: new Set<string>() };
  for (const l of analyzeContent(doc).links) {
    if (l.kind === 'INTERNAL' && l.targetId && l.targetType !== 'PAGE') out[l.targetType as 'PRODUCT'].add(l.targetId);
  }
  return { PRODUCT: [...out.PRODUCT], CATEGORY: [...out.CATEGORY], POST: [...out.POST] };
}

/* ───────────── HTML rendering ───────────── */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const SIMPLE_MARKS: Record<string, string> = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code' };

function renderText(n: JNode, resolve: ResolveLink): string {
  let html = esc(n.text ?? '');
  const marks = n.marks ?? [];
  for (const m of marks) {
    const tag = SIMPLE_MARKS[m.type];
    if (tag) html = `<${tag}>${html}</${tag}>`;
  }
  const link = marks.find((m) => m.type === 'link');
  if (!link) return html;

  const l = linkInfo(link.attrs);
  if (l.internalType) {
    const href = resolve(l.internalType, l.internalId, l.href);
    // Target removed or not public: keep the words, drop the link (no dead links for readers or Google).
    return href && isSitePath(href) ? `<a href="${esc(href)}">${html}</a>` : html;
  }
  if (!isSafeExternal(l.href)) return html;
  const rel = [...l.rel, ...(l.newTab ? ['noopener', 'noreferrer'] : [])];
  return `<a href="${esc(l.href)}"${l.newTab ? ' target="_blank"' : ''}${rel.length ? ` rel="${rel.join(' ')}"` : ''}>${html}</a>`;
}

/** Renders the document as article HTML. Unknown node types are skipped (their text kept where sensible). */
export function renderContent(doc: JNode, resolve: ResolveLink): string {
  const ids = headingIds(doc);
  const kids = (n: JNode) => (n.content ?? []).map(node).join('');

  function node(n: JNode): string {
    switch (n.type) {
      case 'doc':
        return kids(n);
      case 'text':
        return renderText(n, resolve);
      case 'paragraph':
        return n.content?.length ? `<p>${kids(n)}</p>` : '';
      case 'heading': {
        const level = headingLevel(n);
        return `<h${level} id="${esc(ids.get(n)!)}">${kids(n)}</h${level}>`;
      }
      case 'bulletList':
        return `<ul>${kids(n)}</ul>`;
      case 'orderedList': {
        const start = Number(n.attrs?.start);
        return `<ol${Number.isInteger(start) && start > 1 ? ` start="${start}"` : ''}>${kids(n)}</ol>`;
      }
      case 'listItem':
        return `<li>${kids(n)}</li>`;
      case 'blockquote':
        return `<blockquote>${kids(n)}</blockquote>`;
      case 'horizontalRule':
        return '<hr>';
      case 'hardBreak':
        return '<br>';
      case 'codeBlock':
        return `<pre><code>${esc(textOf(n))}</code></pre>`;
      case 'image': {
        const src = typeof n.attrs?.src === 'string' ? n.attrs.src : '';
        if (!/^https:\/\/[^\s"]+$/i.test(src)) return '';
        const alt = typeof n.attrs?.alt === 'string' ? n.attrs.alt : '';
        const caption = typeof n.attrs?.title === 'string' ? n.attrs.title.trim() : '';
        const w = Number(n.attrs?.width);
        const h = Number(n.attrs?.height);
        const size = w > 0 && h > 0 ? ` width="${Math.round(w)}" height="${Math.round(h)}"` : '';
        const img = `<img src="${esc(src)}" alt="${esc(alt)}"${size} loading="lazy" decoding="async">`;
        return caption ? `<figure>${img}<figcaption>${esc(caption)}</figcaption></figure>` : `<figure>${img}</figure>`;
      }
      case 'table':
        return `<div class="table-wrap"><table><tbody>${kids(n)}</tbody></table></div>`;
      case 'tableRow':
        return `<tr>${kids(n)}</tr>`;
      case 'tableHeader':
      case 'tableCell': {
        const tag = n.type === 'tableHeader' ? 'th' : 'td';
        const cs = Number(n.attrs?.colspan);
        const rs = Number(n.attrs?.rowspan);
        const span = `${cs > 1 ? ` colspan="${cs}"` : ''}${rs > 1 ? ` rowspan="${rs}"` : ''}`;
        return `<${tag}${span}>${kids(n)}</${tag}>`;
      }
      default:
        return kids(n);
    }
  }

  return sanitizeHtml(node(doc), {
    allowedTags: [
      'p', 'h2', 'h3', 'strong', 'em', 'u', 's', 'code', 'pre', 'a', 'ul', 'ol', 'li', 'blockquote', 'hr', 'br',
      'figure', 'figcaption', 'img', 'div', 'table', 'tbody', 'tr', 'th', 'td',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
      h2: ['id'],
      h3: ['id'],
      ol: ['start'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
      div: ['class'],
    },
    allowedClasses: { div: ['table-wrap'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
  });
}
