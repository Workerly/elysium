import 'reflect-metadata';

import type { EventData } from './core/event';
import type { WampRegistrationHandlerArgs } from './core/wamp';
import type { WS, WSError } from './core/websocket';

import { Context, Elysia, t } from 'elysia';
import { uid } from 'radash';
import Wampy from 'wampy';

import { Event, on } from './core/event';
import {
	body,
	context,
	decorate,
	get as getHttp,
	http,
	HttpControllerScope,
	param,
	post,
	query
} from './core/http';
import { inject, Service, service, ServiceScope } from './core/service';
import { ElysiaPlugin, Symbols } from './core/utils';
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

class WampWebsocket extends WebSocket {
	public constructor(url: string, protocols?: string | string[]) {
		super(url, protocols);
	}

	public get protocol(): string {
		return 'wamp.2.json';
	}
}

const w = new Wampy('ws://127.0.0.1:8888', {
	ws: WampWebsocket,
	realm: 'realm1',
	autoReconnect: true,
	maxRetries: 10,
	retryInterval: 1000
});

w.connect()
	.then(() => {
		console.log('connected');
	})
	.catch((err) => {
		console.error('error connecting', err);
	});

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

const s = Service.get<UserService>('user.service');
if (s === null) {
	console.error(`${UserService.name} not found!`);
	process.exit(1);
} else {
	s.say('hello Elysium, from user service!');
}

const l = Service.get(LoggerService);
if (l === null) {
	console.log(`${LoggerService.name} not found!`);
	process.exit(1);
} else {
	l.log('hello Elysium, from logger service!');
}

Event.on('elysium:error', (e: EventData<Error>) => {
	console.error('Fuck', e.data.message);
});

console.log(l === s.logger);

const ws: ElysiaPlugin = Reflect.getMetadata(Symbols.elysiaPlugin, MessagingServer);
if (ws === undefined) {
	console.error('No websocket route found!');
	process.exit(1);
}

const h: ElysiaPlugin = Reflect.getMetadata(Symbols.elysiaPlugin, UserController);
if (h === undefined) {
	console.error('No http route found!');
	process.exit(1);
}

const app = new Elysia()
	.use(ws())
	.use(h())
	.onRequest(({ request }) => console.log(request.url))
	.get('/', async function () {
		const values: any[] = [];
		await w.call(
			'test.topic.ext',
			{
				argsList: [1, 2, 3],
				argsDict: { hello: 'world' }
			},
			{
				progress_callback(data) {
					values.push(data.argsList[0]);
				}
			}
		);

		return values;
	})
	.listen(3000);
