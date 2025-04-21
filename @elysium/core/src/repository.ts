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

// @ts-nocheck

import type { PgColumnBuilderBase } from 'drizzle-orm/pg-core';
import type { Class } from 'type-fest';
import type { DatabaseConnection } from './database';
import type { ModelClass } from './model';

import { eq } from 'drizzle-orm';
import { pgTable } from 'drizzle-orm/pg-core';

import { Application } from './app';
import { Database } from './database';
import { Tenancy } from './model';

/**
 * Database's primary column type.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type IdType = number | string;

/**
 * Interface of a repository.
 * @author Axel Nana <axel.nana@workbud.com>
 * @template TModel The type of the model class wrapped by the repository.
 * @template TId The primary column type.
 * @template TColumnsMap The table columns config.
 */
export interface RepositoryInterface<
	TModel extends ModelClass<TColumnsMap>,
	TId extends IdType = string,
	TColumnsMap extends Record<string, PgColumnBuilderBase> = TModel extends ModelClass<
		infer TColumnsMap
	>
		? TColumnsMap
		: Record<string, PgColumnBuilderBase>
> {
	/**
	 * Retrieves all the records in the database.
	 * @returns All the records in the database.
	 */
	all(): Promise<TModel['$inferSelect'][]>;

	/**
	 * Retrieves a record by its id.
	 * @param id The id of the record to retrieve.
	 * @returns The record with the given id.
	 */
	find(id: TId): Promise<TModel['$inferSelect'] | null>;

	/**
	 * Inserts a new record in the database.
	 * @param data The data to insert.
	 * @returns The inserted record.
	 */
	insert(data: TModel['$inferInsert']): Promise<TModel['$inferSelect']>;

	/**
	 * Updates a record in the database.
	 * @param id The id of the record to update.
	 * @param data The data to update.
	 * @returns The updated record.
	 */
	update(id: TId, data: TModel['$inferUpdate']): Promise<TModel['$inferSelect']>;

	/**
	 * Updates all the records in the database.
	 * @param data The data to update.
	 * @returns The updated records.
	 */
	updateAll(data: TModel['$inferUpdate']): Promise<TModel['$inferSelect'][]>;

	/**
	 * Deletes a record from the database.
	 * @param id The ID of the record to delete.
	 * @returns The deleted record.
	 */
	delete(id: TId): Promise<TModel['$inferSelect']>;

	/**
	 * Deletes all the records from the database.
	 * @returns All the records in the database.
	 */
	deleteAll(): Promise<TModel['$inferSelect'][]>;
}

/**
 * Type of a repository class.
 * @author Axel Nana <axel.nana@workbud.com>
 * @template TModel The type of the model class wrapped by the repository.
 * @template TId The primary column type.
 * @template TColumnsMap The table columns config.
 */
export type RepositoryClass<
	TModel extends ModelClass<TColumnsMap>,
	TId extends IdType = string,
	TColumnsMap extends Record<string, PgColumnBuilderBase> = TModel extends ModelClass<
		infer TColumnsMap
	>
		? TColumnsMap
		: Record<string, PgColumnBuilderBase>
> = Class<RepositoryInterface<TModel, TId, TColumnsMap>> & {
	/**
	 * The drizzle's table schema wrapped by the repository.
	 */
	readonly Model: TModel;

	/**
	 * The database connection name to use in the repository.
	 *
	 * Update this value to change the database connection used by this repository.
	 */
	readonly connection: string;
};

/**
 * Mixin used to create a new repository class over a model.
 * @author Axel Nana <axel.nana@workbud.com>
 * @template TModel The type of the model class wrapped by the repository.
 * @template TId The primary column type.
 * @template TColumnsMap The table columns config.
 * @template model The model class wrapped by the repository.
 */
export const Repository = <
	TModel extends ModelClass<TColumnsMap>,
	TId extends IdType = string,
	TColumnsMap extends Record<string, PgColumnBuilderBase> = TModel extends ModelClass<
		infer TColumnsMap
	>
		? TColumnsMap
		: Record<string, PgColumnBuilderBase>
>(
	model: TModel
) => {
	type TSelect = TModel['$inferSelect'];
	type TInsert = TModel['$inferInsert'];
	type TUpdate = TModel['$inferUpdate'];

	const table = pgTable(model.tableName, model.columns);

	class R implements RepositoryInterface<TModel, TId, TColumnsMap> {
		/**
		 * The drizzle's table schema wrapped by this repository.
		 */
		public static readonly Model: TModel = model;

		/**
		 * The database connection name to use.
		 *
		 * Update this value to change the database connection used by this repository.
		 */
		public static readonly connection: string = 'default';

		/**
		 * The database connection used by this repository.
		 */
		public get db(): DatabaseConnection {
			const connection = (this.constructor as RepositoryClass<TModel, TId, TColumnsMap>).connection;
			let db: DatabaseConnection | null = null;

			if (connection === 'default') {
				db = (Application.context.getStore()?.get('db:tx') as DatabaseConnection) ?? null;
			}

			return db ?? Database.getConnection(connection);
		}

		/**
		 * The drizzle's table schema wrapped by this repository.
		 */
		public static get table() {
			if (model.supportTenancy) {
				const tenant = Tenancy.getCurrentTenant() ?? 'public';
				return Tenancy.withTenant(tenant, model);
			}

			return table;
		}

		/**
		 * Retrieves all the records in the database.
		 * @returns All the records in the database.
		 */
		public async all(): Promise<TSelect[]> {
			return await this.db.select().from(R.table);
		}

		/**
		 * Retrieves a record by its id.
		 * @param id The id of the record to retrieve.
		 * @returns The record with the given id.
		 */
		public async find(id: TId): Promise<TSelect | null> {
			const [row] = await this.db.select().from(R.table).where(eq(R.table.id, id));
			return (row ?? null) as TSelect | null;
		}

		/**
		 * Inserts a new record in the database.
		 * @param data The data to insert.
		 * @returns The inserted record.
		 */
		public async insert(data: TInsert): Promise<TSelect> {
			const [row] = await this.db.insert(R.table).values(data).returning();
			return row as TSelect;
		}

		/**
		 * Updates a record in the database.
		 * @param id The id of the record to update.
		 * @param data The data to update.
		 * @returns The updated record.
		 */
		public async update(id: TId, data: TUpdate): Promise<TSelect> {
			const [row] = await this.db.update(R.table).set(data).where(eq(R.table.id, id)).returning();
			return row as TSelect;
		}

		/**
		 * Updates all the records in the database.
		 * @param data The data to update.
		 * @returns The updated records.
		 */
		public async updateAll(data: TUpdate): Promise<TSelect[]> {
			return await this.db.update(R.table).set(data).returning();
		}

		/**
		 * Deletes a record from the database.
		 * @param id The ID of the record to delete.
		 * @returns The deleted record.
		 */
		public async delete(id: TId): Promise<TSelect> {
			const [row] = await this.db.delete(R.table).where(eq(R.table.id, id)).returning();
			return row as TSelect;
		}

		/**
		 * Deletes all the records from the database.
		 * @returns All the records in the database.
		 */
		public async deleteAll(): Promise<TSelect[]> {
			return await this.db.delete(R.table).returning();
		}
	}

	return R;
};
