import type { Class } from 'type-fest';

import { Symbols } from './utils';

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

	/**
	 * The list of services available in the module for dependency injection
	 */
	services?: Class<any>[];
};

/**
 * Marks a class as a module.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param options The decorator options.
 */
export const module = (options: ModuleProps): ClassDecorator => {
	return function (target) {
		Reflect.defineMetadata(Symbols.controllers, options.controllers ?? [], target);
		Reflect.defineMetadata(Symbols.middlewares, options.middlewares ?? [], target);
		Reflect.defineMetadata(Symbols.services, options.services ?? [], target);
	};
};
