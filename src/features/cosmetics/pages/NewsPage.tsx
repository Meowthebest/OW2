import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Newspaper } from 'lucide-react';
import { StateBlock } from '../../../components/controls';
import { useAsync } from '../../patches/data';
import { DataState, GridSkeleton, PageHeader, usePageTitle } from '../components/bits';
import { Thumb } from '../components/media';
import { loadNews, type NewsArticle } from '../data';
import { dayText } from '../labels';

const PER_PAGE = 12;
const BLIZZARD_NEWS = 'https://overwatch.blizzard.com/en-us/news/';

/** One article: its picture, title and summary, opening Blizzard's own page. */
function NewsCard({ article, eager }: { article: NewsArticle; eager: boolean }) {
  return (
    <li className="nw-card">
      <a className="nw-card__link" href={article.url} target="_blank" rel="noreferrer">
        <span className="nw-card__art"><Thumb src={article.image} width={520} fit="cover" eager={eager} text="Overwatch" /></span>
        <span className="nw-card__body">
          <span className="nw-card__title">{article.title}</span>
          {article.description && <span className="nw-card__summary">{article.description}</span>}
          <span className="nw-card__foot">
            {article.publishedAt && <time dateTime={article.publishedAt}>{dayText(article.publishedAt)}</time>}
            <ExternalLink size={13} aria-hidden="true" />
            <span className="sr-only">(opens Blizzard's site)</span>
          </span>
        </span>
      </a>
    </li>
  );
}

export function NewsPage() {
  usePageTitle('News');
  const news = useAsync(loadNews, 'news');
  const [page, setPage] = useState(0);
  const articles = news.data?.articles ?? [];
  const pages = Math.max(1, Math.ceil(articles.length / PER_PAGE));
  const shown = articles.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const turnTo = (next: number) => {
    setPage(next);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    if (page >= pages) setPage(0);
  }, [page, pages]);

  const pager = (where: 'top' | 'bottom') => (
    <nav className="nw-pager" aria-label={where === 'top' ? 'News pages' : 'News pages, again'}>
      <button type="button" className="cx-tool" onClick={() => turnTo(page - 1)} disabled={page === 0}>
        <ChevronLeft size={14} aria-hidden="true" /> Newer
      </button>
      <span className="nw-pager__where" aria-live={where === 'top' ? 'polite' : undefined}>Page {page + 1} of {pages}</span>
      <button type="button" className="cx-tool" onClick={() => turnTo(page + 1)} disabled={page >= pages - 1}>
        Older <ChevronRight size={14} aria-hidden="true" />
      </button>
    </nav>
  );

  return (
    <div className="page cx-page nw-page">
      <PageHeader
        eyebrow="Hub"
        title="News"
        intro="Blizzard's latest Overwatch news, with each article's own picture and summary. Every article opens on Blizzard's site."
        actions={<a className="cx-tool" href={BLIZZARD_NEWS} target="_blank" rel="noreferrer">Blizzard news <ExternalLink size={13} aria-hidden="true" /></a>}
      />
      {news.data ? (
        articles.length === 0 ? (
          <StateBlock icon={<Newspaper size={24} />} title="No articles recorded yet">Articles appear here after the next daily read of Blizzard's news page.</StateBlock>
        ) : (
          <>
            {pages > 1 && pager('top')}
            <ul className="nw-grid">
              {shown.map((article, index) => <NewsCard key={article.id} article={article} eager={page === 0 && index < 3} />)}
            </ul>
            {pages > 1 && pager('bottom')}
            <p className="cx-credit">
              Titles, pictures and summaries are Blizzard's, from <a href={BLIZZARD_NEWS} target="_blank" rel="noreferrer">its Overwatch news page</a>, read a few times a day.
              {news.data.updatedAt && ` Last new article found ${dayText(news.data.updatedAt)}.`}
            </p>
          </>
        )
      ) : (
        <DataState status={news.status} error={news.error} retry={news.retry} what="news" skeleton={<GridSkeleton count={6} tall />} />
      )}
    </div>
  );
}
