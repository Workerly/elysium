import { Module } from '@elysiumjs/core';

import { UserController } from '#root/controllers/http/user.controller';
import { TestController } from '#root/controllers/wamp/test.controller';
import { ChatServerController } from '#root/controllers/websocket/chat-server.controller';

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
