import 'reflect-metadata';

import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
	Mock,
	mock,
	spyOn
} from 'bun:test';
import { PgColumnBuilderBase, PgTable } from 'drizzle-orm/pg-core';
import { t } from 'elysia';

import { Application } from '../src/app';
import { createSchemaFromDrizzle, Model, ModelClass, Tenancy } from '../src/model';

// Mock dependencies
mock.module('drizzle-orm/pg-core', () => {
	// Mock column types
	const mockColumn = (name: string, config = {}) => ({
		name,
		...config
	});

	// Mock table config
	const mockTableConfig = {
		columns: [
			mockColumn('id', { primary: true, notNull: true, dataType: 'number' }),
			mockColumn('name', { notNull: true, dataType: 'string' }),
			mockColumn('email', { notNull: true, dataType: 'string' }),
			mockColumn('age', { notNull: false, dataType: 'number' }),
			mockColumn('isActive', { notNull: true, dataType: 'boolean', hasDefault: true }),
			mockColumn('metadata', { notNull: false, dataType: 'json' }),
			mockColumn('createdAt', { notNull: true, dataType: 'date', hasDefault: true }),
			mockColumn('tags', { notNull: false, dataType: 'array' })
		]
	};

	return {
		pgTable: mock((name, columns) => ({
			$inferSelect: {},
			$inferInsert: {},
			tableName: name,
			columns
		})),
		pgSchema: mock((name) => ({
			table: mock((tableName, columns) => ({
				$inferSelect: {},
				$inferInsert: {},
				tableName: `${name}.${tableName}`,
				columns
			}))
		})),
		getTableConfig: mock(() => mockTableConfig)
	};
});

const mockStore = new Map([['tenant', 'test-tenant']]);
const mockGetStore = mock(() => mockStore);
mock.module('../src/app', () => ({
	Application: {
		...Application,
		context: {
			getStore: mockGetStore
		}
	}
}));

