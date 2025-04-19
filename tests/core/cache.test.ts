import 'reflect-metadata';

import { beforeEach, describe, expect, it, Mock, mock, spyOn } from 'bun:test';
import { createCache } from 'cache-manager';
import * as KV from 'keyv';

import { Application } from '../../src/core/app';

@Application.register({
	redis: {
		default: 'cache',
		connections: {
			cache: { url: process.env.REDIS_TEST_URL! }
		}
	}
})
class TestApp extends Application {
	protected async run(): Promise<void> {
		// @ts-expect-error The commandServe method is private
		await this.commandServe();
	}
}

// Mock dependencies
mock.module('cache-manager', () => ({
	createCache: mock(createCache)
}));

const { Cache } = await import('../../src/core/cache');

new TestApp();

// Test the weak cache
describe('Cache.weak', () => {
	it('should get data from the weak cache', () => {
		// Create a test object to use as a context
		const testContext = {};

		// Get data from the cache (should initialize with empty object)
		const data = Cache.weak.get(testContext);

		// Check if the data is an empty object
		expect(data).toEqual({});

		// Verify that the context is now in the map
		expect(Cache.weak.map.has(testContext)).toBe(true);
	});

	it('should return existing data from the weak cache', () => {
		// Create a test object to use as a context
		const testContext = {};

		// Set some data in the cache
		const testData = { test: 'data' };
		Cache.weak.map.set(testContext, testData);

		// Get data from the cache
		const data = Cache.weak.get(testContext);

		// Check if the data matches what we set
		expect(data).toBe(testData);
	});

	it('should delete data from the weak cache', () => {
		// Create a test object to use as a context
		const testContext = {};

		// Set some data in the cache
		Cache.weak.map.set(testContext, { test: 'data' });

		// Verify that the context is in the map
		expect(Cache.weak.map.has(testContext)).toBe(true);

		// Delete the data
		Cache.weak.del(testContext);

		// Verify that the context is no longer in the map
		expect(Cache.weak.map.has(testContext)).toBe(false);
	});
});

// Test the Redis cache
describe('Cache.redis', () => {
	// Reset mocks before each test
	beforeEach(() => {
		mock.restore();
	});

	it('should be created with the correct configuration', async () => {
		// Check if createCache was called with the correct parameters
		expect(createCache).toHaveBeenCalledWith({
			stores: expect.arrayContaining([expect.any(Object)])
		});
	});

	it('should call get method with the correct parameters', async () => {
		const getSpy = spyOn(Cache.redis, 'get');

		// Call the get method
		const result = await Cache.redis.get('test-key');

		// Check if the get method was called with the correct parameters
		expect(getSpy).toHaveBeenCalledWith('test-key');

		// Check if the result is correct
		expect(result).toBeNull();
	});

	it('should call set method with the correct parameters', async () => {
		const setSpy = spyOn(Cache.redis, 'set');

		// Call the set method
		const result = await Cache.redis.set('test-key', 'test-value', 3600);

		// Check if the set method was called with the correct parameters
		expect(setSpy).toHaveBeenCalledWith('test-key', 'test-value', 3600);

		// Check if the result is correct
		expect(result).toBe('test-value');
	});

	it('should call ttl method with the correct parameters', async () => {
		const ttlSpy = spyOn(Cache.redis, 'ttl');

		// Call the ttl method
		const result = await Cache.redis.ttl('test-key');

		// Check if the ttl method was called with the correct parameters
		expect(ttlSpy).toHaveBeenCalledWith('test-key');

		const date = new Date(result!);

		// Check if the result is correct
		expect(date.getTime()).toBeGreaterThanOrEqual(Date.now() - 3600 * 1000);
	});

	it('should call del method with the correct parameters', async () => {
		const delSpy = spyOn(Cache.redis, 'del');

		// Call the del method
		const result = await Cache.redis.del('test-key');

		// Check if the del method was called with the correct parameters
		expect(delSpy).toHaveBeenCalledWith('test-key');

		// Check if the result is correct
		expect(result).toBe(true);
	});

	it('should call mset method with the correct parameters', async () => {
		const msetSpy = spyOn(Cache.redis, 'mset');

		// Set up the mock to return the test data
		const testData = [
			{ key: 'key1', value: 'value1', ttl: 3600 },
			{ key: 'key2', value: 'value2' }
		];

		// Call the mset method
		const result = await Cache.redis.mset(testData);

		// Check if the mset method was called with the correct parameters
		expect(msetSpy).toHaveBeenCalledWith(testData);

		// Check if the result is correct
		expect(result).toEqual(testData);
	});

	it('should call mget method with the correct parameters', async () => {
		const mgetSpy = spyOn(Cache.redis, 'mget');

		// Call the mget method
		const result = await Cache.redis.mget(['key1', 'key2']);

		// Check if the mget method was called with the correct parameters
		expect(mgetSpy).toHaveBeenCalledWith(['key1', 'key2']);

		// Check if the result is correct
		expect(result).toEqual(['value1', 'value2']);
	});

	it('should call mdel method with the correct parameters', async () => {
		const mdelSpy = spyOn(Cache.redis, 'mdel');

		// Call the mdel method
		const result = await Cache.redis.mdel(['key1', 'key2']);

		// Check if the mdel method was called with the correct parameters
		expect(mdelSpy).toHaveBeenCalledWith(['key1', 'key2']);

		// Check if the result is correct
		expect(result).toBe(true);
	});

	it('should call clear method', async () => {
		const clearSpy = spyOn(Cache.redis, 'clear');

		// Call the clear method
		const result = await Cache.redis.clear();

		// Check if the clear method was called
		expect(clearSpy).toHaveBeenCalled();

		// Check if the result is correct
		expect(result).toBe(true);
	});

	it('should create a tagged cache with the correct namespace', () => {
		const keyvSpy = spyOn(KV, 'Keyv').mockReturnThis();

		// Call the tags method
		Cache.redis.tags('tag1', 'tag2');

		// Check if Keyv was instantiated with the correct namespace
		expect(keyvSpy).toHaveBeenCalledWith({
			store: expect.any(Object),
			namespace: 'cache__tag1__tag2'
		});

		// Check if createCache was called
		expect(createCache).toHaveBeenCalled();
	});
});

