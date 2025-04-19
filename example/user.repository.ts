import { Repository, Service } from '../src/core';
import { UserModel } from './user.model';

@Service.register()
export class UserRepository extends Repository(UserModel) {}
