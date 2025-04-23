import { InteractsWithConsole, Service, ServiceScope } from '@elysiumjs/core';

@Service.register({ scope: ServiceScope.FACTORY })
export class LoggerService extends InteractsWithConsole {
	public log(...msg: any[]) {
		this.write(msg.join(' '));
	}
}
