import type { KeyvStoreAdapter } from 'keyv';

import { createCache } from 'cache-manager';
import { KeyvCacheableMemory } from 'cacheable';
import { Keyv } from 'keyv';
import { alphabetical } from 'radash';

import { KeyvRedis } from './redis';

/**
 * Interface for a cache storage.
 * @author Axel Nana <axel.nana@workbud.com>
 */
interface CacheInterface {
	/**
	 * Retrieves the cached data for a given key.
	 * @typeParam T The type of the cached data.
	 *
	 * @param key The key of the cached data.
	 */
	get<T>(key: string): Promise<T | null>;

	/**
	 * Retrieves the cached data for a given list of keys.
	 * @typeParam T The type of the cached data.
	 *
	 * @param keys The list of cached data keys.
	 */
	mget<T>(keys: string[]): Promise<Array<T | null>>;

	/**
	 * Gets the TTL of the cached data with the given key.
	 * @param key The key of the cached data.
	 * @returns The TTL of the cached data, or `null` if the data does not exist.
	 */
	ttl(key: string): Promise<number | null>;

	/**
	 * Caches data under the given key and an optional TTL.
	 * @typeParam T The type of the data to cache.
	 *
	 * @param key The key of the cached data.
	 * @param data The data to cache.
	 * @param ttl The optional TTL of the cached data. If not defined, the data is cached forever.
	 * @returns The cached data.
	 */
	set<T>(key: string, data: T, ttl?: number): Promise<T>;

	/**
	 * Caches data under the given list of keys and an optional TTL.
	 * @typeParam T The type of the data to cache.
	 *
	 * @param data The list of data to cache.
	 * @returns The list of cached data.
	 */
	mset<T>(
		data: Array<{
			key: string;
			value: T;
			ttl?: number;
		}>
	): Promise<
		Array<{
			key: string;
			value: T;
			ttl?: number;
		}>
	>;

	/**
	 * Deletes the cached data with the given key.
	 * @typeParam T The type of the data to cache.
	 *
	 * @param key The key of the cached data.
	 * @returns `true` if the data was deleted, `false` otherwise.
	 */
	del(key: string): Promise<boolean>;

	/**
	 * Deletes the cached data with the given list of keys.
	 * @typeParam T The type of the data to cache.
	 *
	 * @param keys The list of cached data keys.
	 * @returns `true` if the data was deleted, `false` otherwise.
	 */
	mdel(keys: string[]): Promise<boolean>;

	/**
	 * Deletes all cached data.
	 * @returns `true` if the data was deleted, `false` otherwise.
	 */
	clear(): Promise<boolean>;

	/**
	 * Creates a sub-cache with the given tags.
	 * @param tags The list of tags for the sub-cache.
	 */
	tags(...tags: string[]): Omit<CacheInterface, 'tags'>;
}

/**
 * Makes a cache interface wrapping the given store.
 * @author Axel Nana <axel.nana@workburd.com>
 * @param store The cache storage to use in the interface.
 * @returns A new `CacheInterface`.
 */
const makeCacheInterface = (store: KeyvStoreAdapter): CacheInterface => {
	const base = createCache({
		stores: [
			new Keyv({
				store,
				namespace: 'cache'
			})
		]
	});

	const tagsCache = new Map<string, Omit<CacheInterface, 'tags'>>();

	return {
		...base,
		tags(...tags) {
			const namespace = `cache__${alphabetical(tags, (item) => item).join('__')}`;
			let cache = tagsCache.get(namespace);

			if (!cache) {
				cache = createCache({
					stores: [
						new Keyv({
							store,
							namespace
						})
					]
				});

				tagsCache.set(namespace, cache);
			}

			return cache;
		}
	};
};

export namespace Cache {
	/**
	 * A weak cache storage for simple non-intrusive caching of data.
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	export const weak = Object.seal({
		/**
		 * INTERNAL USAGE ONLY.
		 * @private
		 */
		map: new WeakMap<object, unknown>(),

		/**
		 * Gets the cached data for a given context.
		 * @param ctx The cache context.
		 * @returns The cached data.
		 */
		get<T extends object>(ctx: object): T {
			if (!this.map.has(ctx)) this.map.set(ctx, {});
			return this.map.get(ctx) as T;
		},

		/**
		 * Deletes the cached data for a given context.
		 * @param ctx The cache context.
		 */
		del(ctx: object): void {
			this.map.delete(ctx);
		}
	});

	/**
	 * Redis-based cache storage.
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	export const redis = makeCacheInterface(
		new KeyvRedis({
			connection: 'cache'
		})
	);

	/**
	 * Memory-based cache storage.
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	export const memory = makeCacheInterface(new KeyvCacheableMemory({ ttl: 60000, lruSize: 5000 }));
}
