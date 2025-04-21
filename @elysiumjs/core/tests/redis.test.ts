// Copyright (c) 2025-present Workbud Technologies Inc. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { Mock } from 'bun:test';

import { EventEmitter } from 'node:events';

import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { Event } from '../src/event';
import { KeyvRedis, Redis } from '../src/redis';
import { Service } from '../src/service';

// Mock Bun.RedisClient
const mockRedisClient = {
	get: mock().mockResolvedValue('test-value'),
	set: mock().mockResolvedValue('OK'),
	mget: mock().mockResolvedValue(['value1', 'value2']),
	del: mock().mockResolvedValue(1),
	exists: mock().mockResolvedValue(true),
	send: mock().mockResolvedValue(['0', []]),
	close: mock()
} as unknown as Bun.RedisClient;

// Mock Bun global object
const originalRedisClient = Bun.RedisClient;
Bun.RedisClient = mock(function () {
	return mockRedisClient;
}) as unknown as typeof Bun.RedisClient;

afterAll(() => {
	Bun.RedisClient = originalRedisClient;
});

// Mock console.error and process.exit to prevent actual console output and process exit
const originalConsoleError = console.error;
const originalProcessExit = process.exit;

describe('Redis', () => {
	beforeEach(() => {
		console.error = mock();
		process.exit = mock() as any;
		mock.restore();
	});

	afterEach(() => {
		console.error = originalConsoleError;
		process.exit = originalProcessExit;
		mock.restore();
	});

	describe('Redis namespace', () => {
		describe('registerConnection', () => {
			it('should register a new connection', () => {
				// Mock Service.exists to return false (connection doesn't exist)
				const existsSpy = spyOn(Service, 'exists').mockReturnValueOnce(false);
				const instanceSpy = spyOn(Service, 'instance');

				// Call the function
				const result = Redis.registerConnection('test', { url: process.env.REDIS_TEST_URL });

				// Check if Service.exists was called with the correct connection name
				expect(existsSpy).toHaveBeenCalledWith('redis.connection.test');

				// Check if Bun.RedisClient was instantiated with the correct parameters
				expect(Bun.RedisClient).toHaveBeenCalledWith(process.env.REDIS_TEST_URL, {});

				// Check if Service.instance was called with the correct parameters
				expect(instanceSpy).toHaveBeenCalledWith('redis.connection.test', mockRedisClient);

				// Check if the result is correct
				expect(result).toBe(mockRedisClient);
			});

			it('should throw an error if the connection already exists', () => {
				// Mock Service.exists to return true (connection exists)
				const existsSpy = spyOn(Service, 'exists').mockReturnValueOnce(true);

				// Call the function
				Redis.registerConnection('test', { url: process.env.REDIS_TEST_URL });

				// Check if console.error and process.exit were called
				expect(console.error).toHaveBeenCalledWith(
					expect.stringContaining('A connection with the name test has already been registered')
				);
				expect(process.exit).toHaveBeenCalledWith(1);
			});
		});

		describe('getConnection', () => {
			it('should retrieve an existing connection', () => {
				// Mock Service.exists to return true (connection exists)
				const existsSpy = spyOn(Service, 'exists').mockReturnValueOnce(true);
				const getSpy = spyOn(Service, 'get').mockReturnValueOnce(mockRedisClient);

				// Call the function
				const result = Redis.getConnection('test');

				// Check if Service.exists was called with the correct connection name
				expect(existsSpy).toHaveBeenCalledWith('redis.connection.test');

				// Check if Service.get was called with the correct connection name
				expect(getSpy).toHaveBeenCalledWith('redis.connection.test');

				// Check if the result is correct
				expect(result).toBe(mockRedisClient);
			});

			it('should throw an error if the connection does not exist', () => {
				// Mock Service.exists to return false (connection doesn't exist)
				const existsSpy = spyOn(Service, 'exists').mockReturnValueOnce(false);

				// Call the function
				Redis.getConnection('test');

				// Check if console.error and process.exit were called
				expect(console.error).toHaveBeenCalledWith(
					expect.stringContaining('No connection with name test found')
				);
				expect(process.exit).toHaveBeenCalledWith(1);
			});
		});

		describe('connectionExists', () => {
			it('should return true if the connection exists', () => {
				// Mock Service.exists to return true
				const existsSpy = spyOn(Service, 'exists').mockReturnValueOnce(true);

				// Call the function
				const result = Redis.connectionExists('test');

				// Check if Service.exists was called with the correct connection name
				expect(existsSpy).toHaveBeenCalledWith('redis.connection.test');

				// Check if the result is correct
				expect(result).toBe(true);
			});

			it('should return false if the connection does not exist', () => {
				// Mock Service.exists to return false
				const existsSpy = spyOn(Service, 'exists').mockReturnValueOnce(false);

				// Call the function
				const result = Redis.connectionExists('test');

				// Check if Service.exists was called with the correct connection name
				expect(existsSpy).toHaveBeenCalledWith('redis.connection.test');

				// Check if the result is correct
				expect(result).toBe(false);
			});
		});

		describe('getDefaultConnection', () => {
			it('should retrieve the default connection', () => {
				// Mock getConnection to return a mock connection
				const getConnectionSpy = spyOn(Redis, 'getConnection').mockReturnValue(mockRedisClient);

				// Call the function
				const result = Redis.getDefaultConnection();

				// Check if getConnection was called with 'default'
				// expect(getConnectionSpy).toHaveBeenCalledWith('default');

				// Check if the result is correct
				// expect(result).toBeInstanceOf(Bun.RedisClient);

				// Restore the original function
				getConnectionSpy.mockRestore();
			});
		});

		describe('setDefaultConnection', () => {
			it('should set the default connection', () => {
				const removeSpy = spyOn(Service, 'remove');
				const instanceSpy = spyOn(Service, 'instance');

				// Mock getConnection to return a mock connection
				const getConnectionSpy = spyOn(Redis, 'getConnection').mockReturnValue(mockRedisClient);

				// Call the function
				const result = Redis.setDefaultConnection('test');

				// Check if Service.remove was called with the correct connection name
				expect(removeSpy).toHaveBeenCalledWith('redis.connection.default');

				// Check if Service.instance was called with the correct parameters
				expect(instanceSpy).toHaveBeenCalledWith('redis.connection.default', mockRedisClient);

				// Check if getConnection was called with 'test'
				// expect(getConnectionSpy).toHaveBeenCalledWith('test');

				// Check if the result is correct
				expect(result).toBe(mockRedisClient);

				// Restore the original function
				getConnectionSpy.mockRestore();
			});
		});
	});

	describe('KeyvRedis', () => {
		let keyvRedis: KeyvRedis;

		beforeEach(() => {
			// Create a new KeyvRedis instance
			keyvRedis = new KeyvRedis({
				connection: 'test',
				namespace: 'test-namespace',
				keyPrefixSeparator: '::',
				clearBatchSize: 1000,
				useUnlink: true,
				noNamespaceAffectsAll: false
			});

			// Mock the client property to return the mock Redis client
			Object.defineProperty(keyvRedis, 'client', {
				get: () => mockRedisClient
			});
		});

		afterEach(() => {
			Event.clear();
		});

		it('should initialize with the correct options', () => {
			// Check if the options were set correctly
			expect(keyvRedis.namespace).toBe('test-namespace');
			expect(keyvRedis.opts).toEqual({
				namespace: 'test-namespace',
				keyPrefixSeparator: '::',
				clearBatchSize: 1000,
				noNamespaceAffectsAll: false,
				dialect: 'redis',
				url: 'test'
			});
		});

		it('should register an error handler', () => {
			// Create a spy on the EventEmitter.on method
			const onSpy = spyOn(EventEmitter.prototype, 'on');

			// Create a new KeyvRedis instance
			new KeyvRedis({ connection: 'test' });

			// Check if on was called with 'error'
			expect(onSpy).toHaveBeenCalledWith('error', expect.any(Function));

			// Restore the original method
			onSpy.mockRestore();
		});

		describe('get', () => {
			it('should get a value from Redis', async () => {
				// Call the method
				const result = await keyvRedis.get('test-key');

				// Check if client.get was called with the correct key
				expect(mockRedisClient.get).toHaveBeenCalledWith('test-namespace::test-key');

				// Check if the result is correct
				expect(result).toBe('test-value');
			});

			it('should return undefined if the value is null', async () => {
				// Mock client.get to return null
				(mockRedisClient.get as Mock<typeof mockRedisClient.get>).mockResolvedValueOnce(null);

				// Call the method
				const result = await keyvRedis.get('test-key');

				// Check if client.get was called with the correct key
				expect(mockRedisClient.get).toHaveBeenCalledWith('test-namespace::test-key');

				// Check if the result is correct
				expect(result).toBeUndefined();
			});
		});

		describe('set', () => {
			it('should set a value in Redis without TTL', async () => {
				// Call the method
				await keyvRedis.set('test-key', 'test-value');

				// Check if client.set was called with the correct parameters
				expect(mockRedisClient.set).toHaveBeenCalledWith('test-namespace::test-key', 'test-value');
			});

			it('should set a value in Redis with TTL', async () => {
				// Call the method
				await keyvRedis.set('test-key', 'test-value', 3600);

				// Check if client.set was called with the correct parameters
				expect(mockRedisClient.set).toHaveBeenCalledWith(
					'test-namespace::test-key',
					'test-value',
					'PX',
					3600
				);
			});
		});

		describe('delete', () => {
			it('should delete a value from Redis using UNLINK', async () => {
				(mockRedisClient.send as Mock<typeof mockRedisClient.send>).mockResolvedValueOnce(1);

				// Call the method
				const result = await keyvRedis.delete('test-key');

				// Check if client.send was called with the correct parameters
				expect(mockRedisClient.send).toHaveBeenCalledWith('UNLINK', ['test-namespace::test-key']);

				// Check if the result is correct
				expect(result).toBe(true);
			});

			it('should delete a value from Redis using DEL if useUnlink is false', async () => {
				// Create a new KeyvRedis instance with useUnlink set to false
				const keyvRedisWithoutUnlink = new KeyvRedis({
					connection: 'test',
					namespace: 'test-namespace',
					useUnlink: false
				});

				// Mock the client property to return the mock Redis client
				Object.defineProperty(keyvRedisWithoutUnlink, 'client', {
					get: () => mockRedisClient
				});

				// Call the method
				const result = await keyvRedisWithoutUnlink.delete('test-key');

				// Check if client.del was called with the correct parameters
				expect(mockRedisClient.del).toHaveBeenCalledWith('test-namespace::test-key');

				// Check if the result is correct
				expect(result).toBe(true);
			});
		});

		describe('has', () => {
			it('should check if a key exists in Redis', async () => {
				// Call the method
				const result = await keyvRedis.has('test-key');

				// Check if client.exists was called with the correct key
				expect(mockRedisClient.exists).toHaveBeenCalledWith('test-namespace::test-key');

				// Check if the result is correct
				expect(result).toBe(true);
			});
		});

		describe('getMany', () => {
			it('should get multiple values from Redis', async () => {
				// Call the method
				const result = await keyvRedis.getMany(['key1', 'key2']);

				// Check if client.mget was called with the correct keys
				expect(mockRedisClient.mget).toHaveBeenCalledWith(
					'test-namespace::key1',
					'test-namespace::key2'
				);

				// Check if the result is correct
				expect(result).toEqual(['value1', 'value2']);
			});

			it('should return an empty array if no keys are provided', async () => {
				(mockRedisClient.mget as Mock<typeof mockRedisClient.mget>).mockClear();

				// Call the method
				const result = await keyvRedis.getMany([]);

				// Check if client.mget was not called
				expect(mockRedisClient.mget).not.toHaveBeenCalled();

				// Check if the result is correct
				expect(result).toEqual([]);
			});
		});

		describe('createKeyPrefix', () => {
			it('should create a key with a namespace', () => {
				// Call the method
				const result = keyvRedis.createKeyPrefix('test-key', 'test-namespace');

				// Check if the result is correct
				expect(result).toBe('test-namespace::test-key');
			});

			it('should return the key as is if no namespace is provided', () => {
				// Call the method
				const result = keyvRedis.createKeyPrefix('test-key');

				// Check if the result is correct
				expect(result).toBe('test-key');
			});
		});

		describe('getKeyWithoutPrefix', () => {
			it('should remove the namespace from a key', () => {
				// Call the method
				const result = keyvRedis.getKeyWithoutPrefix('test-namespace::test-key', 'test-namespace');

				// Check if the result is correct
				expect(result).toBe('test-key');
			});

			it('should return the key as is if no namespace is provided', () => {
				// Call the method
				const result = keyvRedis.getKeyWithoutPrefix('test-key');

				// Check if the result is correct
				expect(result).toBe('test-key');
			});
		});
	});
});
