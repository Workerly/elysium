import { createCache } from 'cache-manager';
import { KeyvCacheableMemory } from 'cacheable';
import { Keyv } from 'keyv';

import { KeyvRedis } from './redis';

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
	export const redis = createCache({
		stores: [
			//  Redis Store
			new Keyv({
				store: new KeyvRedis({
					connection: 'cache'
				}),
				namespace: 'cache'
			})
		]
	});

	/**
	 * Memory-based cache storage.
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	export const memory = createCache({
		stores: [
			//  High performance in-memory cache with LRU and TTL
			new Keyv({
				store: new KeyvCacheableMemory({ ttl: 60000, lruSize: 5000 })
			})
		]
	});
}
