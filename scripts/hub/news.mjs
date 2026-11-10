// Blizzard's Overwatch news list, kept as JSON for the site's News page: title, picture, summary, date and link.
// Blizzard's robots.txt allows the news pages, including the "Load More" pages read here.

const ORIGIN = 'https://overwatch.blizzard.com';
export const NEWS_URL = `${ORIGIN}/en-us/news/`;
/** The pages Blizzard's own "Load More" button reads, newest first after the main list. */
export const nextArticlesUrl = (page) => `${ORIGIN}/en-us/news/next-articles/?page=${page}`;

/** Only Blizzard's own picture hosts, over https, reach the page. */
const IMAGE_HOSTS = new Set(['bnetcmsus-a.akamaihd.net', 'blz-contentstack-images.akamaized.net']);

const decode = (text) =>
  String(text)
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&nbsp;/g, ' ')
    .replace(/&reg;/g, '®')
    .replace(/&trade;/g, '™')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

export function safeImage(src) {
  try {
    const url = new URL(decode(src));
    return url.protocol === 'https:' && IMAGE_HOSTS.has(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The articles in a page of Blizzard's news list. It shows them two ways, as picture cards and as list rows with a
 * summary, and this reads both: number, link, title, picture, summary when given, and date.
 */
export function parseNewsArticles(html) {
  const articles = new Map();
  const anchor = /<a\b[^>]*\bhref="(?:https:\/\/overwatch\.blizzard\.com)?\/(?:en-us\/)?news\/(\d+)\/([^"/?#\s]+)\/?"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const [, id, slug, inner] of String(html).matchAll(anchor)) {
    if (articles.has(id)) continue;
    const title = decode(/\bheadingtext="([^"]*)"/i.exec(inner)?.[1] ?? /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(inner)?.[1] ?? '');
    if (!title) continue;
    const summary = /\bdescriptiontext="([^"]*)"/i.exec(inner)?.[1] ?? /<p\b[^>]*class="article-summary"[^>]*>([\s\S]*?)<\/p>/i.exec(inner)?.[1] ?? '';
    const image = safeImage(/\bimagesrc="([^"]+)"/i.exec(inner)?.[1] ?? /<blz-image\b[^>]*\bsrc="([^"]+)"/i.exec(inner)?.[1] ?? '');
    const stamp = /<blz-timestamp\b[^>]*\btimestamp="([^"]+)"/i.exec(inner)?.[1] ?? null;
    articles.set(id, {
      id,
      url: `${ORIGIN}/en-us/news/${id}/${slug}/`,
      title,
      description: decode(summary) || null,
      image,
      publishedAt: stamp && Number.isFinite(Date.parse(stamp)) ? new Date(stamp).toISOString() : null,
    });
  }
  return [...articles.values()];
}

/** An article page's own summary, for the cards on the list that don't show one. */
export function parseArticleSummary(html) {
  const meta = (name) => new RegExp(`<meta\\b[^>]*\\b(?:name|property)="${name}"[^>]*\\bcontent="([^"]*)"`, 'i').exec(html)?.[1] ?? new RegExp(`<meta\\b[^>]*\\bcontent="([^"]*)"[^>]*\\b(?:name|property)="${name}"`, 'i').exec(html)?.[1];
  return decode(meta('description') ?? meta('og:description') ?? '') || null;
}

/**
 * Adds what was just read to what's kept. A known article keeps any summary or picture it had if the list stops showing
 * one, and the newest come first. Older articles drop off past `keep`, which is plenty for paging back a few months.
 */
export function mergeNews(kept, fresh, { keep = 120 } = {}) {
  const byId = new Map(kept.map((article) => [article.id, article]));
  for (const article of fresh) {
    const old = byId.get(article.id);
    byId.set(article.id, {
      ...old,
      ...article,
      description: article.description ?? old?.description ?? null,
      image: article.image ?? old?.image ?? null,
      publishedAt: article.publishedAt ?? old?.publishedAt ?? null,
    });
  }
  return [...byId.values()]
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || Number(b.id) - Number(a.id))
    .slice(0, keep);
}

/** Problems with a stored list, as sentences. An empty list is fine; a malformed one isn't. */
export function checkNewsFile(file) {
  const problems = [];
  if (!file || file.schema !== 1 || !Array.isArray(file.articles)) return ['the file should have schema 1 and an articles list'];
  const seen = new Set();
  for (const article of file.articles) {
    const where = `article ${article?.id ?? '?'}`;
    if (!/^\d+$/.test(String(article?.id ?? ''))) problems.push(`${where}: the number is missing`);
    if (seen.has(article.id)) problems.push(`${where}: listed twice`);
    seen.add(article.id);
    if (!article.title) problems.push(`${where}: no title`);
    if (!String(article.url ?? '').startsWith(`${ORIGIN}/en-us/news/${article.id}/`)) problems.push(`${where}: the link isn't Blizzard's article`);
    if (article.image !== null && safeImage(article.image) !== article.image) problems.push(`${where}: the picture isn't from Blizzard`);
    if (article.publishedAt !== null && !Number.isFinite(Date.parse(article.publishedAt))) problems.push(`${where}: the date can't be read`);
  }
  return problems;
}
