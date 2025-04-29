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

import type { PromptObject } from 'prompts';

import { join } from 'node:path';

import { Command, CommandArgumentType } from '@elysiumjs/core';
import prompts from 'prompts';
import { snake } from 'radash';
import formatter from 'string-template';

import { getModulePath, parseProjectConfig } from '../config';
import { getRootPath } from '../utils';

/**
 * Maker command for creating Elysium validators.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export class MakeValidatorCommand extends Command {
	public static readonly command: string = 'make:validator';
	public static readonly description: string = 'Creates a new validator.';

	@Command.arg({
		description: 'The name of the validator to create',
		type: CommandArgumentType.STRING
	})
	private name?: string;

	@Command.arg({
		description: 'The module where the validator will be created',
		type: CommandArgumentType.STRING
	})
	private module?: string;

	public async run(): Promise<void> {
		if (!this.name) {
			return this.setup();
		}

		const config = await parseProjectConfig();

		const answers: Record<string, any> = {
			module: this.module,
			name: this.name
		};

		if (!answers.module && !config.mono) {
			const module = await prompts({
				type: 'select',
				name: 'module',
				message: 'Module:',
				choices: Object.keys(config.modules ?? {}).map((moduleName) => ({
					title: moduleName,
					value: moduleName
				}))
			});

			answers.module = module.module;
		}

		return this.build(answers);
	}

	private async setup(): Promise<void> {
		const config = await parseProjectConfig();

		const items: PromptObject[] = [
			{
				type() {
					return config.mono ? null : 'select';
				},
				name: 'module',
				message: 'Module:',
				choices() {
					return Object.keys(config.modules ?? {}).map((moduleName) => ({
						title: moduleName,
						value: moduleName
					}));
				}
			},
			{
				type: 'text',
				name: 'name',
				message: 'Validator Name:',
				initial: 'LoginValidator',
				validate(value: string) {
					if (value.length < 1) {
						return 'Validator name cannot be empty';
					}

					return true;
				}
			}
		];

		const answers = await prompts(items);

		return this.build(answers);
	}

	private async build(answers: Record<string, any>): Promise<void> {
		if (!answers.name) {
			this.error('Operation cancelled.');
			return;
		}

		if (!answers.name.endsWith('Validator')) {
			answers.name += 'Validator';
		}

		if (!answers.request_name) {
			answers.request_name = answers.name.replace('Validator', 'Request');
		}

		// Get stub file
		const stubFile = Bun.file(join(getRootPath(), 'stubs/validator.stub'));

		// Format the stub content
		const stub = formatter(await stubFile.text(), answers);

		const path = answers.module ? await getModulePath(answers.module) : './src';

		// Write to file
		const name = snake(answers.name.replace('Validator', ''));
		const file = Bun.file(`${path}/validators/${name}.validator.ts`);
		await file.write(stub);

		this.success(`Validator ${this.bold(file.name!)} created successfully.`);
	}
}
