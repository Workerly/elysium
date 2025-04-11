import type { Class } from 'type-fest';

import Elysia, { AnyElysia } from 'elysia';
import { assign } from 'radash';

import { Service } from './service';
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
	 * The list of middlewares in the module. Those middlewares will run for each
	 * endpoint of each controller in the module.
	 *
	 * If you want to apply a middleware only for a specific controller, use the
	 * `@middleware()` decorator on that controller instead.
	 *
	 * If you need to apply the middleware on a specific endpoint, add the `@middleware()`
	 * on the endpoint's method handler instead.
	 */
	middlewares?: Class<any>[];
};

/**
 * Marks a class as a module.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param options The decorator options.
 */
export const module = (options: ModuleProps) => {
	return function (target: Class<Module>) {
		async function handleModule(m: Module): Promise<AnyElysia> {
			// TODO: Use the logger service here
			console.log(`Registering module ${target.name}`);
			await nextTick();

			const props = assign({ controllers: [], middlewares: [] }, options) as Required<ModuleProps>;

			const plugin: AnyElysia = new Elysia({ name: target.name });
			plugin.decorate('module', m);

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
