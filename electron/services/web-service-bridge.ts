/**
 * Service Bridge - Web utilities
 * Provides small read-only web search/fetch helpers for local agent tool use.
 */

const DEFAULT_SEARCH_RESULTS = 5;
const MAX_SEARCH_RESULTS = 8;
const DEFAULT_FETCH_CHARS = 20_000;
const MAX_FETCH_CHARS = 80_000;
const DEFAULT_RESEARCH_RESULTS = 3;
const MAX_RESEARCH_RESULTS = 4;
const DEFAULT_RESEARCH_CHARS_PER_PAGE = 2_500;
const MAX_RESEARCH_CHARS_PER_PAGE = 6_000;
const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = 'CodeAgent/1.0 desktop web utility';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebResearchSource extends WebSearchResult {
  finalUrl?: string;
  fetchedTitle?: string;
  contentType?: string;
  text?: string;
  truncated?: boolean;
  error?: string;
}

export class WebServiceBridge {
  async search(args: Record<string, any>): Promise<{
    query: string;
    provider: string;
    results: WebSearchResult[];
  }> {
    const query = String(args.query ?? '').trim();
    if (!query) {
      throw new Error('web.search requires a query.');
    }

    const maxResults = this.resolveLimit(args.maxResults ?? args.limit, DEFAULT_SEARCH_RESULTS, MAX_SEARCH_RESULTS);
    const instantResults = await this.searchDuckDuckGoInstant(query, maxResults);

    if (instantResults.length >= Math.min(maxResults, 3)) {
      return {
        query,
        provider: 'duckduckgo-instant-answer',
        results: instantResults.slice(0, maxResults),
      };
    }

    const htmlResults = await this.searchDuckDuckGoHtml(query, maxResults);
    return {
      query,
      provider: htmlResults.length > 0 ? 'duckduckgo-html' : 'duckduckgo-instant-answer',
      results: [...instantResults, ...htmlResults]
        .filter((result, index, all) => all.findIndex(item => item.url === result.url) === index)
        .slice(0, maxResults),
    };
  }

  async fetchPage(args: Record<string, any>): Promise<{
    url: string;
    finalUrl: string;
    status: number;
    contentType: string;
    title: string;
    text: string;
    truncated: boolean;
  }> {
    const url = this.normalizeUrl(String(args.url ?? '').trim());
    const maxChars = this.resolveLimit(args.maxChars ?? args.maxBytes, DEFAULT_FETCH_CHARS, MAX_FETCH_CHARS);
    const response = await this.fetchWithTimeout(url);
    const contentType = response.headers.get('content-type') ?? '';
    const rawText = await response.text();
    const text = contentType.includes('text/html')
      ? this.htmlToText(rawText)
      : rawText.replace(/\r/g, '');
    const truncated = text.length > maxChars;

    return {
      url,
      finalUrl: response.url,
      status: response.status,
      contentType,
      title: contentType.includes('text/html') ? this.extractHtmlTitle(rawText) : '',
      text: truncated ? text.slice(0, maxChars) : text,
      truncated,
    };
  }

  async research(args: Record<string, any>): Promise<{
    query: string;
    provider: string;
    searchedAt: string;
    sources: WebResearchSource[];
    note: string;
  }> {
    const query = String(args.query ?? '').trim();
    if (!query) {
      throw new Error('web.research requires a query.');
    }

    const maxResults = this.resolveLimit(
      args.maxResults ?? args.limit,
      DEFAULT_RESEARCH_RESULTS,
      MAX_RESEARCH_RESULTS,
    );
    const maxCharsPerPage = this.resolveLimit(
      args.maxCharsPerPage ?? args.maxChars,
      DEFAULT_RESEARCH_CHARS_PER_PAGE,
      MAX_RESEARCH_CHARS_PER_PAGE,
    );
    const search = await this.search({ query, maxResults });
    const sources = await Promise.all(search.results.slice(0, maxResults).map(async result => {
      try {
        const page = await this.fetchPage({
          url: result.url,
          maxChars: maxCharsPerPage,
        });

        return {
          ...result,
          finalUrl: page.finalUrl,
          fetchedTitle: page.title,
          contentType: page.contentType,
          text: page.text,
          truncated: page.truncated,
        };
      } catch (error) {
        return {
          ...result,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }));

    return {
      query,
      provider: search.provider,
      searchedAt: new Date().toISOString(),
      sources,
      note: 'Use the fetched page text to synthesize a direct answer. Cite source URLs in the final response when using current or external facts.',
    };
  }

  private async searchDuckDuckGoInstant(query: string, maxResults: number): Promise<WebSearchResult[]> {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
    const response = await this.fetchWithTimeout(url);
    if (!response.ok) {
      return [];
    }

    let data: any;
    try {
      data = await response.json() as any;
    } catch {
      return [];
    }
    const results: WebSearchResult[] = [];

    if (data.AbstractText && data.AbstractURL) {
      results.push({
        title: this.cleanText(data.Heading || data.AbstractSource || data.AbstractURL),
        url: String(data.AbstractURL),
        snippet: this.cleanText(data.AbstractText),
      });
    }

    this.collectRelatedTopics(data.RelatedTopics, results, maxResults);
    return results.slice(0, maxResults);
  }

  private async searchDuckDuckGoHtml(query: string, maxResults: number): Promise<WebSearchResult[]> {
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await this.fetchWithTimeout(url);
    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const results: WebSearchResult[] = [];
    const itemPattern = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match: RegExpExecArray | null;

    while ((match = itemPattern.exec(html)) !== null && results.length < maxResults) {
      results.push({
        title: this.cleanText(match[2]),
        url: this.decodeDuckDuckGoUrl(this.decodeHtml(match[1])),
        snippet: this.cleanText(match[3]),
      });
    }

    return results;
  }

  private collectRelatedTopics(value: unknown, results: WebSearchResult[], maxResults: number): void {
    if (!Array.isArray(value) || results.length >= maxResults) {
      return;
    }

    for (const topic of value) {
      if (results.length >= maxResults) {
        return;
      }

      if (Array.isArray(topic?.Topics)) {
        this.collectRelatedTopics(topic.Topics, results, maxResults);
        continue;
      }

      if (topic?.FirstURL && topic?.Text) {
        results.push({
          title: this.cleanText(String(topic.Text).split(' - ')[0] || topic.Text),
          url: String(topic.FirstURL),
          snippet: this.cleanText(topic.Text),
        });
      }
    }
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/json,text/plain;q=0.9,*/*;q=0.8',
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeUrl(value: string): string {
    if (!value) {
      throw new Error('web.fetch requires a URL.');
    }

    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('web.fetch only supports http and https URLs.');
    }

    return url.toString();
  }

  private resolveLimit(value: unknown, fallback: number, maximum: number): number {
    const parsed = Number(value ?? fallback);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.min(Math.floor(parsed), maximum);
  }

  private decodeDuckDuckGoUrl(value: string): string {
    try {
      const url = new URL(value, 'https://duckduckgo.com');
      return url.searchParams.get('uddg') || url.toString();
    } catch {
      return value;
    }
  }

  private htmlToText(html: string): string {
    return this.decodeHtml(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
  }

  private extractHtmlTitle(html: string): string {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? this.cleanText(match[1]) : '';
  }

  private cleanText(value: string): string {
    return this.decodeHtml(value)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private decodeHtml(value: string): string {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_match, decimal) => String.fromCharCode(Number(decimal)));
  }
}
