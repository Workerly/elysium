import type { Context, EventData } from '@elysiumjs/core';
import type { Class } from 'type-fest';
import type { MainModule } from '../../main.module';
import type { User, UserInsert } from '../../models/user.model';

import { Cache, Event, Http, HttpControllerScope, Service, WorkerPool } from '@elysiumjs/core';
import { t } from 'elysia';
import { isEmpty, uid } from 'radash';

import { EmailJob } from '../../jobs/email.job';
import { UserModel } from '../../models/user.model';
import { LoggerService } from '../../services/logger.service';
import { UserService } from '../../services/user.service';
import { co, mo } from '../../utils/decorators';

@Http.controller({ path: '/users', scope: HttpControllerScope.SERVER, tags: ['users'] })
export class UserController {
	public constructor(
		@Service.inject('user.service') public readonly userService: UserService,
		public id: string = uid(8)
	) {}

	@Http.get({
		response: t.Array(UserModel.selectSchema),
		operationId: 'users.list',
		description: 'Get all users',
		transactional: true
	})
	private async list(
		@mo() module: InstanceType<Class<MainModule>>,
		@Service.inject() logger: LoggerService,
		@Http.context() c: Context
	): Promise<Array<User>> {
		// logger.log('ctx', App.context.getStore());
		let list = await Cache.memory.get<Array<User>>(`${c.tenant}:users:list`);
		if (!list) {
			list = await this.userService.userRepository.all();
			await Cache.memory.set(`${c.tenant}:users:list`, list);
		}

		return list;
	}

	@Http.del({ response: t.Array(UserModel.selectSchema) })
	private async deleteAll(@Http.context() c: Context) {
		await Cache.memory.del(`${c.tenant}:users:list`);
		return this.userService.userRepository.deleteAll();
	}

	@Http.get({ path: '/:id', response: UserModel.selectSchema })
	private async getUser(
		@Http.param('id', t.String({ format: 'uuid' })) id: string,
		@Http.context() c: any
	) {
		const user = await this.userService.getUser(id);
		return !!user ? user : c.error(404, { message: 'User not found' });
	}

	@Http.post({ response: UserModel.selectSchema })
	private async post(
		@Http.body(UserModel.createSchema) b: UserInsert,
		@Http.query() q: any,
		@co() c: UserController
	) {
		const user = await this.userService.userRepository.insert(b);
		Event.emit('user:add', user);
		return user;
	}

	@Http.patch({ response: UserModel.selectSchema })
	private patch(
		@Http.body(UserModel.updateSchema) b: UserInsert,
		@Http.query() q: any,
		@co() c: UserController
	) {
		// return this.db.insert(usersTable).values(b).returning();
	}

	@Http.sse({ path: '/:id/notifications' })
	private async sse(@Http.query() q: any, @Http.context() c: Context) {
		while (isEmpty(this.userService.data)) {
			await Bun.sleep(1);
		}

		return JSON.stringify(this.userService.data.shift());
	}

	@Event.on({ event: 'user:add' })
	private static addFromEvent(e: EventData<User>) {
		const us = Service.get<UserService>('user.service')!;
		us.data.push(e.data);
		WorkerPool.instance.runJob(EmailJob, e.data.email, 'Hello from Elysium!');
	}

	@Http.onRequest()
	private onRequest(c: Context) {
		// this.userService.logger.log(c);
	}
}
