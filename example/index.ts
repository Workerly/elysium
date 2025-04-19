import 'reflect-metadata';

import type { Elysia } from 'elysia';
import type {
	Context,
	EventData,
	Route,
	WampRegistrationHandlerArgs,
	WS,
	WSError
} from '../src/core';
import type { User, UserInsert } from './user.model';

import { t } from 'elysia';
import { isEmpty, uid } from 'radash';
import { Class } from 'type-fest';

import {
	Application,
	Cache,
	Command,
	CommandArgumentType,
	Event,
	Http,
	HttpControllerScope,
	Middleware,
	Module,
	Service,
	ServiceScope,
	Wamp,
	Websocket,
	WorkerPool
} from '../src/core';
import { EmailJob } from './email.job';
import { UserModel } from './user.model';
import { UserRepository } from './user.repository';

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

@Service.register({ scope: ServiceScope.FACTORY })
class LoggerService {
	public log(...msg: any[]) {
		console.log(...msg);
	}

	public error(msg: string) {
		console.error(msg);
	}
}

@Service.register({ name: 'user.service', scope: ServiceScope.SINGLETON })
class UserService {
	public constructor(
		@Service.inject() public logger: LoggerService,
		@Service.inject() public userRepository: UserRepository
	) {}

	public data: any[] = [];

	public say(sth: string) {
		this.logger.log(sth);
	}

	getUser(id: string) {
		return this.userRepository.find(id);
	}

	@Event.on({ event: 'user:say' })
	private static sayFromEvent(e: EventData<string>) {
		const logger = Service.get(LoggerService)!;
		logger.log(`from source: ${e.source} with event: ${e.data}`);
		throw new Error('Custom error');
	}
}

const co = Http.decorate((c: Context) => {
	return c.controller;
});

const mo = Http.decorate((c: Context) => {
	return c.module;
});

@Http.controller({ path: '/users', scope: HttpControllerScope.SERVER, tags: ['users'] })
class UserController {
	public constructor(
		@Service.inject('user.service') public readonly userService: UserService,
		public id: string = uid(8)
	) {}

	@Http.get({
		response: t.Array(UserModel.selectSchema),
		operationId: 'users.list',
		description: 'Get all users'
	})
	private async list(
		@mo() module: InstanceType<Class<MainModule>>,
		@Service.inject() logger: LoggerService,
		@Http.context() c: Context
	): Promise<Array<User>> {
		// logger.log('ctx', App.context.getStore());
		let list = await Cache.memory.get<Array<User>>(`${c.tenant}:users:list`);
		if (!list) {
			list = await this.userService.userRepository.all();
			await Cache.memory.set(`${c.tenant}:users:list`, list);
		}

		return list;
	}

	@Http.del({ response: t.Array(UserModel.selectSchema) })
	private deleteAll() {
		return this.userService.userRepository.deleteAll();
	}

	@Http.get({ path: '/:id', response: UserModel.selectSchema })
	private async getUser(
		@Http.param('id', t.String({ format: 'uuid' })) id: string,
		@Http.context() c: any
	) {
		const user = await this.userService.getUser(id);
		return !!user ? user : c.error(404, { message: 'User not found' });
	}

	@Http.post({ response: UserModel.selectSchema })
	private async post(
		@Http.body(UserModel.createSchema) b: UserInsert,
		@Http.query() q: any,
		@co() c: UserController
	) {
		const user = await this.userService.userRepository.insert(b);
		Event.emit('user:add', user);
		return user;
	}

	@Http.patch({ response: UserModel.selectSchema })
	private patch(
		@Http.body(UserModel.updateSchema) b: UserInsert,
		@Http.query() q: any,
		@co() c: UserController
	) {
		// return this.db.insert(usersTable).values(b).returning();
	}

	@Http.sse({ path: '/:id/notifications' })
	private async sse(@Http.query() q: any, @Http.context() c: Context) {
		while (isEmpty(this.userService.data)) {
			await Bun.sleep(1);
		}

		return JSON.stringify(this.userService.data.shift());
	}

