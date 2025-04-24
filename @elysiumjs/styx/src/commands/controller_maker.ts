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
 * Maker class for creating Elysium controllers.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export class ControllerMaker extends Maker {
	public static readonly instance = new ControllerMaker();

	private constructor() {
		super('controller');
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
				http: {
					type: 'boolean'
				},
				wamp: {
					type: 'boolean'
				},
				ws: {
					type: 'boolean'
				},
				server: {
					type: 'boolean',
					short: 's'
				},
				request: {
					type: 'boolean',
					short: 'r'
				}
			}
		});

		if (positionals.length < 2) {
			return this.setup();
		}

		const answers: Record<string, any> = {
			module: values.module,
			type: 'http',
			scope: 'SERVER'
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

		if (values.http) {
			answers.type = 'http';
		} else if (values.wamp) {
			answers.type = 'wamp';
		} else if (values.ws) {
			answers.type = 'ws';
		}

		if (values.server) {
			answers.scope = 'SERVER';
		} else if (values.request) {
			answers.scope = 'REQUEST';
		}

		answers.name = positionals[0];
		answers.path = positionals[1];
		answers.realm = positionals[2] ?? 'realm1';

		return this.write(answers);
	}

	private async setup(): Promise<boolean> {
		let mode: 'http' | 'wamp' | 'ws' = 'http';

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
				type: 'select',
				name: 'type',
				message: 'Controller Type:',
				choices: [
					{ title: 'HTTP', value: 'http' },
					{ title: 'WAMP', value: 'wamp' },
					{ title: 'WebSocket', value: 'ws' }
				]
			},
			{
				type: 'text',
				name: 'name',
				message: 'Controller Name:',
				initial: 'UserController',
				validate: (value: string) => {
					if (value.length < 1) {
						return 'Controller name cannot be empty';
					}

					return true;
				}
			},
			{
				type: 'text',
				name: 'path',
				message(_prev, values) {
					mode = values.type;
					return values.type === 'wamp' ? 'Controller URL' : 'Controller Path:';
				},
				initial(_prev, values) {
					return values.type === 'wamp' ? 'ws://localhost:8000' : '/users';
				},
				validate(value) {
					if (mode === 'wamp') {
						return value.match(/^wss?:\/\//) ? true : 'The URL must start with ws:// or wss://';
					}

					if (value[0] !== '/') {
						return 'The path must start with a slash (/)';
					}

					return true;
				}
			},
			{
				type(_prev, values) {
					return values.type === 'http' ? 'select' : null;
				},
				name: 'scope',
				message: 'Controller Scope:',
				choices: [
					{
						title: 'SERVER',
						value: 'SERVER',
						description:
							'An unique instance of the controller is created for the entire lifecycle of the server.'
					},
					{
						title: 'REQUEST',
						value: 'REQUEST',
						description: 'An instance of the controller is created for each request.'
					}
				]
			},
			{
				type(_prev, values) {
					return values.type === 'wamp' ? 'text' : null;
				},
				name: 'realm',
				message: 'Controller Realm:',
				initial: 'realm1',
				validate(value) {
					if (value.length < 1) {
						return 'Realm name cannot be empty';
					}

					return true;
				}
			}
		];

		const answers = await prompts(items);

		return this.write(answers);
	}

	private async write(answers: Record<string, any>): Promise<boolean> {
		if (!answers.type || !answers.name || !answers.path) {
			console.log('Operation cancelled.');
			return false;
		}

		if (!answers.name.endsWith('Controller')) {
			answers.name += 'Controller';
		}

		// Get stub file
		const stubFile = Bun.file(
			`./node_modules/@elysiumjs/styx/stubs/${answers.type}.controller.stub`
		);

		// Format the stub content
		const stub = formatter(await stubFile.text(), answers);

		const path = answers.module ? await getModulePath(answers.module) : './src';

		// Write to file
		const name = snake(answers.name.replace('Controller', ''));
		const file = Bun.file(`${path}/controllers/${answers.type}/${name}.controller.ts`);
		await file.write(stub);

		console.log(`Controller ${answers.name} created successfully.`);
		return true;
	}
}
