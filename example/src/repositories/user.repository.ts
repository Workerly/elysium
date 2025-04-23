import { Repository, Service } from '@elysiumjs/core';
import { UserModel } from '../models/user.model';

@Service.register()
export class UserRepository extends Repository(UserModel) {}
