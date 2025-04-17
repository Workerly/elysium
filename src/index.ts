import 'reflect-metadata';

import type { DatabaseConnection } from './core/database';
import type { EventData } from './core/event';
import type { Context } from './core/http';
import type { WS, WSError } from './core/websocket';

import { boolean, integer, uuid, varchar } from 'drizzle-orm/pg-core';
import { t } from 'elysia';
import { isEmpty, uid } from 'radash';
import { Class } from 'type-fest';

import { app, AppContext, Application } from './core/app';
import { Cache } from './core/cache';
import { arg, Command, CommandArgumentType } from './core/command';
import { Event, on } from './core/event';
import {
	body,
	context,
	decorate,
	del,
	get,
	http,
	HttpControllerScope,
	onRequest,
	param,
	patch,
	post,
	query,
	sse
} from './core/http';
import { middleware, Middleware } from './core/middleware';
import { Model } from './core/model';
import { module, Module } from './core/module';
import { Repository } from './core/repository';
import { inject, Service, service, ServiceScope } from './core/service';
import { onClose, onError as onErrorWS, onMessage, onOpen, websocket } from './core/websocket';

class AuthMiddleware extends Middleware {
	public onBeforeHandle(ctx: Context) {
		if (ctx.path.startsWith('/docs')) {
			return;
		}

		if (ctx.headers.authorization !== 'Bearer secret') {
			throw ctx.error(401, { message: 'Unauthorized' });
		}
	}
}

class XServerMiddleware extends Middleware {
	public onBeforeHandle(ctx: Context) {
		ctx.set.headers['X-Server'] = 'Elysium';
	}
}

class UserModel extends Model('users', {
	id: uuid().primaryKey().defaultRandom(),
	name: varchar({ length: 255 }).notNull(),
	age: integer().notNull(),
	email: varchar({ length: 255 }).notNull().unique(),
	is_confirmed: boolean().default(false)
}) {
	public static readonly supportTenancy = true;
}

type User = typeof UserModel.$inferSelect;
type UserInsert = typeof UserModel.$inferInsert;
type UserUpdate = typeof UserModel.$inferUpdate;

@service()
class UserRepository extends Repository(UserModel) {}

@service({ scope: ServiceScope.FACTORY })
class LoggerService {
	public log(...msg: any[]) {
		console.log(...msg);
	}

	public error(msg: string) {
		console.error(msg);
	}
}

@service({ name: 'user.service', scope: ServiceScope.SINGLETON })
class UserService {
	public constructor(
		@inject() public logger: LoggerService,
		@inject() public userRepository: UserRepository
	) {}

	public data: any[] = [];

	public say(sth: string) {
		this.logger.log(sth);
	}

	getUser(id: string) {
		return this.userRepository.find(id);
	}

	@on({ event: 'user:say' })
	private static sayFromEvent(e: EventData<string>) {
		const logger = Service.get(LoggerService)!;
		logger.log(`from source: ${e.source} with event: ${e.data}`);
		throw new Error('Custom error');
	}
}

const co = decorate((c: Context) => {
	return c.controller;
});

const mo = decorate((c: Context) => {
	return c.module;
});

@http({ path: '/users', scope: HttpControllerScope.SERVER, tags: ['users'] })
class UserController {
	public constructor(
		@inject('user.service') public readonly userService: UserService,
		@inject('db.connection.main') public readonly db: DatabaseConnection,
		public id: string = uid(8)
	) {}

	@get({
		response: t.Array(UserModel.selectSchema),
		operationId: 'users.list',
		description: 'Get all users'
	})
	private async list(
		@mo() module: InstanceType<Class<MainModule>>,
		@inject() logger: LoggerService,
		@context() c: Context
	): Promise<Array<User>> {
		// logger.log('ctx', App.context.getStore());
		let list = await Cache.memory.get<Array<User>>(`${c.tenant}:users:list`);
		if (!list) {
			list = await this.userService.userRepository.all();
			Cache.memory.set(`${c.tenant}:users:list`, list);
		}

		return list;
	}

	@del({ response: t.Array(UserModel.selectSchema) })
	private deleteAll() {
		return this.userService.userRepository.deleteAll();
	}

	@get({ path: '/:id', response: UserModel.selectSchema })
	private async getUser(@param('id', t.String({ format: 'uuid' })) id: string, @context() c: any) {
		const user = await this.userService.getUser(id);
		return !!user ? user : c.error(404, { message: 'User not found' });
	}

	@post({ response: UserModel.selectSchema })
	private async post(
		@body(UserModel.createSchema) b: UserInsert,
		@query() q: any,
		@co() c: UserController
	) {
		const res = await this.db.insert(UserRepository.table).values(b).returning();
		return res[0];
	}