	@Event.on({ event: 'user:add' })
	private static addFromEvent(e: EventData<User>) {
		const us = Service.get<UserService>('user.service')!;
		us.data.push(e.data);
		WorkerPool.instance.runJob(EmailJob, e.data.email, 'Hello from Elysium!');
	}

	@Http.onRequest()
	private onRequest(c: Context) {
		// this.userService.logger.log(c);
	}
}

@Websocket.controller({ path: '/ws', options: { idleTimeout: 10 } })
class MessagingServer {
	public constructor(@Service.inject() public logger: LoggerService) {}

	@Websocket.onOpen()
	private onOpen() {
		this.logger.log('websocket opened');
	}

	@Websocket.onClose()
	private onClose() {
		this.logger.log('websocket closed');
	}

	@Websocket.onMessage(UserModel.createSchema)
	private onMessage(ws: WS, data: UserInsert) {
		this.logger.log(`received message: ${JSON.stringify(data)} from ${ws.data.id}`);
		ws.send(JSON.stringify({ message: `Created user ${data.name}` }));
		throw new Error('Test websocket error');
	}

	@Websocket.onError()
	private onErrorWS(e: WSError) {
		this.logger.error(e.error.message);
	}
}

@Wamp.controller({ url: 'ws://127.0.0.1:8888', realm: 'realm1' })
class WampController {
	public constructor(@Service.inject() public logger: LoggerService) {}

	@Wamp.register('test.topic')
	private onTestTopic(data: WampRegistrationHandlerArgs) {
		this.logger.log(`Received data: ${data.argsList}`);
		return 'Hello from WampController';
	}
}

@Wamp.controller({ url: 'ws://127.0.0.1:8888', realm: 'realm1' })
class WampController2 {
	public constructor(@Service.inject() public logger: LoggerService) {}

	@Wamp.register('test.topic.ext')
	private onTestTopic(data: WampRegistrationHandlerArgs) {
		console.log('Received data: ', data);
		data.result_handler({ argsList: ['Hello from WampController1'], options: { progress: true } });
		// ...
		data.result_handler({ argsList: ['Hello from WampController2'], options: { progress: true } });
		// ...
		data.result_handler({ argsList: ['Hello from WampController3'], options: { progress: true } });
	}

	@Wamp.subscribe('test.topic.notify')
	private onTestTopicNotify(data: WampRegistrationHandlerArgs) {
		console.log('Received data: ', data);
	}

	@Wamp.onOpen()
	private onOpen() {
		this.logger.log('Wamp connection opened');
	}

	@Wamp.onClose()
	private onClose() {
		this.logger.log('Wamp connection closed');
	}

	@Wamp.onError()
	private onError() {
		this.logger.error('Wamp connection error');
	}

	@Wamp.onReconnect()
	private onReconnect() {
		this.logger.log('Wamp reconnecting');
	}

	@Wamp.onReconnectSuccess()
	private onReconnectSuccess() {
		this.logger.log('Wamp reconnected');
	}
}

