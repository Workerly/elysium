import type { AnyPgTable, PgTableWithColumns, TableConfig } from 'drizzle-orm/pg-core';

import { eq } from 'drizzle-orm';

import { Connection } from './connection';

/**
 * Database's primary column type.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type IdType = number | string;

/**
 * Interface of a repository.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param T The drizzle's table schema.
 * @param TId The primary column type.
 * @param TSelect The type returned when selecting records.
 * @param TInsert The type needed when inserting records.
 * @param TUpdate The type needed when updating records.
 * @param TConfig The table config.
 */
export interface RepositoryInterface<
	T extends PgTableWithColumns<TConfig>,
	TId extends IdType = string,
	TSelect extends T['$inferSelect'] = T['$inferSelect'],
	TInsert extends T['$inferInsert'] = T['$inferInsert'],
	TUpdate extends Partial<TSelect> = Partial<TSelect>,
	TConfig extends TableConfig = T extends PgTableWithColumns<infer TConfig> ? TConfig : TableConfig
> {
	/**
	 * Retrieves all the records in the database.
	 * @returns All the records in the database.
	 */
	all(): Promise<TSelect[]>;

	/**
	 * Retrieves a record by its id.
	 * @param id The id of the record to retrieve.
	 * @returns The record with the given id.
	 */
	find(id: TId): Promise<TSelect | null>;

	/**
	 * Inserts a new record in the database.
	 * @param data The data to insert.
	 * @returns The inserted record.
	 */
	insert(data: TInsert): Promise<TSelect>;

	/**
	 * Updates a record in the database.
	 * @param id The id of the record to update.
	 * @param data The data to update.
	 * @returns The updated record.
	 */
	update(id: TId, data: TUpdate): Promise<TSelect>;

	/**
	 * Updates all the records in the database.
	 * @param data The data to update.
	 * @returns The updated records.
	 */
	updateAll(data: TUpdate): Promise<TSelect[]>;

	/**
	 * Deletes a record from the database.
	 * @param id The ID of the record to delete.
	 * @returns The deleted record.
	 */
	delete(id: TId): Promise<TSelect>;

	/**
	 * Deletes all the records from the database.
	 * @returns All the records in the database.
	 */
	deleteAll(): Promise<TSelect[]>;
}

/**
 * Type of a repository class.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param T The drizzle's table schema.
 * @param TId The primary column type.
 * @param TSelect The type returned when selecting records.
 * @param TInsert The type needed when inserting records.
 * @param TUpdate The type needed when updating records.
 * @param TConfig The table config.
 */
export type RepositoryClass<
	T extends PgTableWithColumns<TConfig>,
	TId extends IdType = string,
	TSelect extends T['$inferSelect'] = T['$inferSelect'],
	TInsert extends T['$inferInsert'] = T['$inferInsert'],
	TUpdate extends Partial<TSelect> = Partial<TSelect>,
	TConfig extends TableConfig = T extends PgTableWithColumns<infer TConfig> ? TConfig : TableConfig
> = {
	/**
	 * The drizzle's table schema wrapped by the repository.
	 */
	readonly table: T;

	/**
	 * The database connection name to use in the repository.
	 *
	 * Update this value to change the database connection used by this repository.
	 */
	readonly connection: string;

	/**
	 * Creates a new instance of the repository.
	 * @param args The arguments to pass to the constructor.
	 * @returns A new instance of the repository.
	 */
	new (...args: unknown[]): RepositoryInterface<T, TId, TSelect, TInsert, TUpdate, TConfig>;
};

/**
 * Mixin used to create a new repository class over a drizzle schema.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param T The drizzle's table schema.
 * @param TId The primary column type.
 * @param TSelect The type returned when selecting records.
 * @param TInsert The type needed when inserting records.
 * @param TUpdate The type needed when updating records.
 * @param TConfig The table config.
 * @param table The drizzle's table schema to use internally.
 */
export const Repository = <
	T extends PgTableWithColumns<TConfig>,
	TId extends IdType = string,
	TSelect extends T['$inferSelect'] = T['$inferSelect'],
	TInsert extends T['$inferInsert'] = T['$inferInsert'],
	TUpdate extends Partial<TSelect> = Partial<TSelect>,
	TConfig extends TableConfig = T extends PgTableWithColumns<infer TConfig> ? TConfig : TableConfig
>(
	table: T
) => {
	class R implements RepositoryInterface<T, TId, TSelect, TInsert, TUpdate, TConfig> {
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
			return Connection.get(
				(this.constructor as RepositoryClass<T, TId, TSelect, TInsert, TUpdate, TConfig>).connection
			);
		}

		/**
		 * Retrieves all the records in the database.
		 * @returns All the records in the database.
		 */
		public async all(): Promise<TSelect[]> {
			const r = await this.db.select().from(table as AnyPgTable);
			return r as TSelect[];
		}

		/**
		 * Retrieves a record by its id.
		 * @param id The id of the record to retrieve.
		 * @returns The record with the given id.
		 */
		public async find(id: TId): Promise<TSelect | null> {
			const r = await this.db
				.select()
				.from(table as AnyPgTable)
				.where(eq(R.table.id, id));
			return (r[0] ?? null) as TSelect | null;
		}

		/**
		 * Inserts a new record in the database.
		 * @param data The data to insert.
		 * @returns The inserted record.
		 */
		public async insert(data: TInsert): Promise<TSelect> {
			const r = await this.db
				.insert(table)
				.values(data as any)
				.returning();
			return r[0] as TSelect;
		}

		/**
		 * Updates a record in the database.
		 * @param id The id of the record to update.
		 * @param data The data to update.
		 * @returns The updated record.
		 */
		public async update(id: TId, data: TUpdate): Promise<TSelect> {
			const r = await this.db.update(table).set(data).where(eq(table.id, id)).returning();
			return r[0] as TSelect;
		}

		/**
		 * Updates all the records in the database.
		 * @param data The data to update.
		 * @returns The updated records.
		 */
		public async updateAll(data: TUpdate): Promise<TSelect[]> {
			const r = await this.db.update(table).set(data).returning();
			return r as TSelect[];
		}

		/**
		 * Deletes a record from the database.
		 * @param id The ID of the record to delete.
		 * @returns The deleted record.
		 */
		public async delete(id: TId): Promise<TSelect> {
			const r = await this.db.delete(table).where(eq(R.table.id, id)).returning();
			return r[0] as TSelect;
		}

		/**
		 * Deletes all the records from the database.
		 * @returns All the records in the database.
		 */
		public async deleteAll(): Promise<TSelect[]> {
			const r = await this.db.delete(table).returning();
			return r as unknown as TSelect[];
		}
	}

	return R;
};
