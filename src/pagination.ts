export interface PageResult<T> {
  items: T[];
  total?: number;
}

export interface PaginateOptions {
  /** Items per page. Endpoint-specific default applies if omitted. */
  pageLimit?: number;
  /** Stop once this many items have been collected (result is trimmed to exactly this many). */
  maxResults?: number;
  /**
   * Hard stop on page count, independent of `total`/`maxResults` — a circuit
   * breaker in case an endpoint's `total`/short-page signal is ever wrong,
   * so a bug can't turn into an unbounded loop against a live account.
   */
  maxPages?: number;
}

const DEFAULT_MAX_PAGES = 500;

/**
 * Drive a paged GHL search endpoint to exhaustion, the way scrolling through
 * the full result list in the GHL UI would. Stops on whichever comes first:
 * an empty page, a short page (fewer items than requested), the endpoint's
 * own reported total being reached, `maxResults`, or `maxPages`.
 */
export async function paginateAll<T>(
  fetchPage: (page: number, pageLimit: number) => Promise<PageResult<T>>,
  opts: PaginateOptions = {}
): Promise<T[]> {
  const pageLimit = opts.pageLimit ?? 100;
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const maxResults = opts.maxResults ?? Infinity;

  const results: T[] = [];
  let page = 1;

  while (page <= maxPages && results.length < maxResults) {
    const { items, total } = await fetchPage(page, pageLimit);
    results.push(...items);

    const reachedTotal = typeof total === 'number' && results.length >= total;
    const shortPage = items.length < pageLimit;
    if (!items.length || reachedTotal || shortPage) break;

    page += 1;
  }

  return results.length > maxResults ? results.slice(0, maxResults) : results;
}
