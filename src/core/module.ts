import type { Class } from 'type-fest';
import type { Route } from './utils';

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
};

/**
 * Marks a class as a module.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param options The decorator options.
 */
export const module = (options: ModuleProps = {}) => {
	return function (target: Class<Module>) {
		async function handleModule(m: Module): Promise<Elysia<Route>> {
			// TODO: Use the logger service here
			console.log(`Registering module ${target.name}`);
			await nextTick();

			const props = assign({ controllers: [] }, options) as Required<ModuleProps>;

			const plugin: Elysia<Route> = new Elysia({ name: target.name });
			plugin.decorate('module', m);

			const middlewares = Reflect.getMetadata(Symbols.middlewares, target) ?? [];
			applyMiddlewares(middlewares, plugin);

			for (const controller of props.controllers) {
				const app = Reflect.getMetadata(Symbols.elysiaPlugin, controller);
				if (app === undefined) {
					// TODO: Use the logger service here
					console.error(
						`Invalid controller class ${controller.name} registered in module ${target.name}. Ensure that you either used the @http(), or @websocket() decorators on the controller.`
					);
					process.exit(1);
				}

				// TODO: Add middlewares here
				plugin.use(await app());
			}

			return plugin;
		}

		Reflect.defineMetadata(Symbols.elysiaPlugin, handleModule, target);
	};
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
	 * Hooks that are executed before the module is registered.
	 */
	public beforeRegister(): void {}

	/**
	 * Hooks that are executed after the module is registered.
	 */
	public afterRegister(): void {}
}
