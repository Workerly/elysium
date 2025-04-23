import type { WampRegistrationHandlerArgs } from '@elysiumjs/core';

import { Service, Wamp } from '@elysiumjs/core';
import { LoggerService } from '../../services/logger.service';

@Wamp.controller({ url: 'ws://127.0.0.1:8888', realm: 'realm1' })
export class TestController {
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
