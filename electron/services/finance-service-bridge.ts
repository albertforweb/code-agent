/**
 * Service Bridge - Finance utilities
 * Provides read-only quote lookup for market price questions.
 */

const FINANCE_TIMEOUT_MS = 10_000;
const USER_AGENT = 'CodeAgent/1.0 desktop finance utility';

export interface FinanceQuote {
  query: string;
  symbol: string;
  name: string;
  exchangeName: string;
  fullExchangeName: string;
  instrumentType: string;
  currency: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  marketTimeIso: string | null;
  marketTimeFormatted: string | null;
  exchangeTimezone: string;
  source: string;
  note: string;
}

interface ResolvedSymbol {
  symbol: string;
  name?: string;
}

export class FinanceServiceBridge {
  async quote(args: Record<string, any>): Promise<FinanceQuote> {
    const query = String(args.symbol ?? args.ticker ?? args.query ?? '').trim();
    if (!query) {
      throw new Error('finance.quote requires a symbol, ticker, or query.');
    }

    const resolved = await this.resolveSymbol(query);
    const quote = await this.fetchChartQuote(resolved.symbol, query);

    return {
      ...quote,
      name: quote.name || resolved.name || quote.symbol,
    };
  }

  private async resolveSymbol(query: string): Promise<ResolvedSymbol> {
    if (/^[A-Z0-9.^=-]{1,20}$/.test(query)) {
      return { symbol: query };
    }

    for (const candidate of this.buildSearchCandidates(query)) {
      const resolved = await this.searchSymbol(candidate);
      if (resolved) {
        return resolved;
      }
    }

    throw new Error(`Unable to resolve finance symbol for "${query}".`);
  }

  private buildSearchCandidates(query: string): string[] {
    const cleaned = query
      .replace(/\b(stock|share|security|market|price|quote|today|current|latest|now|ticker)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return Array.from(new Set([query, cleaned].filter(Boolean)));
  }

  private async searchSymbol(query: string): Promise<ResolvedSymbol | null> {
    const response = await this.fetchWithTimeout(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=5&newsCount=0`,
    );
    if (!response.ok) {
      return null;
    }

    const data = await response.json() as any;
    const quotes = Array.isArray(data.quotes) ? data.quotes : [];
    const match = quotes.find((quote: any) => quote?.symbol && quote.quoteType === 'EQUITY') ??
      quotes.find((quote: any) => quote?.symbol);

    return match?.symbol
      ? {
        symbol: String(match.symbol),
        name: String(match.longname || match.shortname || match.symbol),
      }
      : null;
  }

  private async fetchChartQuote(symbol: string, query: string): Promise<FinanceQuote> {
    const response = await this.fetchWithTimeout(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`,
    );
    if (!response.ok) {
      throw new Error(`Unable to fetch quote for ${symbol} (${response.status}).`);
    }

    const data = await response.json() as any;
    const error = data.chart?.error;
    if (error) {
      throw new Error(error.description || `Unable to fetch quote for ${symbol}.`);
    }

    const result = data.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) {
      throw new Error(`Quote response for ${symbol} did not include market metadata.`);
    }

    const price = this.asNumber(meta.regularMarketPrice);
    const previousClose = this.asNumber(meta.previousClose ?? meta.chartPreviousClose);
    const change = price !== null && previousClose !== null ? price - previousClose : null;
    const changePercent = change !== null && previousClose ? (change / previousClose) * 100 : null;
    const marketTime = this.asNumber(meta.regularMarketTime);
    const exchangeTimezone = String(meta.exchangeTimezoneName || 'UTC');

    return {
      query,
      symbol: String(meta.symbol || symbol),
      name: String(meta.longName || meta.shortName || ''),
      exchangeName: String(meta.exchangeName || ''),
      fullExchangeName: String(meta.fullExchangeName || meta.exchangeName || ''),
      instrumentType: String(meta.instrumentType || ''),
      currency: String(meta.currency || ''),
      price,
      previousClose,
      change,
      changePercent,
      dayHigh: this.asNumber(meta.regularMarketDayHigh),
      dayLow: this.asNumber(meta.regularMarketDayLow),
      volume: this.asNumber(meta.regularMarketVolume),
      marketTimeIso: marketTime ? new Date(marketTime * 1000).toISOString() : null,
      marketTimeFormatted: marketTime
        ? this.formatMarketTime(marketTime * 1000, exchangeTimezone)
        : null,
      exchangeTimezone,
      source: 'Yahoo Finance chart API',
      note: 'Market quotes may be delayed. Use for informational purposes only; do not treat as financial advice.',
    };
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FINANCE_TIMEOUT_MS);

    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private asNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private formatMarketTime(timestampMs: number, timezone: string): string {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        dateStyle: 'medium',
        timeStyle: 'long',
      }).format(new Date(timestampMs));
    } catch {
      return new Date(timestampMs).toISOString();
    }
  }
}
