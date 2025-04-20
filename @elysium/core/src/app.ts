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

import type { ElysiaSwaggerConfig } from '@elysiajs/swagger';
import type { ElysiaConfig, ErrorContext, PreContext } from 'elysia';
import type { CommandClass } from './command';
import type { DatabaseConnectionProps } from './database';
import type { Route, Singleton } from './http';
import type { ModuleClass } from './module';
import type { RedisConnectionProps } from './redis';

import { AsyncLocalStorage } from 'node:async_hooks';
import { parseArgs } from 'node:util';

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
 * Type for the application context.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type AppContext = AsyncLocalStorage<Map<'tenant' | 'http:context' | 'db:tx', unknown>>;

/**
 * Base class for the application main entry.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export abstract class Application extends InteractsWithConsole {
	// @ts-expect-error The property is not initialized in the constructor.
	#elysia: Elysia<Route>;
	#debug: boolean;

	private readonly _appContextStorage: AppContext = new AsyncLocalStorage();

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
		return Application.instance._appContextStorage;
	}

	/**
	 * Marks a class as the application main entry.
	 * @param props The decorator options.
	 */
	public static register(props: AppProps = {}): ClassDecorator {
		return function (target) {
			props = assign({ modules: [], database: undefined, swagger: false }, props);
			Reflect.defineMetadata(Symbols.app, props, target);
		};
	}

	/**
	 * Creates a new instance of the application.
	 */
	public constructor() {
		super();

		Service.instance('elysium.app', this);

		const { debug, database, redis } = Reflect.getMetadata(
			Symbols.app,
			this.constructor
		) as AppProps;

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

		// Run the application
		this.run().then(() => Event.emit('elysium:app:launched', this, this));
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
	protected async onError(e: ErrorContext): Promise<boolean> {
		return true;
	}

	/**
	 * Hook that is executed when the application starts.
	 * @param elysia The Elysia instance.
	 */
	protected async onStart(elysia: Elysia<Route>): Promise<void> {}

	/**
	 * Hook that is executed when the application stops.
	 * @param elysia The Elysia instance.
	 */
	protected async onStop(elysia: Elysia<Route>): Promise<void> {}

	protected async run(): Promise<void> {
		const argv = process.argv.slice(2);

		const action = argv[0];

		if (!action) {
			this.commandDescribe();
		} else {
			const { commands } = Reflect.getMetadata(Symbols.app, this.constructor) as AppProps;

			switch (action) {
				case 'serve': {
					return this.commandServe();
				}
				case 'exec': {
					const command = argv[1];
					const args = argv.slice(2);

					return this.commandExec(command, args);
				}
				case 'help': {
					const command = argv[1];

					if (command) {
						const commandClass = commands?.find((commandClass) => commandClass.command === command);

						if (commandClass) {
							const commandInstance = Service.make(commandClass);
							this.write(await commandInstance.help());
							return process.exit(0);
						}

						console.error(`Command <${command}> not found.`);
					} else {
						console.error('No command provided. Usage: styx help <command>');
					}

					this.commandList();
					break;
				}
				case 'list': {
					this.write(this.bold('Available commands:'));
					this.commandList();
					break;
				}
				case 'work': {
					return this.commandWork(argv.slice(1));
				}
				default: {
					console.error(`Invalid command: ${this.bold(action)}`);

					this.commandDescribe();
					break;
				}
			}
		}

		return process.exit(0);
	}

	private async commandWork(argv: string[]) {
		this.info('Starting worker process...');

		// Parse queue arguments
		const { values } = parseArgs({
			args: argv,
			options: {
				queue: {
					type: 'string',
					multiple: true,
					default: ['default'],
					short: 'q'
				},
				concurrency: {
					type: 'string',
					default: '1',
					short: 'c'
				},
				['max-retries']: {
					type: 'string',
					default: '5',
					short: 'r'
				},
				['retry-delay']: {
					type: 'string',
					default: '5000',
					short: 'd'
				},
				['pause-on-error']: {
					type: 'boolean',
					default: false,
					short: 'p'
				}
			}
		});

		// Import worker-specific code
		const { Worker } = await import('./worker');

		// Start the worker with the specified queues
		const queues = values.queue
			.map((queue) => queue.split(','))
			.reduce((acc, queues) => acc.concat(queues), []);

		const worker = Worker.spawn(self as unknown as globalThis.Worker, queues, {
			concurrency: parseInt(values.concurrency, 10),
			maxRetries: parseInt(values['max-retries'], 10),
			retryDelay: parseInt(values['retry-delay'], 10),
			pauseOnError: values['pause-on-error']
		});

		this.success(
			`Worker process ${this.format(worker.id, ConsoleFormat.GREEN)} started with queues: ${queues.map((q) => this.format(q, ConsoleFormat.CYAN)).join(', ')}`
		);
	}

	/**
	 * Executes a command.
	 * @param command The command to execute.
	 * @param argv The command line arguments.
	 */
	private async commandExec(command: string, argv: string[]): Promise<void> {
		const { commands } = Reflect.getMetadata(Symbols.app, this.constructor) as AppProps;

		// Find the command class
		const commandClass = commands?.find((commandClass) => commandClass.command === command);

		if (!commandClass) {
			console.error(`Command ${command} not found`);
			this.commandList();
			return process.exit(1);
		}

		try {
			// Create the command instance
			const commandInstance = Service.make(commandClass);

			// Run the command
			const initialized = await commandInstance.init(...argv);

			if (initialized) {
				await commandInstance.run();
			} else {
				const help = await commandInstance.help();
				this.write(help);
			}

			return process.exit(0);
		} catch (error: any) {
			console.error(error.message);
			return process.exit(1);
		}
	}

	/**
	 * Starts the server on the specified port.
	 */
	private async commandServe(): Promise<void> {
		const { server, modules, swagger } = Reflect.getMetadata(
			Symbols.app,
			this.constructor
		) as AppProps;

		Event.emit('elysium:server:before-init', this, this);

		this.#elysia = new Elysia(server);

		this.#elysia
			.onRequest((c: PreContext<Singleton>) => {
				c.tenant = c.request.headers.get('x-tenant-id') ?? 'public';

				if (this.isDebug) {
					// TODO: Use the logger service here
					console.log(c.request.method, c.request.url);
				}
			})
			.onError(async (e) => {
				if (await this.onError(e)) {
					Event.emit('elysium:error', e);
				}
			})
			.onStart(async (elysia) => {
				await this.onStart(elysia);
				Event.emit('elysium:server:start', elysia, this);
			})
			.onStop(async (elysia) => {
				await this.onStop(elysia);
				Event.emit('elysium:server:stop', elysia, this);
				this._appContextStorage.disable();
			});

		Event.emit('elysium:server:after-init', this, this);

		if (swagger) {
			this.#elysia.use(await swaggerPlugin(swagger));
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
				return process.exit(1);
			}

			const module = Service.bind(moduleClass);

			module.beforeRegister();
			this.#elysia.use(await plugin(module));
			module.afterRegister();
		}

		// Register the server
		this.#elysia.listen(server?.port ?? (parseInt(process.env.PORT!, 10) || 3000));

		process.on('SIGINT', () => {
			this.#elysia.stop();
			return process.exit(0);
		});
	}

	/**
	 * Describes the CLI and available commands.
	 */
	private commandDescribe() {
		this.section(
			`${this.bold('Usage:')} ${this.format('styx', ConsoleFormat.MAGENTA)} <command> [options]`
		);

		this.section(this.bold('Commands:'));
		this.commandDescription('serve', '', 'Starts the server.');
		this.commandDescription('exec', '<command> [options]', 'Executes a command.');
		this.commandDescription('work', '[options]', 'Starts a worker process.');
		this.commandDescription('help', '<command>', 'Displays help for a command.');
		this.commandDescription('list', '', 'List all available commands.');
	}

	private commandList() {
		const { commands } = Reflect.getMetadata(Symbols.app, this.constructor) as AppProps;

		const groups = (commands ?? []).reduce((acc, commandClass) => {
			const groupKey = commandClass.command.split(':')[0];
			const group = acc.get(groupKey) ?? [];
			group.push(commandClass);
			acc.set(groupKey, group);
			return acc;
		}, new Map<string, CommandClass[]>());

		for (const [group, groupCommands] of groups) {
			this.section(this.format(group, ConsoleFormat.BLUE));
			for (const commandClass of groupCommands) {
				this.commandDescription(commandClass.command, '', commandClass.description);
			}
		}
	}

	private commandDescription(
		command: string,
		args: string,
		description: string,
		width: number = InteractsWithConsole.SPACE_WIDTH
	) {
		args = args.length === 0 ? ' ' : ` ${args} `;
		this.write(
			` ${this.format(command, ConsoleFormat.CYAN)}${args}${'∙'.repeat(width - command.length - args.length)} ${description}`
		);
	}
}