describe('Model', () => {
	beforeEach(() => {
		mock.restore();
	});

	afterEach(() => {
		mock.restore();
	});

	describe('createSchemaFromDrizzle', () => {
		it('should create a schema for select mode', async () => {
			// Import the mocked modules
			const { getTableConfig } = await import('drizzle-orm/pg-core');

			// Create a mock table
			const mockTable = { tableName: 'users' } as unknown as PgTable;

			// Create a spy on t.Object
			const objectSpy = spyOn(t, 'Object');

			// Call the function
			createSchemaFromDrizzle(mockTable, { mode: 'select' });

			// Check if getTableConfig was called with the mock table
			expect(getTableConfig).toHaveBeenCalledWith(mockTable);

			// Check if t.Object was called with the correct properties
			expect(objectSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					id: expect.any(Object),
					name: expect.any(Object),
					email: expect.any(Object),
					age: expect.any(Object),
					isActive: expect.any(Object),
					metadata: expect.any(Object),
					createdAt: expect.any(Object),
					tags: expect.any(Object)
				})
			);

			// Restore the spy
			objectSpy.mockRestore();
		});

		it('should create a schema for create mode', async () => {
			// Import the mocked modules
			const { getTableConfig } = await import('drizzle-orm/pg-core');

			// Create a mock table
			const mockTable = { tableName: 'users' } as unknown as PgTable;

			// Create a spy on t.Object
			const objectSpy = spyOn(t, 'Object');

			// Call the function
			createSchemaFromDrizzle(mockTable, { mode: 'create' });

			// Check if getTableConfig was called with the mock table
			expect(getTableConfig).toHaveBeenCalledWith(mockTable);

			// Check if t.Object was called with the correct properties (excluding primary key)
			expect(objectSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					name: expect.any(Object),
					email: expect.any(Object),
					age: expect.any(Object),
					isActive: expect.any(Object),
					metadata: expect.any(Object),
					createdAt: expect.any(Object),
					tags: expect.any(Object)
				})
			);

			// Check that the primary key is not included
			expect(objectSpy).not.toHaveBeenCalledWith(
				expect.objectContaining({
					id: expect.any(Object)
				})
			);

			// Restore the spy
			objectSpy.mockRestore();
		});

		it('should create a schema for update mode', async () => {
			// Import the mocked modules
			const { getTableConfig } = await import('drizzle-orm/pg-core');

			// Create a mock table
			const mockTable = { tableName: 'users' } as unknown as PgTable;

			// Create a spy on t.Object
			const objectSpy = spyOn(t, 'Object');

			// Call the function
			createSchemaFromDrizzle(mockTable, { mode: 'update' });

			// Check if getTableConfig was called with the mock table
			expect(getTableConfig).toHaveBeenCalledWith(mockTable);

			// Check if t.Object was called with the correct properties (excluding primary key)
			expect(objectSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					name: expect.any(Object),
					email: expect.any(Object),
					age: expect.any(Object),
					isActive: expect.any(Object),
					metadata: expect.any(Object),
					createdAt: expect.any(Object),
					tags: expect.any(Object)
				})
			);

			// Check that the primary key is not included
			expect(objectSpy).not.toHaveBeenCalledWith(
				expect.objectContaining({
					id: expect.any(Object)
				})
			);

			// Restore the spy
			objectSpy.mockRestore();
		});

		it('should return an empty object if columns are undefined', async () => {
			// Import the mocked modules
			const { getTableConfig } = await import('drizzle-orm/pg-core');

			// Mock getTableConfig to return undefined columns
			// @ts-expect-error Mocking headaches
			(getTableConfig as Mock<typeof getTableConfig>).mockReturnValueOnce({ columns: undefined });

			// Create a mock table
			const mockTable = { tableName: 'users' } as unknown as PgTable;

			// Create a spy on t.Object
			const objectSpy = spyOn(t, 'Object');

			// Call the function
			createSchemaFromDrizzle(mockTable);

			// Check if getTableConfig was called with the mock table
			expect(getTableConfig).toHaveBeenCalledWith(mockTable);

			// Check if t.Object was called with an empty object
			expect(objectSpy).toHaveBeenCalledWith({});

			// Restore the spy
			objectSpy.mockRestore();
		});
	});

	describe('Model mixin', () => {
		it('should create a model class with the correct properties', async () => {
			// Import the mocked modules
			const { pgTable } = await import('drizzle-orm/pg-core');

			// Create a mock columns configuration
			const mockColumns = {
				id: { name: 'id', dataType: 'number' },
				name: { name: 'name', dataType: 'string' }
			} as unknown as Record<string, PgColumnBuilderBase>;

			// Create a model class
			const UserModel = Model('users', mockColumns);

			// Check if pgTable was called with the correct parameters
			expect(pgTable).toHaveBeenCalledWith('users', mockColumns);

			// Check if the model class has the correct static properties
			expect(UserModel.tableName).toBe('users');
			expect(UserModel.columns).toBe(mockColumns);
			expect(UserModel.createSchema).toBeDefined();
			expect(UserModel.updateSchema).toBeDefined();
			expect(UserModel.selectSchema).toBeDefined();
			expect(UserModel.supportTenancy).toBe(false);
			expect(UserModel.$inferSelect).toBeDefined();
			expect(UserModel.$inferInsert).toBeDefined();
			expect(UserModel.$inferUpdate).toBeDefined();
		});
	});

	describe('Tenancy', () => {
		it('should get the current tenant', () => {
			// Call the function
			const tenant = Tenancy.getCurrentTenant();

			// Check if Application.context.getStore was called
			expect(mockGetStore).toHaveBeenCalled();

			// Check if the tenant is correct
			expect(tenant).toBe('test-tenant');
		});

		it('should return null if no tenant is set', () => {
			// Mock getStore to return a map without a tenant
			mockGetStore.mockReturnValueOnce(new Map());

			// Call the function
			const tenant = Tenancy.getCurrentTenant();

			// Check if Application.context.getStore was called
			expect(mockGetStore).toHaveBeenCalled();

			// Check if the tenant is null
			expect(tenant).toBeNull();
		});

		it('should register a new tenant schema', async () => {
			// Import the mocked modules
			const { pgSchema } = await import('drizzle-orm/pg-core');

			// Call the function
			const schema = Tenancy.registerTenant('new-tenant');

			// Check if pgSchema was called with the correct tenant name
			expect(pgSchema).toHaveBeenCalledWith('new-tenant');

			// Check if the schema is correct
			expect(schema).toBeDefined();
		});

		it('should wrap a model with a tenant schema', async () => {
			// Import the mocked modules
			const { pgTable, pgSchema } = await import('drizzle-orm/pg-core');

			// Create a mock model
			const mockModel = {
				tableName: 'users',
				columns: {
					id: { name: 'id', dataType: 'number' },
					name: { name: 'name', dataType: 'string' }
				},
				supportTenancy: true
			} as ModelClass<any>;

			// Call the function with a non-public tenant
			const table = Tenancy.withTenant('test-tenant', mockModel);

			// Check if pgSchema was called with the correct tenant name
			expect(pgSchema).toHaveBeenCalledWith('test-tenant');

			// Check if the table is correct
			expect(table).toBeDefined();

			// Call the function with the public tenant
			const publicTable = Tenancy.withTenant('public', mockModel);

			// Check if pgTable was called with the correct parameters
			expect(pgTable).toHaveBeenCalledWith('users', mockModel.columns);

			// Check if the table is correct
			expect(publicTable).toBeDefined();
		});

		it('should reuse existing tenant schemas', async () => {
			// Import the mocked modules
			const { pgSchema } = await import('drizzle-orm/pg-core');

			// Register a tenant schema
			Tenancy.registerTenant('existing-tenant');

			// Reset the mock to check if it's called again
			(pgSchema as Mock<typeof pgSchema>).mockClear();

			// Call the function with the same tenant
			const schema = Tenancy.registerTenant('existing-tenant');

			// Check if pgSchema was not called again
			expect(pgSchema).not.toHaveBeenCalled();

			// Check if the schema is correct
			expect(schema).toBeDefined();
		});

		it('should reuse existing tenant tables', async () => {
			// Import the mocked modules
			const { pgSchema } = await import('drizzle-orm/pg-core');

			// Create a mock model
			const mockModel = {
				tableName: 'users',
				columns: {
					id: { name: 'id', dataType: 'number' },
					name: { name: 'name', dataType: 'string' }
				},
				supportTenancy: true
			} as ModelClass<any>;

			// Call the function with a tenant
			Tenancy.withTenant('cache-tenant', mockModel);

			// Reset the mock to check if it's called again
			(pgSchema as Mock<typeof pgSchema>).mockClear();

			// Call the function with the same tenant and model
			Tenancy.withTenant('cache-tenant', mockModel);

			// Check if pgSchema was not called again
			expect(pgSchema).not.toHaveBeenCalled();
		});
	});
});
