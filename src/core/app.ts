import type { ElysiaSwaggerConfig } from '@elysiajs/swagger';
import type { ElysiaConfig, ErrorContext, PreContext } from 'elysia';
import type { Class } from 'type-fest';
import type { ConnectionProps } from '../db/connection';
import type { Module } from './module';
import type { Route } from './utils';

import { AsyncLocalStorage } from 'node:async_hooks';

import { swagger as swaggerPlugin } from '@elysiajs/swagger';
import { Elysia } from 'elysia';
import { assign } from 'radash';

import { Connection } from '../db/connection';
import { Event } from './event';
import { Context, Singleton } from './http';
import { applyMiddlewares } from './middleware';
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
	modules?: Class<Module>[];

	/**
	 * The database configuration for the app.
	 */
	database?: {
		/**
		 * The default connection name.
		 */
		default: string;

		/**
		 * The list of connections.
		 */
		connections: Record<string, ConnectionProps>;
	};

	/**
	 * Swagger documentation configuration.
	 *
	 * Set it to `false` to disable Swagger documentation.
	 */
	swagger?: ElysiaSwaggerConfig<Route> | false;
};

/**
 * Marks a class as the application main entry.
 * @param props The decorator options.
 */
export const app = (props: AppProps): ClassDecorator => {
	return function (target) {
		props = assign({ modules: [], database: undefined, swagger: false }, props);
		Reflect.defineMetadata(Symbols.app, props, target);
	};
};

/**
 * Base class for the application main entry.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export abstract class Application {
	#elysia: Elysia<Route>;
	#debug: boolean;
	readonly #appContextStorage: AsyncLocalStorage<Map<string, unknown>> = new AsyncLocalStorage();

	/**
	 * Creates a new instance of the application.
	 * @param config The Elysia configuration.
	 */
	constructor(config: ElysiaConfig<Route> & { debug?: boolean } = {}) {
		this.#elysia = new Elysia(config);
		this.#debug = config.debug ?? false;

		this.#elysia
			.onRequest((c: PreContext<Singleton>) => {
				c.tenant = c.request.headers.get('x-tenant-id');

				this.#appContextStorage.enterWith(
					new Map([
						['tenant', c.tenant],
						['context', c]
					])
				);

				if (this.debug) {
					// TODO: Use the logger service here
					console.log(c.request.method, c.request.url);
				}
			})
			.onError((e) => {
				if (this.onError(e)) {
					Event.emit('elysium:error', e);
				}
			})
			.onStart((elysia) => {
				this.onStart(elysia);
				Event.emit('elysium:app:start', elysia, this);
			})
			.onStop((elysia) => {
				this.onStop(elysia);
				Event.emit('elysium:app:stop', elysia, this);
				this.#appContextStorage.disable();
			});

		Service.instance('elysium.app', this);
		Service.instance('elysium.app.context', this.#appContextStorage);
	}

	/**
	 * Gets the Elysia instance.
	 */
	public get elysia(): Elysia<Route> {
		return this.#elysia;
	}

	/**
	 * Gets the debug mode flag.
	 */
	public get debug(): boolean {
		return this.#debug;
	}

	/**
	 * Sets the debug mode flag.
	 * @param debug The debug mode flag.
	 */
	public set debug(debug: boolean) {
		this.#debug = debug;
	}

	/**
	 * Hook that is executed when an error occurs.
	 * @param e The error context.
	 * @returns Whether to continue the error propagation.
	 */
	protected onError(e: ErrorContext): boolean {
		return true;
	}

	/**
	 * Hook that is executed when the application starts.
	 * @param elysia The Elysia instance.
	 */
	protected onStart(elysia: Elysia<Route>): void {}

	/**
	 * Hook that is executed when the application stops.
	 * @param elysia The Elysia instance.
	 */
	protected onStop(elysia: Elysia<Route>): void {}

	/**
	 * Starts the application on the specified port.
	 * @param port The port to listen on.
	 */
	public async start(port: number = 3000): Promise<void> {
		const { modules, database, swagger }: AppProps = Reflect.getMetadata(
			Symbols.app,
			this.constructor
		)!;

		if (database) {
			for (const connectionName in database.connections) {
				Connection.register(connectionName, database.connections[connectionName]);
			}

			if (Connection.exists(database.default)) {
				Connection.setDefault(database.default);
			}
		}

		if (swagger) {
			this.#elysia.use(swaggerPlugin(swagger));
		}

		const middlewares = Reflect.getMetadata(Symbols.middlewares, this.constructor) ?? [];
		applyMiddlewares(middlewares, this.#elysia);

		for (const moduleClass of modules!) {
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
			this.#elysia.use(await plugin(module));
			module.afterRegister();
		}

		this.#elysia.listen(port);
	}
}
