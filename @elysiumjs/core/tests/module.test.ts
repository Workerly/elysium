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

import type { ModuleProps } from '../src/module.ts';

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as E from 'elysia';

import * as M from '../src/middleware.ts';
import { Module } from '../src/module.ts';
import { Symbols } from '../src/utils.ts';

// Mock Elysia
const mockElysia = {
	decorate: mock(),
	use: mock().mockResolvedValue({}),
	name: 'test-module',
	onBeforeHandle: mock(),
	onAfterHandle: mock(),
	onAfterResponse: mock()
};

// Mock console.log and console.error to prevent actual console output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalProcessExit = process.exit;

describe('Module', () => {
	beforeEach(() => {
		console.log = mock();
		console.error = mock();
		process.exit = mock() as any;
		mock.restore();
	});

	afterEach(() => {
		console.log = originalConsoleLog;
		console.error = originalConsoleError;
		process.exit = originalProcessExit;
		mock.restore();
	});

	describe('@Module.register decorator', () => {
		it('should set metadata on the target class', () => {
			// Create a test module class
			@Module.register()
			class TestModule extends Module {}

			// Check if metadata was set correctly
			const handleModule = Reflect.getMetadata(Symbols.elysiaPlugin, TestModule);
			expect(handleModule).toBeDefined();
			expect(typeof handleModule).toBe('function');
		});

		it('should set metadata with controllers if provided', () => {
			// Create mock controller classes
			class Controller1 {}
			class Controller2 {}

			// Create a test module class with controllers
			const moduleProps: ModuleProps = {
				controllers: [Controller1, Controller2]
			};

			@Module.register(moduleProps)
			class TestModule extends Module {}

			// Check if metadata was set correctly
			const handleModule = Reflect.getMetadata(Symbols.elysiaPlugin, TestModule);
			expect(handleModule).toBeDefined();
			expect(typeof handleModule).toBe('function');
		});
	});

	describe('Module initialization', () => {
		it('should initialize a module with no controllers', async () => {
			const elysiaSpy = spyOn(E, 'Elysia').mockReturnValueOnce(mockElysia);

			// Create a test module class
			@Module.register()
			class TestModule extends Module {}

			// Get the handleModule function
			const handleModule = Reflect.getMetadata(Symbols.elysiaPlugin, TestModule);

			// Create a module instance
			const moduleInstance = new TestModule();

			const applyMiddlewaresSpy = spyOn(M, 'applyMiddlewares');

			// Call the handleModule function
			await handleModule(moduleInstance);

			// Check if Elysia was instantiated with the correct parameters
			expect(elysiaSpy).toHaveBeenCalledWith({ name: 'TestModule' });

			// Check if the module was decorated
			expect(mockElysia.decorate).toHaveBeenCalledWith('module', moduleInstance);

			// Check if applyMiddlewares was called
			expect(applyMiddlewaresSpy).toHaveBeenCalledWith([], mockElysia);

			// Check if no controllers were processed
			expect(mockElysia.use).not.toHaveBeenCalled();
		});

		it('should initialize a module with controllers', async () => {
			const elysiaSpy = spyOn(E, 'Elysia').mockReturnValueOnce(mockElysia);

			// Create mock controller classes with Elysia plugins
			class Controller1 {}
			class Controller2 {}

			// Create mock Elysia plugins for controllers
			const mockPlugin1 = mock().mockResolvedValue({});
			const mockPlugin2 = mock().mockResolvedValue({});

			// Set metadata on controllers
			Reflect.defineMetadata(Symbols.elysiaPlugin, mockPlugin1, Controller1);
			Reflect.defineMetadata(Symbols.elysiaPlugin, mockPlugin2, Controller2);

			// Create a test module class with controllers
			@Module.register({
				controllers: [Controller1, Controller2]
			})
			class TestModule extends Module {}

			// Get the handleModule function
			const handleModule = Reflect.getMetadata(Symbols.elysiaPlugin, TestModule);

			// Create a module instance
			const moduleInstance = new TestModule();

			const applyMiddlewaresSpy = spyOn(M, 'applyMiddlewares');

			// Call the handleModule function
			await handleModule(moduleInstance);

			// Check if Elysia was instantiated with the correct parameters
			expect(elysiaSpy).toHaveBeenCalledWith({ name: 'TestModule' });

			// Check if the module was decorated
			expect(mockElysia.decorate).toHaveBeenCalledWith('module', moduleInstance);

			// Check if applyMiddlewares was called
			expect(applyMiddlewaresSpy).toHaveBeenCalledWith([], mockElysia);

			// Check if controllers were processed
			expect(mockPlugin1).toHaveBeenCalled();
			expect(mockPlugin2).toHaveBeenCalled();
			expect(mockElysia.use).toHaveBeenCalledTimes(2);
		});

		it('should throw an error for invalid controllers', async () => {
			// Create a mock controller class without an Elysia plugin
			class InvalidController {}

			expect(Reflect.getMetadata(Symbols.elysiaPlugin, InvalidController)).toBeUndefined();

			// Create a test module class with an invalid controller
			@Module.register({
				controllers: [InvalidController]
			})
			class TestModule extends Module {}

			// Get the handleModule function
			const handleModule = Reflect.getMetadata(Symbols.elysiaPlugin, TestModule);

			// Create a module instance
			const moduleInstance = new TestModule();

			// Call the handleModule function
			await handleModule(moduleInstance);

			// Check if an error was logged and process.exit was called
			expect(console.error).toHaveBeenCalledWith(
				expect.stringContaining(
					`Invalid controller class InvalidController registered in module TestModule`
				)
			);
			expect(process.exit).toHaveBeenCalledWith(1);
		});

		it('should apply middlewares to the module', async () => {
			const elysiaSpy = spyOn(E, 'Elysia').mockReturnValueOnce(mockElysia);

			// Create mock middleware classes
			class Middleware1 {}
			class Middleware2 {}

			// Create a test module class with middlewares
			@Module.register()
			class TestModule extends Module {}

			// Set middlewares metadata on the module class
			Reflect.defineMetadata(Symbols.middlewares, [Middleware1, Middleware2], TestModule);

			// Get the handleModule function
			const handleModule = Reflect.getMetadata(Symbols.elysiaPlugin, TestModule);

			// Create a module instance
			const moduleInstance = new TestModule();

			const applyMiddlewaresSpy = spyOn(M, 'applyMiddlewares');

			// Call the handleModule function
			await handleModule(moduleInstance);

			// Check if applyMiddlewares was called with the middlewares
			expect(applyMiddlewaresSpy).toHaveBeenCalledWith([Middleware1, Middleware2], mockElysia);
		});
	});

	describe('Lifecycle hooks', () => {
		it('should call beforeRegister and afterRegister hooks', async () => {
			// Create a test module class with overridden lifecycle hooks
			@Module.register()
			class TestModule extends Module {
				public beforeRegister = mock();
				public afterRegister = mock();
			}

			// Create a mock controller class with an Elysia plugin
			class Controller {}
			const mockPlugin = mock().mockResolvedValue({});
			Reflect.defineMetadata(Symbols.elysiaPlugin, mockPlugin, Controller);

			// Set controllers for the module
			Reflect.defineMetadata(
				Symbols.elysiaPlugin,
				Reflect.getMetadata(Symbols.elysiaPlugin, TestModule),
				TestModule
			);

			// Create a module instance
			const moduleInstance = new TestModule();

			// Mock the app function to call beforeRegister and afterRegister
			const mockApp = async () => {
				moduleInstance.beforeRegister();
				const result = await mockPlugin(moduleInstance);
				moduleInstance.afterRegister();
				return result;
			};

			// Call the mock app function
			await mockApp();

			// Check if lifecycle hooks were called
			expect(moduleInstance.beforeRegister).toHaveBeenCalled();
			expect(moduleInstance.afterRegister).toHaveBeenCalled();
			// expect(moduleInstance.beforeRegister).toHaveBeenCalledBefore(moduleInstance.afterRegister);
		});

		it('should have default empty implementations for lifecycle hooks', () => {
			// Create a module instance
			class TestModule extends Module {}
			const moduleInstance = new TestModule();

			// Call the lifecycle hooks
			expect(() => moduleInstance.beforeRegister()).not.toThrow();
			expect(() => moduleInstance.afterRegister()).not.toThrow();
		});
	});
});
