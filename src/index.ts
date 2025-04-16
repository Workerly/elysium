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
		return await this.userService.userRepository.all();
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
		this.userService.logger.log(c);
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

@middleware(XServerMiddleware)
@app({
	modules: [MainModule],
	server: {
		name: App.name
	},
	debug: false,
	database: {
		default: 'main',
		connections: {
			main: { connection: process.env.DATABASE_URL! }
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
class App extends Application {}

Event.on('elysium:error', (e: EventData<Error>) => {
	// console.error('Fuck', JSON.stringify(e));
});

setInterval(() => {
	Event.emit('user:add', { id: uid(8), name: `User ${uid(8)}` });
}, 1000);

await new App().start();

const response = await fetch('http://localhost:3000/users');
console.log(await response.text());
