import type { EventData } from '@elysiumjs/core';

import { Event, Service, ServiceScope } from '@elysiumjs/core';

import { UserRepository } from '#root/repositories/user.repository';
import { LoggerService } from '#root/services/logger.service';

@Service.register({ name: 'user.service', scope: ServiceScope.SINGLETON })
export class UserService {
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
