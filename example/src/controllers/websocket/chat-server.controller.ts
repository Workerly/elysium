import type { WS, WSError } from '@elysiumjs/core';
import type { UserInsert } from '#root/models/user.model';

import { Service, Websocket } from '@elysiumjs/core';

import { UserModel } from '#root/models/user.model';
import { LoggerService } from '#root/services/logger.service';

@Websocket.controller({ path: '/chat', options: { idleTimeout: 10 } })
export class ChatServerController {
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
