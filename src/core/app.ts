import 'reflect-metadata';

import type { Class } from 'type-fest';

import { Symbols } from './utils';

/**
 * Properties required when declaring an app using the `@app()` decorator.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type AppProps = {
	/**
	 * The list of modules provided the app.
	 */
	modules: Class<any>[];
};

/**
 * Marks a class as the application main entry.
 * @param options The decorator options.
 */
export const app = (options: AppProps): ClassDecorator => {
	return function (target) {
		Reflect.defineMetadata(Symbols.modules, options.modules, target);
	};
};
