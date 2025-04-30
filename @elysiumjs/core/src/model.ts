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

import type { PgColumn, PgColumnBuilderBase, PgSchema, PgTable } from 'drizzle-orm/pg-core';
import type { TSchema } from 'elysia';

import { getTableConfig, pgSchema, pgTable } from 'drizzle-orm/pg-core';
import { t } from 'elysia';

import { Application } from './app';

/**
 * Creates a validation schema from a Drizzle table.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param table The table to create the schema from.
 * @param options The schema generation options.
 * @returns A bew validation schema based on the given table.
 */
export const createSchemaFromDrizzle = (
	table: PgTable,
	{ mode = 'select' }: { mode?: 'create' | 'update' | 'select' } = {}
) => {
	const { columns } = getTableConfig(table);
	if (columns === undefined) return t.Object({});

	const properties: { [key: string]: TSchema } = {};

	for (const element of columns) {
		if (['create', 'update'].includes(mode) && element.primary) {
			continue;
		}

		properties[element.name] = parseTypes(element);

		if (!element.notNull) {
			properties[element.name] = t.Nullable(properties[element.name]);
		}

		if (mode === 'update' || element.hasDefault) {
			properties[element.name] = t.Optional(properties[element.name]);
		}
	}

	return t.Object(properties);
};

/**
 * Creates a validation schema from a Drizzle column.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param element The Drizzle column.
 * @returns A validation schema based on the given column.
 */
const parseTypes = (element: PgColumn) => {
	let type = (() => {
		switch (element.dataType) {
			case 'string':
				return t.String();
			case 'number':
				return t.Number();
			case 'boolean':
				return t.Boolean();
			case 'array':
				return t.Array(t.Any());
			case 'json':
				return t.Object({});
			case 'date':
			case 'localDate':
			case 'localDateTime':
				return t.Date();
			case 'bigint':
				return t.BigInt();
			case 'buffer':
				return t.File();
			default:
				return t.Never();
		}
	})();

	if (!element.notNull) {
		type = t.Optional(type);
	}

	return type;
};

/**
 * Type of a repository class.
 * @author Axel Nana <axel.nana@workbud.com>
 * @template TColumnsMap The table columns config.
 * @template TTable The drizzle's table schema wrapped by the repository.
 */
export type ModelClass<
	TTableName extends string,
	TColumnsMap extends Record<string, PgColumnBuilderBase>,
	TTable extends PgTable = ReturnType<typeof pgTable<string, TColumnsMap>>
> = {
	/**
	 * The data type returned by the select queries.
	 */
	readonly $inferSelect: TTable['$inferSelect'];

	/**
	 * The data type needed by the insert queries.
	 */
	readonly $inferInsert: TTable['$inferInsert'];

	/**
	 * The data type needed by the update queries.
	 */
	readonly $inferUpdate: Partial<TTable['$inferSelect']>;

	/**
	 * The drizzle's table schema wrapped by this model.
	 * Will be automatically wrapped by the `Tenancy.withTenant()` function when the current tenant is not `public`.
	 */
	readonly table: TTable;

	/**
	 * The name of the table wrapped by the model.
	 */
	readonly tableName: TTableName;

	/**
	 * The table columns configuration.
	 */
	readonly columns: TColumnsMap;

	/**
	 * The validation schema for creating records.
	 */
	readonly createSchema: TSchema;

	/**
	 * The validation schema for updating records.
	 */
	readonly updateSchema: TSchema;

	/**
	 * The validation schema for selecting records.
	 */
	readonly selectSchema: TSchema;

	/**
	 * Whether the model supports tenancy.
	 *
	 * Set it to `true` if the model supports tenancy. This means that the model will be
	 * wrapped by the `Tenancy.withTenant()` function when the current tenant is not `public`.
	 */
	readonly supportTenancy: boolean;

	/**
	 * Creates a new instance of the model.
	 * @param args The arguments to pass to the constructor.
	 * @returns A new instance of the model.
	 */
	new (...args: unknown[]): unknown;
};

/**
 * Mixin used to create a new model class.
 * @author Axel Nana <axel.nana@workbud.com>
 * @template TColumnsMap The table columns config.
 * @param tableName The name of the table.
 * @param columns The table columns configuration.
 */
export const Model = <
	TTableName extends string,
	TColumnsMap extends Record<string, PgColumnBuilderBase>
