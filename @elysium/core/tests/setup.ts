// Copyright (c) 2025-present Workbud Technologies Inc. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { afterAll, jest, mock } from 'bun:test';

import 'reflect-metadata';

import { Database } from '../src/database';
import { Event } from '../src/event';
import { applyMiddlewares, executeMiddlewareChain, Middleware } from '../src/middleware';
import { Redis } from '../src/redis';
import { Service } from '../src/service';

// Mock dependencies
mock.module('../src/database', () => ({
	Database: {
		registerConnection: mock(Database.registerConnection),
		connectionExists: mock(Database.connectionExists),
		setDefaultConnection: mock(Database.setDefaultConnection),
		getDefaultConnection: mock(Database.getDefaultConnection),
		getConnection: mock(Database.getConnection)
	}
}));

mock.module('../src/redis', () => ({
	Redis: {
		registerConnection: mock(Redis.registerConnection),
		connectionExists: mock(Redis.connectionExists),
		setDefaultConnection: mock(Redis.setDefaultConnection),
		getDefaultConnection: mock(Redis.getDefaultConnection),
		getConnection: mock(Redis.getConnection)
	}
}));

mock.module('../src/service', () => ({
	Service: {
		instance: mock(Service.instance),
		make: mock(Service.make),
		get: mock(Service.get),
		bind: mock(Service.bind),
		clear: mock(Service.clear),
		exists: mock(Service.exists),
		remove: mock(Service.remove)
	}
}));

mock.module('../src/event', () => ({
	Event: {
		emit: mock(Event.emit),
		on: mock(Event.on),
		once: mock(Event.once),
		off: mock(Event.off),
		clear: mock(Event.clear),
		listen: mock(Event.listen)
	}
}));

mock.module('node:async_hooks', () => ({
	AsyncLocalStorage: class {
		public run = mock((map, callback) => callback());
		public disable = mock();
	}
}));
