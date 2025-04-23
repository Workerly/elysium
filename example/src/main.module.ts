import { Module } from '@elysiumjs/core';

import { UserController } from './controllers/http/user.controller';
import { TestController } from './controllers/wamp/test.controller';
import { ChatServerController } from './controllers/websocket/chat-server.controller';

@Module.register({
	controllers: [UserController, ChatServerController, TestController]
})
export class MainModule extends Module {
	public constructor() {
		super();
	}

	public afterRegister() {
		console.log('Module registered successfully');
	}
}