@Module.register({
	controllers: [UserController, MessagingServer, WampController, WampController2]
})
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

	constructor(@Service.inject('user.service') private userService: UserService) {
		super();
	}

	@Command.arg('name', { description: 'Name of the user', required: true })
	private name: string = '';

	@Command.arg('age', { description: 'Age of the user', required: true, default: 28 })
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

	@Command.arg('task', {
		description: 'The type of task to simulate',
		default: 'download',
		enum: ['download', 'process', 'connect', 'upload', 'analyze'],
		type: CommandArgumentType.ENUM
	})
	private task: string = 'download';

	@Command.arg('duration', {
		description: 'Duration of the simulated task in seconds',
		type: CommandArgumentType.NUMBER,
		default: 5
	})
	private duration: number = 5;

	@Command.arg('steps', {
		description: 'Number of steps in the simulated task',
		type: CommandArgumentType.NUMBER,
		default: 3
	})
	private steps: number = 3;

	@Command.arg('fail', {
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

/**
 * A command that demonstrates the use of the progress bar for operations with known steps.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export class ProgressDemoCommand extends Command {
	public static readonly command: string = 'demo:progress';
	public static readonly description: string =
		'Demonstrates the use of progress bars for operations with known steps';

	@Command.arg('task', {
		description: 'The type of task to simulate',
		default: 'file',
		enum: ['file', 'database', 'import', 'export', 'batch'],
		type: CommandArgumentType.ENUM
	})
	private task: string = 'file';

	@Command.arg('items', {
		description: 'Number of items to process',
		type: CommandArgumentType.NUMBER,
		default: 100
	})
	private items: number = 100;

	@Command.arg('delay', {
		description: 'Delay between items in milliseconds',
		type: CommandArgumentType.NUMBER,
		default: 50
	})
	private delay: number = 50;

	@Command.arg('fail', {
		description: 'Simulate a failure during the operation',
		type: CommandArgumentType.BOOLEAN,
		default: false
	})
	private fail: boolean = false;

	/**
	 * Run the progress bar demo command.
	 */
	public async run(): Promise<void> {
		this.title('Progress Bar Demo');

		this.info(`Simulating a ${this.task} processing operation with ${this.items} items`);

		if (this.fail) {
			this.warning('This demo will simulate a failure');
		}

		try {
			// Create a progress bar
			const progress = this.progress(this.items, `Processing ${this.task} items`);

			// Process each item
			for (let i = 1; i <= this.items; i++) {
				// Simulate processing time
				await Bun.sleep(this.delay);

				// Update progress
				if (i % 10 === 0) {
					progress.update(
						1,
						`Processing ${this.task} items (batch ${Math.floor(i / 10)} of ${Math.floor(this.items / 10)})`
					);
				} else {
					progress.update(1);
				}

				// Occasionally pause to show a message
				if (i % 25 === 0) {
					progress.pause(`Checkpoint reached: ${i} items processed`);
				}

				// Simulate a failure if requested
				if (this.fail && i === Math.floor(this.items / 2)) {
					throw new Error(`Failed during ${this.task} processing at item ${i}`);
				}
			}

			// Show completion message
			this.success(`Successfully processed ${this.items} ${this.task} items`);

			// Show some stats
			this.info(`Average processing time: ${(this.delay / 1000).toFixed(2)}s per item`);
			this.info(`Total items: ${this.items}`);
		} catch (error: any) {
			this.newLine();
			this.error(`Operation failed: ${error.message}`);
			return;
		}

		// Ask if the user wants to run another demo
		if (await this.confirm('Would you like to run another progress demo?')) {
			// Let the user select a different task
			this.task = await this.select('Select a task to simulate:', [
				'file',
				'database',
				'import',
				'export',
				'batch'
			]);

			// Let the user input custom items count
			const itemsStr = await this.prompt('Enter number of items to process', '100');
			this.items = parseInt(itemsStr, 10) || 100;

			// Let the user input custom delay
			const delayStr = await this.prompt('Enter delay between items (ms)', '50');
			this.delay = parseInt(delayStr, 10) || 50;

			// Run again
			await this.run();
		} else {
			this.success('Demo completed. Thanks for trying out the progress bar!');
		}
	}
}

@Middleware.register(XServerMiddleware)
@Application.register({
	modules: [MainModule],
	commands: [TestCommand, SpinnerDemoCommand, ProgressDemoCommand],
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
			cache: { url: process.env.REDIS_URL! }
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
export class App extends Application {
	protected async onStart(e: Elysia<Route>) {
		await super.onStart(e);
		await WorkerPool.instance.init();
		WorkerPool.instance.addWorker(['email']);
		WorkerPool.instance.addWorker(['email', 'sync']);
	}
}

Event.on('elysium:error', (e: EventData<Error>) => {
	console.error('Fuck', JSON.stringify(e));
});

Event.on('elysium:app:stop', () => {
	console.log('Stopping Elysium');
});
