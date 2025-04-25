import { Repository, Service, ServiceScope } from '@elysiumjs/core';

import { UserModel } from '#root/models/user.model';

@Service.register({ name: 'UserRepository', scope: ServiceScope.SINGLETON })
export class UserRepository extends Repository(UserModel) {}
