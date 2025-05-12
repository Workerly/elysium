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

import type { Class } from 'type-fest';
import type { ElysiaApp, Route } from './http';

import { Elysia } from 'elysia';
import { assign } from 'radash';

import { applyMiddlewares } from './middleware';
import { nextTick, Symbols } from './utils';

/**
 * Properties required when declaring a module using the `@module()` decorator.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type ModuleProps = {
	/**
	 * The list of controllers provided by the module.
	 */
	controllers?: Class<any>[];

	/**
	 * The base path for all the controllers registered by this module.
	 * This value will be prefixed to each controllers path.
	 */
	prefix?: Route;
};

/**
 * Type for a module class.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type ModuleClass = Class<Module>;

/**
 * Base class for all modules.
 * @author Axel Nana <axel.nana@workbud.com>
 *
 * This class provides base features for modules, such as hooks and lifecycle methods.
 */
export abstract class Module {
	/**
	 * Marks a class as a module.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param options The decorator options.
	 */
	public static register(options: ModuleProps = {}) {
		return function (target: ModuleClass) {
			async function handleModule(m: Module): Promise<ElysiaApp> {
				// TODO: Use the logger service here
				console.log(`Registering module ${target.name}`);
				await nextTick();

				const props = assign({ controllers: [] }, options) as Required<ModuleProps>;

				const plugin: ElysiaApp = new Elysia({ name: target.name, prefix: options.prefix });
				plugin.decorate('module', m);

				const middlewares = Reflect.getMetadata(Symbols.middlewares, target) ?? [];
				applyMiddlewares(middlewares, plugin);

				for (const controller of props.controllers) {
					const app = Reflect.getMetadata(Symbols.elysiaPlugin, controller);
					if (app === undefined) {
						// TODO: Use the logger service here
						console.error(
							`Invalid controller class ${controller.name} registered in module ${target.name}. Ensure that you either used the @Http.controller(), the @Websocket.controller(), or the @Wamp.controller() decorators on the class.`
						);
						process.exit(1);
					} else {
						// TODO: Add middlewares here
						plugin.use(await app());
					}
				}

				return plugin;
			}

			Reflect.defineMetadata(Symbols.elysiaPlugin, handleModule, target);
		};
	}

	/**
	 * Hooks that are executed before the module is registered.
	 */
	public beforeRegister(): void {}

	/**
	 * Hooks that are executed after the module is registered.
	 */
	public afterRegister(): void {}
}
