import { describe, expect, it } from 'vitest';
import { analyzeContent, anchorId, internalTargets, renderContent, type JNode } from './journal-content.js';

const PRODUCT = '11111111-1111-4111-8111-111111111111';
const POST = '22222222-2222-4222-8222-222222222222';
const GONE = '33333333-3333-4333-8333-333333333333';

const t = (text: string, marks?: JNode['marks']): JNode => ({ type: 'text', text, ...(marks && { marks }) });
const p = (...content: JNode[]): JNode => ({ type: 'paragraph', content });
const h = (level: number, text: string): JNode => ({ type: 'heading', attrs: { level }, content: [t(text)] });
const doc = (...content: JNode[]): JNode => ({ type: 'doc', content });

const resolve = (type: string, id: string | null, href: string) =>
  type === 'PRODUCT' && id === PRODUCT ? '/products/red-kantha' : type === 'POST' && id === POST ? '/journal/silk-care' : type === 'PAGE' ? href : null;

describe('analyzeContent', () => {
  const d = doc(
    p(t('Baluchori sarees tell stories in silk.')),
    h(2, 'History of the weave'),
    p(t('See '), t('this saree', [{ type: 'link', attrs: { href: '/products/old', internalType: 'product', internalId: PRODUCT } }]), t(' and '),
      t('UNESCO', [{ type: 'link', attrs: { href: 'https://unesco.org', rel: 'nofollow evil', target: '_blank' } }])),
    h(1, 'Care'),
    h(2, 'History of the weave'),
    h(4, 'Small print'),
  );
  const a = analyzeContent(d);

  it('builds a table of contents with unique, stable ids (H1 → H2, H4 → H3)', () => {
    expect(a.headings).toEqual([
      { id: 'history-of-the-weave', text: 'History of the weave', level: 2 },
      { id: 'care', text: 'Care', level: 2 },
      { id: 'history-of-the-weave-2', text: 'History of the weave', level: 2 },
      { id: 'small-print', text: 'Small print', level: 3 },
    ]);
  });

  it('extracts internal and external links, keeping only known rel values', () => {
    expect(a.links).toEqual([
      { kind: 'INTERNAL', targetType: 'PRODUCT', targetId: PRODUCT, href: '/products/old', anchorText: 'this saree', rel: null, newTab: false },
      { kind: 'EXTERNAL', targetType: 'URL', targetId: null, href: 'https://unesco.org', anchorText: 'UNESCO', rel: 'nofollow', newTab: true },
    ]);
    expect(internalTargets(d)).toEqual({ PRODUCT: [PRODUCT], CATEGORY: [], POST: [] });
  });

  it('counts words, reading time and the first paragraph', () => {
    expect(a.firstParagraph).toBe('Baluchori sarees tell stories in silk.');
    expect(a.readingMinutes).toBe(1);
    expect(a.wordCount).toBeGreaterThan(10);
  });

  it('merges one link split over bold and plain text', () => {
    const link = { type: 'link', attrs: { href: 'https://a.com' } };
    const r = analyzeContent(doc(p(t('Read ', [link]), t('this', [link, { type: 'bold' }]))));
    expect(r.links).toHaveLength(1);
    expect(r.links[0].anchorText).toBe('Read this');
  });
});

describe('renderContent', () => {
  it('uses the CURRENT url for internal links and drops links to removed targets', () => {
    const html = renderContent(
      doc(p(t('a', [{ type: 'link', attrs: { href: '/products/old', internalType: 'PRODUCT', internalId: PRODUCT } }]),
        t('b', [{ type: 'link', attrs: { href: '/journal/x', internalType: 'POST', internalId: GONE } }]))),
      resolve,
    );
    expect(html).toBe('<p><a href="/products/red-kantha">a</a>b</p>');
  });

  it('adds rel + noopener for outbound links that open in a new tab', () => {
    const html = renderContent(doc(p(t('x', [{ type: 'link', attrs: { href: 'https://a.com', rel: 'sponsored', target: '_blank' } }]))), resolve);
    expect(html).toBe('<p><a href="https://a.com" target="_blank" rel="sponsored noopener noreferrer">x</a></p>');
  });

  it('escapes text and refuses dangerous links and images', () => {
    const html = renderContent(
      doc(
        p(t('<script>alert(1)</script>'), t('click', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
        { type: 'image', attrs: { src: 'http://insecure/x.webp', alt: 'x' } },
        { type: 'iframe', attrs: { src: 'https://evil' }, content: [t('kept text')] },
      ),
      resolve,
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('iframe');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('kept text');
  });

  it('renders headings with anchors, images as figures with captions, and tables', () => {
    const html = renderContent(
      doc(
        h(2, 'Care tips'),
        { type: 'image', attrs: { src: 'https://cdn.example.com/a.webp', alt: 'Silk folds', title: 'Fold along the pleats', width: 1200, height: 1600 } },
        { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [p(t('Weave'))] }] }] },
      ),
      resolve,
    );
    expect(html).toContain('<h2 id="care-tips">Care tips</h2>');
    expect(html).toContain('<figure><img src="https://cdn.example.com/a.webp" alt="Silk folds" width="1200" height="1600" loading="lazy" decoding="async" /><figcaption>Fold along the pleats</figcaption></figure>');
    expect(html).toContain('<div class="table-wrap"><table><tbody><tr><th><p>Weave</p></th></tr></tbody></table></div>');
  });
});

describe('anchorId', () => {
  it('makes readable anchors', () => {
    expect(anchorId('Caring for silk: the basics')).toBe('caring-for-silk-the-basics');
    expect(anchorId('!!!')).toBe('section');
  });
});