	@patch({ response: UserModel.selectSchema })
	private patch(
		@body(UserModel.updateSchema) b: UserInsert,
		@query() q: any,
		@co() c: UserController
	) {
		// return this.db.insert(usersTable).values(b).returning();
	}

	@sse({ path: '/:id/notifications' })
	private async sse(@query() q: any, @context() c: Context) {
		while (isEmpty(this.userService.data)) {
			await Bun.sleep(1);
		}

		return JSON.stringify(this.userService.data.shift());
	}

	@on({ event: 'user:add' })
	private static addFromEvent(e: EventData<{ id: string; name: string }>) {
		const us = Service.get<UserService>('user.service')!;
		us.data.push(e.data);
	}

	@onRequest()
	private onRequest(c: Context) {
		// this.userService.logger.log(c);
	}
}

@websocket({ path: '/ws', options: { idleTimeout: 10 } })
class MessagingServer {
	public constructor(@inject() public logger: LoggerService) {}

	@onOpen()
	private onOpen() {
		this.logger.log('websocket opened');
	}

	@onClose()
	private onClose() {
		this.logger.log('websocket closed');
	}

	@onMessage(UserModel.createSchema)
	private onMessage(ws: WS, data: UserInsert) {
		this.logger.log(`received message: ${JSON.stringify(data)} from ${ws.data.id}`);
		ws.send(JSON.stringify({ message: `Created user ${data.name}` }));
		throw new Error('Test websocket error');
	}

	@onErrorWS()
	private onErrorWS(e: WSError) {
		this.logger.error(e.error.message);
	}
}

// @wamp({ url: 'ws://127.0.0.1:8888', realm: 'realm1' })
// class WampController {
// 	public constructor(@inject() public logger: LoggerService) {}

// 	@register('test.topic')
// 	private onTestTopic(data: WampRegistrationHandlerArgs) {
// 		this.logger.log(`Received data: ${data.argsList}`);
// 		return 'Hello from WampController';
// 	}
// }

// @wamp({ url: 'ws://127.0.0.1:8888', realm: 'realm1' })
// class WampController2 {
// 	public constructor(@inject() public logger: LoggerService) {}

// 	@register('test.topic.ext')
// 	private onTestTopic(data: WampRegistrationHandlerArgs) {
// 		console.log('Received data: ', data);
// 		data.result_handler({ argsList: ['Hello from WampController1'], options: { progress: true } });
// 		// ...
// 		data.result_handler({ argsList: ['Hello from WampController2'], options: { progress: true } });
// 		// ...
// 		data.result_handler({ argsList: ['Hello from WampController3'], options: { progress: true } });
// 	}

// 	@subscribe('test.topic.notify')
// 	private onTestTopicNotify(data: WampRegistrationHandlerArgs) {
// 		console.log('Received data: ', data);
// 	}

// 	@onOpenWamp()
// 	private onOpen() {
// 		this.logger.log('Wamp connection opened');
// 	}

// 	@onCloseWamp()
// 	private onClose() {
// 		this.logger.log('Wamp connection closed');
// 	}

// 	@onError()
// 	private onError() {
// 		this.logger.error('Wamp connection error');
// 	}

// 	@onReconnect()
// 	private onReconnect() {
// 		this.logger.log('Wamp reconnecting');
// 	}

// 	@onReconnectSuccess()
// 	private onReconnectSuccess() {
// 		this.logger.log('Wamp reconnected');
// 	}
// }

@module({ controllers: [UserController, MessagingServer] })
class MainModule extends Module {
	public constructor() {
		super();
	}

	public afterRegister() {
		console.log('Module registered successfully');
	}
}

class TestCommand extends Command {
	public static readonly command = 'app:test';
	public static readonly description = 'Test command';

	constructor(@inject('user.service') private userService: UserService) {
		super();
	}

	@arg('name', { description: 'Name of the user', required: true })
	private name: string = '';

	@arg('age', { description: 'Age of the user', required: true, default: 28 })
	private age: number = 0;

	public async run() {
		const users = await this.userService.userRepository.all();
		this.write(
			`Hello, ${this.name}! You are ${this.age} years old. You have ${users.length} users.`
		);
	}
}

