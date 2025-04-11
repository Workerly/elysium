import 'reflect-metadata';

import type { EventData } from './core/event';
import type { WampRegistrationHandlerArgs } from './core/wamp';
import type { WS, WSError } from './core/websocket';

import { Context, t } from 'elysia';
import { list, uid } from 'radash';

import { app, Application } from './core/app';
import { Event, on } from './core/event';
import {
	body,
	context,
	decorate,
	get,
	get as getHttp,
	http,
	HttpControllerScope,
	param,
	post,
	query
} from './core/http';
import { module, Module } from './core/module';
import { inject, Service, service, ServiceScope } from './core/service';
import {
	onClose as onCloseWamp,
	onError,
	onOpen as onOpenWamp,
	onReconnect,
	onReconnectSuccess,
	register,
	subscribe,
	wamp
} from './core/wamp';
import { onClose, onError as onErrorWS, onMessage, onOpen, websocket } from './core/websocket';

@service({ scope: ServiceScope.FACTORY })
class LoggerService {
	public log(msg: string) {
		console.log(msg);
	}

	public error(msg: string) {
		console.error(msg);
	}
}

@service({ name: 'user.service' })
class UserService {
	public constructor(@inject() public logger: LoggerService) {}

	public say(sth: string) {
		this.logger.log(sth);
	}

	getUser(id: string) {
		return { id, name: `User ${id}` };
	}

	@on({ event: 'user:say' })
	private static sayFromEvent(e: EventData<string>) {
		const logger = Service.get(LoggerService)!;
		logger.log(`from source: ${e.source} with event: ${e.data}`);
		throw new Error('Custom error');
	}
}

const MessageData = t.Object({
	message: t.String()
});

type MessageData = typeof MessageData.static;

const co = decorate((c: Context) => {
	// @ts-ignore
	return c.controller;
});

@http({ path: '/users', scope: HttpControllerScope.SERVER })
class UserController {
	public constructor(
		@inject('user.service') public userService: UserService,
		public id: string = uid(8)
	) {}

	@getHttp('/:id')
	private getUser(@param('id') id: string, @context() c: any) {
		console.log(c);
		return this.userService.getUser(id);
	}

	@post()
	private post(@body(MessageData) b: MessageData, @query() q: any, @co() c: UserController) {
		return { b, q, c };
	}

	@get()
	private async *get(@query() q: any, @context() c: any) {
		for (const each of list(15)) {
			yield each;
			await Bun.sleep(1000);
		}
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

	@onMessage(MessageData)
	private onMessage(ws: WS, data: MessageData) {
		this.logger.log(`received message: ${data.message} from ${ws.data.id}`);
		ws.send(JSON.stringify({ message: `Echo: ${data.message}` }));
		throw new Error('Test websocket error');
	}

	@onErrorWS()
	private onErrorWS(e: WSError) {
		this.logger.error(e.error.message);
	}
}

@wamp({ url: 'ws://127.0.0.1:8888', realm: 'realm1' })
class WampController {
	public constructor(@inject() public logger: LoggerService) {}

	@register('test.topic')
	private onTestTopic(data: WampRegistrationHandlerArgs) {
		this.logger.log(`Received data: ${data.argsList}`);
		return 'Hello from WampController';
	}
}

@wamp({ url: 'ws://127.0.0.1:8888', realm: 'realm1' })
class WampController2 {
	public constructor(@inject() public logger: LoggerService) {}

	@register('test.topic.ext')
	private onTestTopic(data: WampRegistrationHandlerArgs) {
		console.log('Received data: ', data);
		data.result_handler({ argsList: ['Hello from WampController1'], options: { progress: true } });
		// ...
		data.result_handler({ argsList: ['Hello from WampController2'], options: { progress: true } });
		// ...
		data.result_handler({ argsList: ['Hello from WampController3'], options: { progress: true } });
	}

	@subscribe('test.topic.notify')
	private onTestTopicNotify(data: WampRegistrationHandlerArgs) {
		console.log('Received data: ', data);
	}

	@onOpenWamp()
	private onOpen() {
		this.logger.log('Wamp connection opened');
	}

	@onCloseWamp()
	private onClose() {
		this.logger.log('Wamp connection closed');
	}

	@onError()
	private onError() {
		this.logger.error('Wamp connection error');
	}

	@onReconnect()
	private onReconnect() {
		this.logger.log('Wamp reconnecting');
	}

	@onReconnectSuccess()
	private onReconnectSuccess() {
		this.logger.log('Wamp reconnected');
	}
}

@module({ controllers: [UserController, MessagingServer] })
class MainModule extends Module {
	public constructor() {
		super();
	}

	public afterRegister() {
		console.log('Module registered successfully');
	}
}

@app({ modules: [MainModule] })
class App extends Application {
	public constructor() {
		super({
			name: App.name
		});
	}
}

Event.on('elysium:error', (e: EventData<Error>) => {
	console.error('Fuck', e.data.message);
});

await new App().start();
