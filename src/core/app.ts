import type { AnyElysia, ElysiaConfig } from 'elysia';
import type { Class } from 'type-fest';
import type { Module } from './module';
import type { Route } from './utils';

import { Elysia } from 'elysia';

import { Service } from './service';
import { Symbols } from './utils';

/**
 * Properties required when declaring an app using the `@app()` decorator.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type AppProps = {
	/**
	 * The list of modules provided the app.
	 */
	modules?: Class<any>[];
};

/**
 * Marks a class as the application main entry.
 * @param props The decorator options.
 */
export const app = (props: AppProps): ClassDecorator => {
	return function (target) {
		Reflect.defineMetadata(Symbols.modules, props.modules ?? [], target);
	};
};

/**
 * Base class for the application main entry.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export abstract class Application {
	#elysia: AnyElysia;

	/**
	 * Creates a new instance of the application.
	 * @param config The Elysia configuration.
	 */
	constructor(config: ElysiaConfig<Route> = {}) {
		this.#elysia = new Elysia(config);
	}

	/**
	 * Gets the Elysia instance.
	 */
	public get elysia(): AnyElysia {
		return this.#elysia;
	}

	/**
	 * Starts the application on the specified port.
	 * @param port The port to listen on.
	 */
	public async start(port: number = 3000): Promise<void> {
		const modules: Class<Module>[] = Reflect.getMetadata(Symbols.modules, this.constructor) ?? [];

		for (const moduleClass of modules) {
			const plugin = Reflect.getMetadata(Symbols.elysiaPlugin, moduleClass);
			if (plugin === undefined) {
				// TODO: Use the logger service here
				console.error(
					`Invalid module class ${moduleClass.name} registered in app ${this.constructor.name}. Ensure that you used the @module() decorator on the module.`
				);
				process.exit(1);
			}

			const module = Service.bind(moduleClass);

			module.beforeRegister();
			this.#elysia = this.#elysia.use(await plugin(module));
			module.afterRegister();
		}

		this.#elysia.listen(port);
	}
}
