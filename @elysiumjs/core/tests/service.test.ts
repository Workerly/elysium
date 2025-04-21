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

import type { Mock } from 'bun:test';

import { afterAll, afterEach, beforeEach, describe, expect, it, jest, mock, spyOn } from 'bun:test';

import { Service, ServiceScope } from '../src/service';
import { Symbols } from '../src/utils';

// Mock process.exit to prevent tests from exiting
const originalExit = process.exit;
const originalConsoleError = console.error;

describe('Service', () => {
	beforeEach(() => {
		process.exit = mock() as any;
		console.error = mock() as any;
		Service.clear();
	});

	afterEach(() => {
		process.exit = originalExit;
		console.error = originalConsoleError;
	});

	afterAll(() => {
		Service.clear();
	});

	describe('Service registration', () => {
		it('should register a service with the @Service.register decorator', () => {
			@Service.register()
			class TestService {}

			expect(Service.exists(TestService)).toBe(true);
			expect(Service.exists('TestService')).toBe(true);
		});

		it('should register a service with a custom name', () => {
			@Service.register({ name: 'CustomName' })
			class TestService {}

			expect(Service.exists('CustomName')).toBe(true);
			expect(Service.exists(TestService)).toBe(false);
		});

		it('should register a service with singleton scope by default', () => {
			@Service.register()
			class TestService {}

			const instance1 = Service.get(TestService);
			const instance2 = Service.get(TestService);

			expect(instance1).toBe(instance2);
		});

		it('should register a service with factory scope', () => {
			@Service.register({ scope: ServiceScope.FACTORY })
			class TestService {}

			const instance1 = Service.get(TestService);
			const instance2 = Service.get(TestService);

			expect(instance1).not.toBe(instance2);
		});

		it('should not allow registering a service with the same name twice', () => {
			@Service.register({ name: 'test' })
			class TestService1 {}

			@Service.register({ name: 'test' })
			class TestService {}

			expect(console.error).toHaveBeenCalled();
			expect(process.exit).toHaveBeenCalledWith(1);
		});
	});

	describe('Service retrieval', () => {
		it('should retrieve a service by class', () => {
			@Service.register()
			class TestService {}

			const instance = Service.get(TestService);
			expect(instance).toBeInstanceOf(TestService);
		});

		it('should retrieve a service by name', () => {
			@Service.register()
			class TestService {}

			const instance = Service.get('TestService');
			expect(instance).toBeInstanceOf(TestService);
		});

		it('should return null if the service does not exist', () => {
			const instance = Service.get('NonExistentService');
			expect(instance).toBeNull();
		});
	});

	describe('Service dependency injection', () => {
		it('should inject dependencies into a service constructor', () => {
			@Service.register()
			class DependencyService {
				public value = 'dependency';
			}

			@Service.register()
			class TestService {
				constructor(@Service.inject() public dependency: DependencyService) {}
			}

			const instance = Service.get(TestService);
			expect(instance.dependency).toBeInstanceOf(DependencyService);
			expect(instance.dependency.value).toBe('dependency');
		});

		it('should inject dependencies with custom names', () => {
			@Service.register({ name: 'CustomDependency' })
			class DependencyService {
				public value = 'custom dependency';
			}

			@Service.register()
			class TestService {
				constructor(@Service.inject('CustomDependency') public dependency: any) {}
			}

			const instance = Service.get(TestService);
			expect(instance.dependency.value).toBe('custom dependency');
		});

		it('should throw an error if a dependency does not exist', () => {
			@Service.register()
			class TestService {
				constructor(@Service.inject('NonExistentDependency') public dependency: any) {}
			}

			Service.make(TestService);
			expect(console.error).toHaveBeenCalled();
			expect(process.exit).toHaveBeenCalledWith(1);
		});
	});

	describe('Service scopes', () => {
		it('should create a singleton service', () => {
			@Service.register({ scope: ServiceScope.SINGLETON })
			class TestService {}

			const instance1 = Service.get(TestService);
			const instance2 = Service.get(TestService);

			expect(instance1).toBe(instance2);
		});

		it('should create a factory service', () => {
			@Service.register({ scope: ServiceScope.FACTORY })
			class TestService {}

			const instance1 = Service.get(TestService);
			const instance2 = Service.get(TestService);

			expect(instance1).not.toBe(instance2);
		});

		it('should create a new instance with make() even for singleton services', () => {
			@Service.register({ scope: ServiceScope.SINGLETON })
			class TestService {}

			const instance1 = Service.get(TestService);
			const instance2 = Service.make(TestService);

			expect(instance1).not.toBe(instance2);
		});
	});

	describe('Service lifecycle', () => {
		it('should bind a service as a singleton', () => {
			class TestService {}

			const instance = Service.bind(TestService);
			expect(Service.exists(TestService)).toBe(true);
			expect(Service.get(TestService)).toBe(instance);
		});

		it('should bind a service with a custom name', () => {
			class TestService {}

			const instance = Service.bind(TestService, 'CustomName');
			expect(Service.exists('CustomName')).toBe(true);
			expect(Service.get('CustomName')).toBe(instance);
		});

		it('should register a service instance', () => {
			class TestService {}
			const testInstance = new TestService();

			const instance = Service.instance(TestService, testInstance);
			expect(Service.exists(TestService)).toBe(true);
			expect(Service.get(TestService)).toBe(testInstance);
			expect(instance).toBe(testInstance);
		});

		it('should register a service instance with a custom name', () => {
			class TestService {}
			const testInstance = new TestService();

			const instance = Service.instance('CustomName', testInstance);
			expect(Service.exists('CustomName')).toBe(true);
			expect(Service.get('CustomName')).toBe(testInstance);
			expect(instance).toBe(testInstance);
		});

		it('should register a factory function with a class', () => {
			class TestService {
				public value: string;
				constructor() {
					this.value = 'factory';
				}
			}

			const instance = Service.factory(TestService);
			expect(Service.exists(TestService)).toBe(true);
			expect(instance).toBeInstanceOf(TestService);
			expect(instance.value).toBe('factory');

			// Should create a new instance each time
			const instance2 = Service.get(TestService);
			expect(instance2).not.toBe(instance);
			expect(instance2).toBeInstanceOf(TestService);
		});

		it('should register a factory function with a custom name', () => {
			const factoryFn = () => ({ value: 'custom factory' });

			const instance = Service.factory('CustomFactory', factoryFn);
			expect(Service.exists('CustomFactory')).toBe(true);
			expect(instance.value).toBe('custom factory');

			// Should create a new instance each time
			const instance2 = Service.get('CustomFactory');
			expect(instance2).not.toBe(instance);
			expect(instance2.value).toBe('custom factory');
		});

		it('should remove a service by class', () => {
			@Service.register()
			class TestService {}

			expect(Service.exists(TestService)).toBe(true);
			Service.remove(TestService);
			expect(Service.exists(TestService)).toBe(false);
		});

		it('should remove a service by name', () => {
			@Service.register()
			class TestService {}

			expect(Service.exists('TestService')).toBe(true);
			Service.remove('TestService');
			expect(Service.exists('TestService')).toBe(false);
		});

		it('should clear all services', () => {
			@Service.register()
			class TestService1 {}

			@Service.register()
			class TestService2 {}

			expect(Service.exists(TestService1)).toBe(true);
			expect(Service.exists(TestService2)).toBe(true);

			Service.clear();

			expect(Service.exists(TestService1)).toBe(false);
			expect(Service.exists(TestService2)).toBe(false);
		});
	});
});