/**
 * A command that demonstrates the use of the spinner for indeterminate operations.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export class SpinnerDemoCommand extends Command {
	public static readonly command: string = 'demo:spinner';
	public static readonly description: string =
		'Demonstrates the use of spinners for indeterminate operations';

	@arg('task', {
		description: 'The type of task to simulate',
		default: 'download',
		enum: ['download', 'process', 'connect', 'upload', 'analyze'],
		type: CommandArgumentType.ENUM
	})
	private task: string = 'download';

	@arg('duration', {
		description: 'Duration of the simulated task in seconds',
		type: CommandArgumentType.NUMBER,
		default: 5
	})
	private duration: number = 5;

	@arg('steps', {
		description: 'Number of steps in the simulated task',
		type: CommandArgumentType.NUMBER,
		default: 3
	})
	private steps: number = 3;

	@arg('fail', {
		description: 'Simulate a failure during the operation',
		type: CommandArgumentType.BOOLEAN,
		default: false
	})
	private fail: boolean = false;

	/**
	 * Run the spinner demo command.
	 */
	public async run(): Promise<void> {
		this.title('Spinner Demo');

		this.info(
			`Simulating a ${this.task} operation with ${this.steps} steps over ${this.duration} seconds`
		);

		if (this.fail) {
			this.warning('This demo will simulate a failure');
			this.debug('Remove the --fail flag to see the actual operation');
		}

		// Calculate time per step
		const timePerStep = (this.duration * 1000) / this.steps;

		// Start a spinner
		const spinner = this.spinner(`Starting ${this.task} operation`);

		try {
			// Simulate multiple steps
			for (let i = 1; i <= this.steps; i++) {
				// Wait for the calculated time
				await this.delay(timePerStep);

				// Update spinner message for each step
				if (i < this.steps) {
					spinner.update(`${this.getTaskMessage(i)}`);
				}

				// Simulate a failure at a random step if fail flag is set
				if (this.fail && i === Math.floor(this.steps / 2)) {
					throw new Error(`Failed during ${this.task} operation at step ${i}`);
				}
			}

			// Complete the spinner with success
			spinner.complete(
				`${this.task.charAt(0).toUpperCase() + this.task.slice(1)} operation completed successfully`
			);

			// Show some additional information
			this.success(`Processed ${this.getRandomNumber(10, 100)} items`);
			this.info(`Peak memory usage: ${this.getRandomNumber(50, 200)}MB`);
		} catch (error: any) {
			// Handle failure
			spinner.fail(
				`${this.task.charAt(0).toUpperCase() + this.task.slice(1)} operation failed: ${error.message}`
			);
			this.error(`Error details: ${error.message}`);
			return;
		}

		// Ask if the user wants to run another simulation
		if (await this.confirm('Would you like to run another simulation?')) {
			// Let the user select a different task
			this.task = await this.select('Select a task to simulate:', [
				'download',
				'process',
				'connect',
				'upload',
				'analyze'
			]);

			// Let the user input a custom duration
			const durationStr = await this.prompt('Enter duration in seconds', '3');
			this.duration = parseInt(durationStr, 10) || 3;

			// Run again
			await this.run();
		} else {
			this.success('Demo completed. Thanks for trying out the spinner!');
		}
	}

	/**
	 * Get a task-specific message for the current step.
	 * @param step The current step number.
	 * @returns A message describing the current operation.
	 */
	private getTaskMessage(step: number): string {
		const messages: Record<string, string[]> = {
			download: [
				'Establishing connection',
				'Downloading data chunks',
				'Verifying file integrity',
				'Saving to disk'
			],
			process: [
				'Reading input files',
				'Processing data',
				'Applying transformations',
				'Generating output'
			],
			connect: [
				'Resolving hostname',
				'Establishing secure connection',
				'Authenticating',
				'Handshaking'
			],
			upload: ['Preparing files', 'Compressing data', 'Uploading chunks', 'Finalizing upload'],
			analyze: [
				'Loading dataset',
				'Running analysis algorithms',
				'Generating insights',
				'Preparing report'
			]
		};

		const taskMessages = messages[this.task] || messages['download'];
		return taskMessages[step % taskMessages.length];
	}

	/**
	 * Generate a random number between min and max (inclusive).
	 * @param min The minimum value.
	 * @param max The maximum value.
	 * @returns A random number.
	 */
	private getRandomNumber(min: number, max: number): number {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	/**
	 * Delay execution for the specified time.
	 * @param ms Time to delay in milliseconds.
	 * @returns A promise that resolves after the delay.
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

@middleware(XServerMiddleware)
@app({
	modules: [MainModule],
	commands: [TestCommand, SpinnerDemoCommand],
	server: {
		name: App.name,
		port: parseInt(process.env.PORT!, 10) || 3000
	},
	debug: false,
	database: {
		default: 'main',
		connections: {
			main: { connection: process.env.DATABASE_URL! }
		}
	},
	redis: {
		default: 'cache',
		connections: {
			cache: { url: process.env.REDIS_URL!, connectionTimeout: 0 }
		}
	},
	swagger: {
		path: '/docs',
		documentation: {
			info: {
				title: 'Elysium',
				description: 'Elysium API Documentation',
				version: '1.0.0'
			}
		}
	}
})
export class App extends Application {}

Event.on('elysium:error', (e: EventData<Error>) => {
	console.error('Fuck', JSON.stringify(e));
});

setInterval(() => {
	Event.emit('user:add', { id: uid(8), name: `User ${uid(8)}` });
}, 1000);
