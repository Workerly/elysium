import { Elysia } from 'elysia';

import { get, inject, service } from './core/service';
import { Scope } from './core/utils';

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
}

@service()
class UserController {
	public constructor(@inject('user.service') public userService: UserService) {}
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

console.log(l === s.logger);
console.log(s === c.userService);
