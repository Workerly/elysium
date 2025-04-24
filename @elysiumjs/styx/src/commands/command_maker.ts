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

import { parseArgs } from 'node:util';

import prompts from 'prompts';
import { isEmpty, pascal, snake } from 'radash';
import formatter from 'string-template';

import { getModulePath, parseProjectConfig } from '../config';
import { Maker } from './maker';

/**
 * Maker class for creating Elysium commands.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export class CommandMaker extends Maker {
	public static readonly instance = new CommandMaker();

	private constructor() {
		super('command');
	}

	public async run(args: string[]): Promise<boolean> {
		if (isEmpty(args)) {
			return this.setup();
		}

		const config = await parseProjectConfig();

		const { values, positionals } = parseArgs({
			args,
			allowPositionals: true,
			options: {
				module: {
					type: 'string',
					short: 'm'
				},
				command: {
					type: 'string',
					short: 'c'
				},
				description: {
					type: 'string',
					short: 'd'
				}
			}
		});

		if (positionals.length < 1) {
			return this.setup();
		}

		const answers: Record<string, any> = {
			module: values.module,
			name: positionals[0],
			command: values.command,
			description: values.description
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

		return this.write(answers);
	}

	private async setup(): Promise<boolean> {
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
				name: 'command',
				message: 'Command Name:',
				initial: 'user:say',
				validate(value: string) {
					if (value.length < 1) {
						return 'Command name cannot be empty';
					}

					return true;
				}
			},
			{
				type: 'text',
				name: 'description',
				message: 'Command Description:',
				initial: 'Say something',
				validate(value: string) {
					if (value.length < 1) {
						return 'Command description cannot be empty';
					}

					return true;
				}
			}
		];

		const answers = await prompts(items);

		answers.name = pascal(answers.command.replaceAll(':', '_'));

		return this.write(answers);
	}

	private async write(answers: Record<string, any>): Promise<boolean> {
		if (!answers.name) {
			console.log('Operation cancelled.');
			return false;
		}

		if (!answers.name.endsWith('Command')) {
			answers.name += 'Command';
		}

		// Get stub file
		const stubFile = Bun.file('./node_modules/@elysiumjs/styx/stubs/command.stub');

		// Format the stub content
		const stub = formatter(await stubFile.text(), answers);

		const path = answers.module ? await getModulePath(answers.module) : './src';

		// Write to file
		const name = snake(answers.name.replace('Command', ''));
		const file = Bun.file(`${path}/commands/${name}.command.ts`);
		await file.write(stub);

		console.log(`Command ${answers.name} created successfully.`);
		return true;
	}
}
