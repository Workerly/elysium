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

import type { DrizzleConfig } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import { drizzle } from 'drizzle-orm/bun-sql';

import { Service } from './service';

/**
 * Properties used to create a new database connection.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type DatabaseConnectionProps<
	TSchema extends Record<string, unknown> = Record<string, never>
> = DrizzleConfig<TSchema> &
	(
		| {
				connection:
					| string
					| ({
							url?: string;
					  } & Bun.SQLOptions);
		  }
		| {
				client: Bun.SQL;
		  }
	);

/**
 * A database connection.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type DatabaseConnection = BunSQLDatabase<Record<string, never>> & {
	$client: Bun.SQL;
};

export namespace Database {
	/**
	 * Creates a service name for a database connection.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param name The name of the connection.
	 * @returns A service name for the connection.
	 */
	const getConnectionName = (name: string) => {
		return `db.connection.${name}`;
	};

	/**
	 * Retrieves the connection with the given name.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param name The connection name.
	 * @returns The connection with the given name.
	 */
	export const getConnection = (name: string) => {
		if (!Service.exists(getConnectionName(name))) {
			// TODO: Use logger service here
			console.error(
				`No connection with name ${name} found. Please make sure to register the connection before using it.`
			);
			process.exit(1);
		}

		return Service.get<DatabaseConnection>(getConnectionName(name))!;
	};

	/**
	 * Creates and registers a new connection.
	 * @author Axel Nana <axel.nana@workbud.com>
	 *
	 * This will make the registered connection available for dependency injection with
	 * the key `db.connection.{name}`, where `{name}` is replaced with the given name.
	 *
	 * @param name The connection name.
	 * @param config The connection properties.
	 * @returns The newly created and registered connection.
	 */
	export const registerConnection = (name: string, config: DatabaseConnectionProps) => {
		if (Service.exists(getConnectionName(name))) {
			// TODO: Use logger service here
			console.error(`A connection with the name ${name} has already been registered.`);
			process.exit(1);
		}

		return Service.instance(getConnectionName(name), drizzle(config));
	};

	/**
	 * Checks if a connection with the given name exists.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param name The name of the connection to check.
	 * @returns `true` if the connection exists, `false` otherwise.
	 */
	export const connectionExists = (name: string) => {
		return Service.exists(getConnectionName(name));
	};

	/**
	 * Retrieves the default connection.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @returns The default connection.
	 */
	export const getDefaultConnection = () => {
		return getConnection('default');
	};

	/**
	 * Sets the default connection.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param name The name of the connection to set as default.
	 * @returns The default connection.
	 */
	export const setDefaultConnection = (name: string) => {
		const serviceName = getConnectionName('default');
		Service.remove(serviceName);
		return Service.instance(serviceName, getConnection(name));
	};
}