// Test the memory cache
describe('Cache.memory', () => {
	// Reset mocks before each test
	beforeEach(() => {
		mock.restore();
	});

	it('should be created with the correct configuration', () => {
		// Check if createCache was called with the correct parameters
		expect(createCache).toHaveBeenCalledWith({
			stores: expect.arrayContaining([expect.any(Object)])
		});
	});

	it('should call set method with the correct parameters', async () => {
		const setSpy = spyOn(Cache.memory, 'set');

		// Call the set method
		const result = await Cache.memory.set('test-key', 'test-value', 3600);

		// Check if the set method was called with the correct parameters
		expect(setSpy).toHaveBeenCalledWith('test-key', 'test-value', 3600);

		// Check if the result is correct
		expect(result).toBe('test-value');
	});
	it('should call get method with the correct parameters', async () => {
		const getSpy = spyOn(Cache.memory, 'get');

		// Call the get method
		const result = await Cache.memory.get('test-key');

		// Check if the get method was called with the correct parameters
		expect(getSpy).toHaveBeenCalledWith('test-key');

		// Check if the result is correct
		expect(result).toBe('test-value');
	});

	it('should call ttl method with the correct parameters', async () => {
		const ttlSpy = spyOn(Cache.memory, 'ttl');

		// Call the ttl method
		const result = await Cache.memory.ttl('test-key');

		// Check if the ttl method was called with the correct parameters
		expect(ttlSpy).toHaveBeenCalledWith('test-key');

		const date = new Date(result!);

		// Check if the result is correct
		expect(date.getTime()).toBeGreaterThanOrEqual(Date.now() - 3600 * 1000);
	});

	it('should call del method with the correct parameters', async () => {
		const delSpy = spyOn(Cache.memory, 'del');

		// Call the del method
		const result = await Cache.memory.del('test-key');

		// Check if the del method was called with the correct parameters
		expect(delSpy).toHaveBeenCalledWith('test-key');

		// Check if the result is correct
		expect(result).toBe(true);
	});

	it('should call mset method with the correct parameters', async () => {
		const msetSpy = spyOn(Cache.memory, 'mset');

		// Set up the mock to return the test data
		const testData = [
			{ key: 'key1', value: 'value1', ttl: 3600 },
			{ key: 'key2', value: 'value2' }
		];

		// Call the mset method
		const result = await Cache.memory.mset(testData);

		// Check if the mset method was called with the correct parameters
		expect(msetSpy).toHaveBeenCalledWith(testData);

		// Check if the result is correct
		expect(result).toEqual(testData);
	});

	it('should call mget method with the correct parameters', async () => {
		const mgetSpy = spyOn(Cache.memory, 'mget');

		// Call the mget method
		const result = await Cache.memory.mget(['key1', 'key2']);

		// Check if the mget method was called with the correct parameters
		expect(mgetSpy).toHaveBeenCalledWith(['key1', 'key2']);

		// Check if the result is correct
		expect(result).toEqual(['value1', 'value2']);
	});

	it('should call mdel method with the correct parameters', async () => {
		const mdelSpy = spyOn(Cache.memory, 'mdel');

		// Call the mdel method
		const result = await Cache.memory.mdel(['key1', 'key2']);

		// Check if the mdel method was called with the correct parameters
		expect(mdelSpy).toHaveBeenCalledWith(['key1', 'key2']);

		// Check if the result is correct
		expect(result).toBe(true);
	});

	it('should call clear method', async () => {
		const clearSpy = spyOn(Cache.memory, 'clear');

		// Call the clear method
		const result = await Cache.memory.clear();

		// Check if the clear method was called
		expect(clearSpy).toHaveBeenCalled();

		// Check if the result is correct
		expect(result).toBe(true);
	});

	it('should create a tagged cache with the correct namespace', () => {
		const keyvSpy = spyOn(KV, 'Keyv').mockReturnThis();

		// Call the tags method
		Cache.memory.tags('tag1', 'tag2');

		// Check if Keyv was instantiated with the correct namespace
		expect(keyvSpy).toHaveBeenCalledWith({
			store: expect.any(Object),
			namespace: 'cache__tag1__tag2'
		});

		// Check if createCache was called
		expect(createCache).toHaveBeenCalled();
	});
});

