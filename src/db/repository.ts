import type { AnyPgTable, PgTableWithColumns, TableConfig } from 'drizzle-orm/pg-core';

import { eq } from 'drizzle-orm';

import { Connection } from './connection';

/**
 * Database's primary column type.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type IdType = number | string;

/**
 * Mixin used to create a new repository class over a drizzle schema.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param table The drizzle's table schema to use internally.
 */
export const Repository = <
	T extends PgTableWithColumns<TConfig>,
	TId extends IdType = string,
	TConfig extends TableConfig = T extends PgTableWithColumns<infer TConfig> ? TConfig : TableConfig,
	TInsert extends Record<string, unknown> = T['$inferInsert'],
	TUpdate = T['$inferUpdate']
>(
	table: T
) => {
	class R {
		/**
		 * The drizzle's table schema wrapped by this repository.
		 */
		public static readonly table: T = table;

		/**
		 * The database connection name to use.
		 *
		 * Update this value to change the database connection used by this repository.
		 */
		public static readonly connection: string = 'default';

		/**
		 * The database connection used by this repository.
		 */
		public get db() {
			return Connection.get(R.connection);
		}

		/**
		 * Retrieves all the records in the database.
		 * @returns All the records in the database.
		 */
		public all() {
			return this.db.select().from(table as AnyPgTable);
		}

		/**
		 * Retrieves a record by its id.
		 * @param id The id of the record to retrieve.
		 * @returns The record with the given id.
		 */
		public find(id: TId) {
			return this.db
				.select()
				.from(table as AnyPgTable)
				.where(eq(R.table.id, id));
		}

		/**
		 * Inserts a new record in the database.
		 * @param data The data to insert.
		 * @returns The inserted record.
		 */
		public insert(data: TInsert) {
			return this.db.insert(table).values(data).returning();
		}

		/**
		 * Updates a record in the database.
		 * @param id The id of the record to update.
		 * @param data The data to update.
		 * @returns The updated record.
		 */
		public update(id: TId, data: TUpdate) {
			return this.db.update(table).set(data).where(eq(table.id, id)).returning();
		}

		/**
		 * Updates all the records in the database.
		 * @param data The data to update.
		 * @returns The updated records.
		 */
		public updateAll(data: TUpdate) {
			return this.db.update(table).set(data).returning();
		}

		/**
		 * Deletes a record from the database.
		 * @param id The ID of the record to delete.
		 * @returns The deleted record.
		 */
		public delete(id: TId) {
			return this.db.delete(table).where(eq(R.table.id, id)).returning();
		}

		/**
		 * Deletes all the records from the database.
		 * @returns All the records in the database.
		 */
		public deleteAll() {
			return this.db.delete(table).returning();
		}
	}

	return R;
};
