import type { EventData } from './core/event';
import type { WS } from './core/websocket';

import { Elysia, t } from 'elysia';

import { Event, on } from './core/event';
import { get, inject, service } from './core/service';
import { ElysiaPlugin, Scope, Symbols } from './core/utils';
import { onClose, onMessage, onOpen, websocket } from './core/websocket';

@service({ scope: Scope.FACTORY })
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

	@on({ event: 'user:say' })
	private static sayFromEvent(e: EventData<string>) {
		const logger = get(LoggerService)!;
		logger.log(`from source: ${e.source} with event: ${e.data}`);
		throw new Error('Custom error');
	}
}

@service()
class UserController {
	public constructor(@inject('user.service') public userService: UserService) {}
}

const MessageData = t.Object({
	message: t.String()
});

type MessageData = typeof MessageData.static;

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
	}
}

const c = get(UserController);
if (c === null) {
	console.error(`${UserController.name} not found!`);
	process.exit(1);
} else {
	c.userService.say('hello Elysium, from user controller!');
}

const s = get<UserService>('user.service');
if (s === null) {
	console.error(`${UserService.name} not found!`);
	process.exit(1);
} else {
	s.say('hello Elysium, from user service!');
}

const l = get(LoggerService);
if (l === null) {
	console.log(`${LoggerService.name} not found!`);
	process.exit(1);
} else {
	l.log('hello Elysium, from logger service!');
}

Event.on('elysium:error', (e: EventData<Error>) => {
	console.error('Fuck', e.data.message);
});

Event.emit<string>('user:say', 'wowowow!!', c);

console.log(l === s.logger);
console.log(s === c.userService);

const ws: ElysiaPlugin = Reflect.getMetadata(Symbols.elysiaPlugin, MessagingServer);
if (ws === undefined) {
	console.error('No websocket route found!');
	process.exit(1);
}

const app = new Elysia()
	.use(ws())
	.onRequest(({ request }) => console.log(request.url))
	.get('/', 'Hello test')
	.listen(3000);