// Test cache with different TTL values
describe('Cache with TTL', () => {
	beforeEach(() => {
		mock.restore();
	});

	it('should set cache with TTL', async () => {
		const setSpy = spyOn(Cache.memory, 'set');

		// Call the set method with TTL
		await Cache.memory.set('test-key', 'test-value', 3600);

		// Check if the set method was called with the correct TTL
		expect(setSpy).toHaveBeenCalledWith('test-key', 'test-value', 3600);
	});

	it('should set cache without TTL', async () => {
		const setSpy = spyOn(Cache.memory, 'set');

		// Call the set method without TTL
		await Cache.memory.set('test-key', 'test-value');

		// Check if the set method was called without TTL
		expect(setSpy).toHaveBeenCalledWith('test-key', 'test-value');
	});

	it('should set multiple cache entries with different TTLs', async () => {
		const msetSpy = spyOn(Cache.memory, 'mset');

		// Set up the mock to return the test data
		const testData = [
			{ key: 'key1', value: 'value1', ttl: 3600 },
			{ key: 'key2', value: 'value2' }
		];

		// Call the mset method
		await Cache.memory.mset(testData);

		// Check if the mset method was called with the correct parameters
		expect(msetSpy).toHaveBeenCalledWith(testData);
	});
});

// Test cache namespacing and tagging
describe('Cache namespacing and tagging', () => {
	beforeEach(() => {
		mock.restore();
	});

	it('should create a tagged cache with a single tag', () => {
		const keyvSpy = spyOn(KV, 'Keyv').mockReturnThis();

		// Call the tags method with a single tag
		Cache.memory.tags('tag1');

		// Check if Keyv was instantiated with the correct namespace
		expect(keyvSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				namespace: 'cache__tag1'
			})
		);

		// Check if createCache was called
		expect(createCache).toHaveBeenCalled();
	});

	it('should create a tagged cache with multiple tags', () => {
		const keyvSpy = spyOn(KV, 'Keyv').mockReturnThis();

		// Call the tags method with multiple tags
		Cache.memory.tags('tag1', 'tag2', 'tag3');

		// Check if Keyv was instantiated with the correct namespace
		expect(keyvSpy).toHaveBeenLastCalledWith(
			expect.objectContaining({
				namespace: 'cache__tag1__tag2__tag3'
			})
		);

		// Check if createCache was called
		expect(createCache).toHaveBeenCalled();

		keyvSpy.mockClear();
		(createCache as Mock<typeof createCache>).mockClear();

		// Call the tags method with multiple tags
		Cache.memory.tags('tag3', 'tag2', 'tag1');

		expect(keyvSpy).not.toHaveBeenCalled();
		expect(createCache).not.toHaveBeenCalled();
	});
});