>(
	tableName: TTableName,
	columns: TColumnsMap
) => {
	const table = pgTable(tableName, columns);

	class M {
		/**
		 * The data type returned by the select queries.
		 */
		public static readonly $inferSelect = table.$inferSelect;

		/**
		 * The data type needed by the insert queries.
		 */
		public static readonly $inferInsert = table.$inferInsert;

		/**
		 * The data type needed by the update queries.
		 */
		public static readonly $inferUpdate: Partial<typeof table.$inferInsert> = table.$inferInsert;

		/**
		 * The drizzle's table schema wrapped by this model.
		 */
		public static get table(): ReturnType<typeof pgTable<TTableName, TColumnsMap>> {
			// If we are not inside an Application context, we can't use the tenancy system
			if (!Application.instance || !Application.context.getStore) {
				return table;
			}

			if (this.supportTenancy) {
				const tenant = Tenancy.getCurrentTenant() ?? 'public';
				// @ts-expect-error typeof this strangely doesn't match the ModelClass type
				return Tenancy.wrapTenant(tenant, this);
			}

			return table;
		}

		/**
		 * The name of the table wrapped by the model.
		 */
		public static readonly tableName: string = tableName;

		/**
		 * The table columns configuration.
		 */
		public static readonly columns: TColumnsMap = columns;

		/**
		 * The validation schema for creating records.
		 */
		public static readonly createSchema = createSchemaFromDrizzle(table, { mode: 'create' });

		/**
		 * The validation schema for updating records.
		 */
		public static readonly updateSchema = createSchemaFromDrizzle(table, { mode: 'update' });

		/**
		 * The validation schema for selecting records.
		 */
		public static readonly selectSchema = createSchemaFromDrizzle(table, { mode: 'select' });

		/**
		 * Whether the model supports tenancy.
		 *
		 * Set it to `true` if the model supports tenancy. This means that the model will be
		 * wrapped by the `Tenancy.withTenant()` function when the current tenant is not `public`.
		 */
		public static readonly supportTenancy: boolean = false;
	}

	return M;
};

/**
 * A map of tables registered for each tenant.
 * @author Axel Nana <axel.nana@workbud.com>
 */
const tenantSchemas: Map<string, PgTable> = new Map();

/**
 * A map of known tenant schemas.
 * @author Axel Nana <axel.nana@workbud.com>
 */
const schemaRegistry: Map<string, PgSchema> = new Map();

export namespace Tenancy {
	/**
	 * Gets the schema for the given tenant.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param tenant The name of the tenant.
	 * @returns The tenant schema for the given tenant.
	 */
	const getTenantSchema = (tenant: string) => {
		return schemaRegistry.get(tenant) ?? registerTenant(tenant);
	};

	/**
	 * Gets the name of the current tenant.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @returns The name of the current tenant, or `null` if no tenant is set.
	 */
	export const getCurrentTenant = (): string | null => {
		const store = Application.context.getStore();
		return (store?.get('tenant') ?? null) as string | null;
	};

	/**
	 * Sets the current tenant.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @template T The type of the model class to wrap with the tenant.
	 * @template TColumnsMap The table columns config.
	 * @param tenant The name of the tenant.
	 * @param model The model class that wraps the `PgTable`.
	 * @returns The drizzle's table schema wrapped by the tenant.
	 */
	export const wrapTenant = <
		T extends ModelClass<TTableName, TColumnsMap>,
		TTableName extends string = T extends ModelClass<infer TTableName, infer TColumnsMap>
			? TTableName
			: string,
		TColumnsMap extends Record<string, PgColumnBuilderBase> = T extends ModelClass<
			TTableName,
			infer TColumnsMap
		>
			? TColumnsMap
			: Record<string, PgColumnBuilderBase>
	>(
		tenant: string,
		model: T
	): ReturnType<typeof pgTable<TTableName, TColumnsMap>> => {
		if (tenant === 'public') {
			return pgTable(model.tableName, model.columns);
		}

		const tableName = `${tenant}.${model.tableName}`;
		if (tenantSchemas.has(tableName)) {
			return tenantSchemas.get(tableName)! as ReturnType<typeof pgTable<TTableName, TColumnsMap>>;
		}

		const tenantSchema = getTenantSchema(tenant);
		const schemaTable = tenantSchema.table(model.tableName, model.columns);
		tenantSchemas.set(tableName, schemaTable);

		return schemaTable as unknown as ReturnType<typeof pgTable<TTableName, TColumnsMap>>;
	};

	/**
	 * Registers a new tenant schema.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param tenant The name of the tenant.
	 * @returns A new schema for the given tenant.
	 */
	export const registerTenant = (tenant: string) => {
		if (schemaRegistry.has(tenant)) return schemaRegistry.get(tenant)!;

		const tenantSchema = pgSchema(tenant);
		schemaRegistry.set(tenant, tenantSchema);

		return tenantSchema;
	};

	/**
	 * Runs the given callback in a context with the given tenant.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param tenant The name of the tenant.
	 * @param callback The callback to run.
	 * @returns The result of the callback.
	 */
	export const withTenant = <TReturn>(tenant: string, callback: () => TReturn): TReturn => {
		const currentStore = Application.context.getStore();

		const newStore = new Map(currentStore);
		newStore.set('tenant', tenant);

		return Application.context.run(newStore, callback);
	};
}
