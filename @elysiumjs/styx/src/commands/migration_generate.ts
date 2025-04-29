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

import { exists } from 'node:fs/promises';

import { Command, CommandArgumentType } from '@elysiumjs/core';
import prompts from 'prompts';

/**
 * Generates migration files.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export class MigrationGenerateCommand extends Command {
	public static readonly command: string = 'migration:generate';
	public static readonly description: string = 'Generates migration files.';

	@Command.arg({
		description: 'The name of the migration to create',
		type: CommandArgumentType.STRING
	})
	private name?: string;

	public async run(): Promise<void> {
		if (!this.name) {
			const answers = await prompts([
				{
					type: 'text',
					name: 'name',
					message: 'Migration Name:',
					initial: 'create_users_table',
					validate(value: string) {
						if (value.length < 1) {
							return 'Migration name cannot be empty';
						}

						return true;
					}
				}
			]);

			this.name = answers.name;
		}

		let schemaPath = `./src/database/schemas`;
		if (await exists(`${process.cwd()}/src/database/schema.ts`)) {
			schemaPath = `./src/database/schema.ts`;
		}

		await Bun.$`bunx --bun drizzle-kit generate --dialect postgresql --schema ${schemaPath} --out ./src/database/migrations --prefix timestamp --name ${this.name}`;

		const sqlFiles = new Bun.Glob(`${process.cwd()}/src/database/migrations/**/*.sql`).scan();
		for await (const path of sqlFiles) {
			const file = Bun.file(path);
			const content = await file.text();
			await file.write(content.replace(/"public"./gm, ''));
		}
	}
}
