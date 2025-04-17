import type { ElysiaSwaggerConfig } from '@elysiajs/swagger';
import type { ElysiaConfig, ErrorContext, PreContext } from 'elysia';
import type { CommandClass } from './command';
import type { DatabaseConnectionProps } from './database';
import type { Singleton } from './http';
import type { ModuleClass } from './module';
import type { RedisConnectionProps } from './redis';
import type { Route } from './utils';

import { AsyncLocalStorage } from 'node:async_hooks';

import { swagger as swaggerPlugin } from '@elysiajs/swagger';
import { Elysia } from 'elysia';
import { assign } from 'radash';

import { ConsoleFormat, InteractsWithConsole } from './console';
import { Database } from './database';
import { Event } from './event';
import { applyMiddlewares } from './middleware';
import { Redis } from './redis';
import { Service } from './service';
import { Symbols } from './utils';

/**
 * Properties required when declaring an app using the `@app()` decorator.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type AppProps = {
	/**
	 * Enables or disables debug mode.
	 */
	debug?: boolean;

	/**
	 * The Elysia server configuration.
	 */
	server?: ElysiaConfig<Route> & {
		/**
		 * The port to listen on.
		 */
		port?: number;
	};

	/**
	 * The list of modules provided the app.
	 */
	modules?: ModuleClass[];

	/**
	 * The list of CLI commands provided the app.
	 */
	commands?: CommandClass[];

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
		connections: Record<string, DatabaseConnectionProps>;
	};

	/**
	 * The redis configuration for the app.
	 */
	redis?: {
		/**
		 * The default connection name.
		 */
		default: string;

		/**
		 * The list of connections.
		 */
		connections: Record<string, RedisConnectionProps>;
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
 * Type for the application context.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type AppContext = AsyncLocalStorage<Map<'tenant' | 'http:context' | 'db:tx', unknown>>;

/**
 * Base class for the application main entry.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export abstract class Application extends InteractsWithConsole {
	#elysia: Elysia<Route>;
	#debug: boolean;
	readonly #appContextStorage: AppContext = new AsyncLocalStorage();

	/**
	 * Gets the running application instance.
	 */
	public static get instance(): Application {
		return Service.get<Application>('elysium.app')!;
	}

	/**
	 * Gets the application context shared between asynchronous operations.
	 */
	public static get context(): AppContext {
		return Application.instance.#appContextStorage;
	}

	/**
	 * Creates a new instance of the application.
	 * @param config The Elysia configuration.
	 */
	public constructor() {
		super();

		Service.instance('elysium.app', this);

		const { server, debug, database, redis, swagger } = Reflect.getMetadata(
			Symbols.app,
			this.constructor
		) as AppProps;

		this.#elysia = new Elysia(server);
		this.#debug = debug ?? false;

		if (redis) {
			for (const connectionName in redis.connections) {
				Redis.registerConnection(connectionName, redis.connections[connectionName]);
			}

			if (Redis.connectionExists(redis.default)) {
				Redis.setDefaultConnection(redis.default);
			}
		}

		if (database) {
			for (const connectionName in database.connections) {
				Database.registerConnection(connectionName, database.connections[connectionName]);
			}

			if (Database.connectionExists(database.default)) {
				Database.setDefaultConnection(database.default);
			}
		}

		Event.emit('elysium:app:before-init', this, this);

		this.#elysia
			.onRequest((c: PreContext<Singleton>) => {
				c.tenant = c.request.headers.get('x-tenant-id') ?? 'public';

				if (this.isDebug) {
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

		if (swagger) {
			this.#elysia.use(swaggerPlugin(swagger));
		}

		Event.emit('elysium:app:after-init', this, this);

		// Run the application
		this.run();
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
	public get isDebug(): boolean {
		return this.#debug;
	}

	/**
	 * Sets the debug mode flag.
	 * @param debug The debug mode flag.
	 */
	public set isDebug(debug: boolean) {
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

	protected async run(): Promise<void> {
		const argv = Bun.argv.slice(2);

		const action = argv[0];

		if (!action) {
			this.describe();
		} else {
			const { commands } = Reflect.getMetadata(Symbols.app, this.constructor) as AppProps;

			const showAvailableCommands = () => {
				this.write(this.bold('Available commands:'));
				for (const commandClass of commands ?? []) {
					this.write(`  ${this.format(commandClass.command, ConsoleFormat.MAGENTA)}`);
				}
			};

			if (action === 'serve') {
				return this.serve();
			} else if (action === 'exec') {
				const command = argv[1];
				const args = argv.slice(2);

				return this.exec(command, args);
			} else if (action === 'help') {
				const command = argv[1];

				if (command) {
					const commandClass = commands?.find((commandClass) => commandClass.command === command);

					if (!commandClass) {
						console.error(`Command <${this.bold(command)}> not found`);
						this.newLine();
					} else {
						const commandInstance = new commandClass();
						this.write(await commandInstance.help());
					}
				} else {
					console.error('No command provided. Usage: styx help <command>');
					this.newLine();
				}

				showAvailableCommands();
			} else if (action === 'list') {
				showAvailableCommands();
			} else {
				console.error(`Invalid command: ${this.bold(action)}`);
				this.newLine();

				this.describe();
			}
		}

		process.exit(0);
	}

	/**
	 * Execute a command.
	 * @param command The command to execute.
	 * @param argv The command line arguments.
	 */
	private async exec(command: string, argv: string[]): Promise<void> {
		const { commands } = Reflect.getMetadata(Symbols.app, this.constructor) as AppProps;

		// Find the command class
		const commandClass = commands?.find((commandClass) => commandClass.command === command);

		if (!commandClass) {
			console.error(`Command ${command} not found`);
			process.exit(1);
		}

		try {
			// Create the command instance
			const commandInstance = new commandClass();

			// Run the command
			const initialized = await commandInstance.init(...argv);

			if (initialized) {
				await commandInstance.run();
			} else {
				const help = await commandInstance.help();
				this.write(help);
			}

			process.exit(0);
		} catch (error: any) {
			console.error(error.message);
			process.exit(1);
		}
	}

	/**
	 * Start the server on the specified port.
	 */
	private async serve(): Promise<void> {
		const { server, modules } = Reflect.getMetadata(Symbols.app, this.constructor) as AppProps;

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
			this.#elysia.use(plugin(module));
			module.afterRegister();
		}

		// Register the server
		this.#elysia.listen(server?.port ?? (parseInt(process.env.PORT!, 10) || 3000));

		process.on('SIGINT', () => {
			this.#elysia.stop();
			process.exit(0);
		});
	}

	/**
	 * Describes the CLI and available commands.
	 */
	private describe() {
		const [serve, exec, help, list] = ['serve', 'exec', 'help', 'list'].map((command) =>
			this.format(command, ConsoleFormat.CYAN)
		);

		const command = '<command>';

		this.write(
			`${this.bold('Usage:')} ${this.format('styx', ConsoleFormat.MAGENTA)} ${command} [options]\n`
		);
		this.write(this.bold('Commands:'));
		this.write(`  ${serve}         \t\tStarts the server.`);
		this.write(`  ${exec} ${command}\t\tExecutes a command.`);
		this.write(`  ${help} ${command}\t\tDisplays help for a command.`);
		this.write(`  ${list}          \t\tList all available commands.`);
	}
}
