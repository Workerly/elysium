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
import { isEmpty, snake } from 'radash';
import formatter from 'string-template';

import { getModulePath, parseProjectConfig } from '../config';
import { Maker } from './maker';

/**
 * Maker class for creating Elysium services.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export class ServiceMaker extends Maker {
	public static readonly instance = new ServiceMaker();

	private constructor() {
		super('service');
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
				singleton: {
					type: 'boolean',
					short: 's'
				},
				factory: {
					type: 'boolean',
					short: 'f'
				}
			}
		});

		if (isEmpty(positionals)) {
			return this.setup();
		}

		const answers: Record<string, any> = {
			module: values.module,
			name: positionals[0],
			alias: positionals[1],
			scope: values.singleton ? 'SINGLETON' : 'FACTORY'
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

		if (values.factory) {
			answers.scope = 'FACTORY';
		} else if (values.singleton) {
			answers.scope = 'SINGLETON';
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
				name: 'name',
				message: 'Service Name:',
				initial: 'UserService',
				validate(value: string) {
					if (value.length < 1) {
						return 'Service name cannot be empty';
					}

					return true;
				}
			},
			{
				type: 'text',
				name: 'alias',
				message: 'Service Alias:',
				initial(_, values) {
					return values.name;
				},
				validate(value: string) {
					if (value.length < 1) {
						return 'Service alias cannot be empty';
					}

					return true;
				}
			},
			{
				type: 'select',
				name: 'scope',
				message: 'Service Scope:',
				choices: [
					{
						title: 'SINGLETON',
						value: 'SINGLETON',
						description: 'A single instance of the service is created.'
					},
					{
						title: 'FACTORY',
						value: 'FACTORY',
						description: 'A new instance of the service is created each time it is injected.'
					}
				]
			}
		];

		const answers = await prompts(items);

		return this.write(answers);
	}

	private async write(answers: Record<string, any>): Promise<boolean> {
		if (!answers.name) {
			console.log('Operation cancelled.');
			return false;
		}

		if (!answers.name.endsWith('Service')) {
			answers.name += 'Service';
		}

		if (!answers.alias) {
			answers.alias = answers.name;
		}

		// Get stub file
		const stubFile = Bun.file('./node_modules/@elysiumjs/styx/stubs/service.stub');

		// Format the stub content
		const stub = formatter(await stubFile.text(), answers);

		const path = answers.module ? await getModulePath(answers.module) : './src';

		// Write to file
		const name = snake(answers.name.replace('Service', ''));
		const file = Bun.file(`${path}/services/${name}.service.ts`);
		await file.write(stub);

		console.log(`Service ${answers.name} created successfully.`);
		return true;
	}
}
