import 'reflect-metadata';

import { afterEach, beforeEach, describe, expect, it, jest, Mock, mock, spyOn } from 'bun:test';

import { Database, DatabaseConnection } from '../../src/core/database';
import { Service } from '../../src/core/service';

// Mock dependencies
mock.module('../../src/core/service', () => ({
	Service: {
		instance: mock(Service.instance),
		get: mock(Service.get),
		exists: mock(Service.exists),
		remove: mock(Service.remove)
	}
}));

// Mock drizzle function
mock.module('drizzle-orm/bun-sql', () => ({
	drizzle: mock(() => ({ mockDrizzleInstance: true }))
}));

describe('Database namespace', () => {
	// Mock console.error and process.exit to prevent actual console output and process exit
	const originalConsoleError = console.error;
	const originalProcessExit = process.exit;

	beforeEach(() => {
		console.error = mock();
		process.exit = mock() as any;
	});

	afterEach(() => {
		console.error = originalConsoleError;
		process.exit = originalProcessExit;
		jest.clearAllMocks();
	});

	describe('registerConnection', () => {
		it('should register a new connection', () => {
			// Mock Service.exists to return false (connection doesn't exist)
			(Service.exists as Mock<typeof Service.exists>).mockReturnValueOnce(false);

			// Call the function
			const result = Database.registerConnection('test', { connection: 'sqlite:test.db' });

			// Check if Service.exists was called with the correct connection name
			expect(Service.exists).toHaveBeenCalledWith('db.connection.test');

			// Check if Service.instance was called with the correct parameters
			expect(Service.instance).toHaveBeenCalledWith('db.connection.test', {
				mockDrizzleInstance: true
			});

			// Check if the result is correct
			expect(result as any).toEqual({ mockDrizzleInstance: true });
		});

		it('should throw an error if the connection already exists', () => {
			// Mock Service.exists to return true (connection exists)
			(Service.exists as Mock<typeof Service.exists>).mockReturnValue(true);

			// Call the function
			Database.registerConnection('test', { connection: 'sqlite:test.db' });

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
			(Service.exists as Mock<typeof Service.exists>).mockReturnValue(true);

			// Mock Service.get to return a mock connection
			const mockConnection = { mockConnection: true };
			(Service.get as any).mockReturnValue(mockConnection);

			// Call the function
			const result = Database.getConnection('test');

			// Check if Service.exists was called with the correct connection name
			expect(Service.exists).toHaveBeenCalledWith('db.connection.test');

			// Check if Service.get was called with the correct connection name
			expect(Service.get).toHaveBeenCalledWith('db.connection.test');

			// Check if the result is correct
			expect(result as any).toEqual(mockConnection);
		});

		it('should throw an error if the connection does not exist', () => {
			// Mock Service.exists to return false (connection doesn't exist)
			(Service.exists as Mock<typeof Service.exists>).mockReturnValue(false);

			// Call the function
			Database.getConnection('test');

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
			(Service.exists as Mock<typeof Service.exists>).mockReturnValue(true);

			// Call the function
			const result = Database.connectionExists('test');

			// Check if Service.exists was called with the correct connection name
			expect(Service.exists).toHaveBeenCalledWith('db.connection.test');

			// Check if the result is correct
			expect(result).toBe(true);
		});

		it('should return false if the connection does not exist', () => {
			// Mock Service.exists to return false
			(Service.exists as Mock<typeof Service.exists>).mockReturnValue(false);

			// Call the function
			const result = Database.connectionExists('test');

			// Check if Service.exists was called with the correct connection name
			expect(Service.exists).toHaveBeenCalledWith('db.connection.test');

			// Check if the result is correct
			expect(result).toBe(false);
		});
	});

	describe('getDefaultConnection', () => {
		it('should retrieve the default connection', () => {
			// Mock getConnection to return a mock connection
			const mockConnection = { mockConnection: true };
			const getConnectionSpy = spyOn(Database, 'getConnection').mockReturnValue(
				mockConnection as unknown as DatabaseConnection
			);

			// Call the function
			const result = Database.getDefaultConnection();

			// Check if getConnection was called with 'default'
			expect(getConnectionSpy).toHaveBeenCalledWith('default');

			// Check if the result is correct
			expect(result as any).toEqual(mockConnection);

			// Restore the original function
			getConnectionSpy.mockRestore();
		});
	});

	describe('setDefaultConnection', () => {
		it('should set the default connection', () => {
			// Mock getConnection to return a mock connection
			const mockConnection = { mockConnection: true };
			const getConnectionSpy = spyOn(Database, 'getConnection').mockReturnValue(
				mockConnection as unknown as DatabaseConnection
			);

			// Call the function
			const result = Database.setDefaultConnection('test');

			// Check if Service.remove was called with the correct connection name
			expect(Service.remove).toHaveBeenCalledWith('db.connection.default');

			// Check if Service.instance was called with the correct parameters
			expect(Service.instance).toHaveBeenCalledWith('db.connection.default', mockConnection);

			// Check if getConnection was called with 'test'
			expect(getConnectionSpy).toHaveBeenCalledWith('test');

			// Check if the result is correct
			expect(result as any).toEqual(mockConnection);

			// Restore the original function
			getConnectionSpy.mockRestore();
		});
	});
});
