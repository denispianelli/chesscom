import type {
  CacheEntry,
  CacheStore,
  HttpRequest,
  HttpResponse,
  HttpTransport,
} from "../../domain/ports.js";

/**
 * Decorates an {@link HttpTransport} with ETag-based revalidation.
 *
 * For a known URL it sends `If-None-Match`; a `304 Not Modified` then serves the
 * body straight from the {@link CacheStore} instead of re-downloading it. This is
 * revalidation, not avoidance — every request still reaches the network, so this
 * decorator sits *inside* the rate limiter.
 *
 * The cache is best-effort: a failing store degrades to a miss (reads) or a
 * no-op (writes) and never turns into a failed request.
 */
export class EtagCache implements HttpTransport {
  readonly #inner: HttpTransport;
  readonly #store: CacheStore;

  constructor(inner: HttpTransport, store: CacheStore) {
    this.#inner = inner;
    this.#store = store;
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    const key = req.url;
    const cached = await this.#read(key);

    const response = await this.#inner.request(
      cached !== undefined ? { ...req, etag: cached.etag } : req,
    );

    if (response.status === 304 && cached !== undefined) {
      // Unchanged since last fetch: serve the cached body, keep the honest 304.
      return { status: 304, etag: cached.etag, body: cached.body };
    }

    // A fresh response with an ETag is cacheable for next time.
    if (response.etag !== undefined) {
      await this.#write(key, { etag: response.etag, body: response.body });
    }

    return response;
  }

  async #read(key: string): Promise<CacheEntry | undefined> {
    try {
      return await this.#store.get(key);
    } catch {
      return undefined;
    }
  }

  async #write(key: string, entry: CacheEntry): Promise<void> {
    try {
      await this.#store.set(key, entry);
    } catch {
      // A failing cache must not fail the request.
    }
  }
}
