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
 * Maker class for creating Elysium middlewares.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export class MiddlewareMaker extends Maker {
	public static readonly instance = new MiddlewareMaker();

	private constructor() {
		super('middleware');
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
				}
			}
		});

		if (isEmpty(positionals)) {
			return this.setup();
		}

		const answers: Record<string, any> = {
			module: values.module,
			name: positionals[0]
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
				name: 'name',
				message: 'Middleware Name:',
				initial: 'AuthMiddleware',
				validate(value: string) {
					if (value.length < 1) {
						return 'Middleware name cannot be empty';
					}

					return true;
				}
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

		if (!answers.name.endsWith('Middleware')) {
			answers.name += 'Middleware';
		}

		// Get stub file
		const stubFile = Bun.file('./node_modules/@elysiumjs/styx/stubs/middleware.stub');

		// Format the stub content
		const stub = formatter(await stubFile.text(), answers);

		const path = answers.module ? await getModulePath(answers.module) : './src';

		// Write to file
		const name = snake(answers.name.replace('Middleware', ''));
		const file = Bun.file(`${path}/middlewares/${name}.middleware.ts`);
		await file.write(stub);

		console.log(`Middleware ${answers.name} created successfully.`);
		return true;
	}
}
