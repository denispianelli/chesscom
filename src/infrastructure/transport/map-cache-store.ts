import type { CacheEntry, CacheStore } from "../../domain/ports.js";

/**
 * Default {@link CacheStore}: an in-process `Map`. Lives for the lifetime of the
 * client and is not bounded — fine for typical usage, since ETags key on URL and
 * the working set is small. For shared or persistent caching, implement
 * {@link CacheStore} against Redis, a file, etc.
 */
export class MapCacheStore implements CacheStore {
  readonly #entries = new Map<string, CacheEntry>();

  get(key: string): Promise<CacheEntry | undefined> {
    return Promise.resolve(this.#entries.get(key));
  }

  set(key: string, value: CacheEntry): Promise<void> {
    this.#entries.set(key, value);
    return Promise.resolve();
  }
}
