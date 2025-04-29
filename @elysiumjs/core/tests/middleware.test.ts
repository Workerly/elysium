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

import type { Context, Route } from '../src/http';

import { afterAll, beforeEach, describe, expect, it, jest, mock, spyOn } from 'bun:test';
import { Elysia } from 'elysia';

import { Application } from '../src/app';
import * as M from '../src/middleware';
import { Service } from '../src/service';
import { Symbols } from '../src/utils';

const mockRun = mock((_map: Map<string, any>, callback: Function) => callback());
mock.module('../src/app', () => ({
	Application: {
		...Application,
		context: {
			run: mockRun
		}
	}
}));

describe('Middleware', () => {
	// Create test middleware classes
	class TestMiddleware1 extends M.Middleware {
		public onBeforeHandle = mock((_ctx: Context) => {});
		public onAfterHandle = mock((_ctx: Context) => {});
		public onAfterResponse = mock((_ctx: Context) => {});
	}

	class TestMiddleware2 extends M.Middleware {
		public onBeforeHandle = mock((_ctx: Context) => {});
		public onAfterHandle = mock((_ctx: Context) => {});
		public onAfterResponse = mock((_ctx: Context) => {});
	}

	// Create a mock context
	const mockContext = {
		tenant: 'test-tenant'
	} as unknown as Context;

	beforeEach(() => {
		jest.clearAllMocks();
	});

	afterAll(() => {
		mock.restore();
	});

	describe('Middleware.register', () => {
		it('should register middlewares on a class', () => {
			// Create a test class
			@M.Middleware.register(TestMiddleware1, TestMiddleware2)
			class TestController {}

			// Check if metadata was set correctly
			const middlewares = Reflect.getMetadata(Symbols.middlewares, TestController);
			expect(middlewares).toBeDefined();
			expect(middlewares).toBeArrayOfSize(2);
			expect(middlewares).toContain(TestMiddleware1);
			expect(middlewares).toContain(TestMiddleware2);
		});

		it('should register middlewares on a method', () => {
			// Create a test class with a decorated method
			class TestController {
				@M.Middleware.register(TestMiddleware1, TestMiddleware2)
				testMethod() {}
			}

			// Check if metadata was set correctly
			const middlewares = Reflect.getMetadata(
				Symbols.middlewares,
				TestController.prototype,
				'testMethod'
			);
			expect(middlewares).toBeDefined();
			expect(middlewares).toBeArrayOfSize(2);
			expect(middlewares).toContain(TestMiddleware1);
			expect(middlewares).toContain(TestMiddleware2);
		});

		it('should append middlewares to existing ones on a class', () => {
			// Create a test class with existing middlewares
			class TestController {}
			Reflect.defineMetadata(Symbols.middlewares, [TestMiddleware1], TestController);

			// Apply the decorator
			M.Middleware.register(TestMiddleware2)(TestController);

			// Check if metadata was updated correctly
			const middlewares = Reflect.getMetadata(Symbols.middlewares, TestController);
			expect(middlewares).toBeDefined();
			expect(middlewares).toBeArrayOfSize(2);
			expect(middlewares).toContain(TestMiddleware1);
			expect(middlewares).toContain(TestMiddleware2);
		});

		it('should append middlewares to existing ones on a method', () => {
			// Create a test class with a method that has existing middlewares
			class TestController {
				testMethod() {}
			}
			Reflect.defineMetadata(
				Symbols.middlewares,
				[TestMiddleware1],
				TestController.prototype,
				'testMethod'
			);

			// Apply the decorator
			M.Middleware.register(TestMiddleware2)(TestController.prototype, 'testMethod', {
				value: TestController.prototype.testMethod,
				writable: true,
				enumerable: false,
				configurable: true
			});

			// Check if metadata was updated correctly
			const middlewares = Reflect.getMetadata(
				Symbols.middlewares,
				TestController.prototype,
				'testMethod'
			);
			expect(middlewares).toBeDefined();
			expect(middlewares).toBeArrayOfSize(2);
			expect(middlewares).toContain(TestMiddleware1);
			expect(middlewares).toContain(TestMiddleware2);
		});
	});

	describe('Middleware.guards', () => {
		it('should correctly apply guards to a middleware class', () => {
			// Create a test middleware class
			class TestGuardedMiddleware extends M.Middleware {}

			// Apply guards to the middleware class
			const guards = ['auth', 'admin'];
			const GuardedMiddleware = M.Middleware.guards.call(TestGuardedMiddleware, guards);

			// Create an instance of the guarded middleware
			const middleware = new GuardedMiddleware();

			// Check if the guards were correctly applied
			expect(middleware.guards).toBeDefined();
			expect(middleware.guards).toBeArrayOfSize(2);
			expect(middleware.guards).toEqual(guards);

			// Verify that the guarded middleware extends the original one
			expect(middleware).toBeInstanceOf(TestGuardedMiddleware);

			// Verify the metadata was set correctly
			const metadataGuards = Reflect.getMetadata(Symbols.middlewareGuards, middleware.constructor);
			expect(metadataGuards).toEqual(guards);
		});

		it('should return an empty array when no guards are defined for a middleware', () => {
			// Create a middleware instance without defined guards
			class PlainMiddleware extends M.Middleware {}
			const middleware = new PlainMiddleware();

			// Check if guards returns an empty array when no guards are defined
			expect(middleware.guards).toBeDefined();
			expect(middleware.guards).toBeArrayOfSize(0);
			expect(middleware.guards).toEqual([]);

			// Verify that metadata for middleware guards doesn't exist
			const metadataGuards = Reflect.getMetadata(Symbols.middlewareGuards, middleware.constructor);
			expect(metadataGuards).toBeUndefined();
		});

		it('should properly inherit guards from parent middleware class', () => {
			// Create a base middleware class with guards
			class BaseMiddleware extends M.Middleware {}
			const baseGuards = ['auth', 'user'];
			const GuardedBaseMiddleware = M.Middleware.guards.call(BaseMiddleware, baseGuards);

			// Create a child middleware that extends the guarded base middleware
			class ChildMiddleware extends GuardedBaseMiddleware {}

			// Create another middleware with additional guards
			const childGuards = ['admin'];
			const GuardedChildMiddleware = M.Middleware.guards.call(ChildMiddleware, childGuards);

			// Create instances
			const baseMiddleware = new GuardedBaseMiddleware();
			const childMiddleware = new ChildMiddleware();
			const guardedChildMiddleware = new GuardedChildMiddleware();

			// Verify base middleware has the correct guards
			expect(baseMiddleware.guards).toEqual(baseGuards);

			// Verify child middleware inherits guards from parent
			expect(childMiddleware.guards).toEqual(baseGuards);

			// Verify that applying additional guards overwrites the inherited ones
			expect(guardedChildMiddleware.guards).toEqual(childGuards);

			// Verify the inheritance chain is maintained
			expect(baseMiddleware).toBeInstanceOf(BaseMiddleware);
			expect(childMiddleware).toBeInstanceOf(BaseMiddleware);
			expect(childMiddleware).toBeInstanceOf(GuardedBaseMiddleware);
			expect(guardedChildMiddleware).toBeInstanceOf(ChildMiddleware);
			expect(guardedChildMiddleware).toBeInstanceOf(GuardedBaseMiddleware);
			expect(guardedChildMiddleware).toBeInstanceOf(BaseMiddleware);
		});
	});

	describe('executeMiddlewareChain', () => {
		it('should execute each middleware in the chain', async () => {
			// Create middleware instances
			const middleware1 = new TestMiddleware1();
			const middleware2 = new TestMiddleware2();

			// Execute the middleware chain
			const result = await M.executeMiddlewareChain(
				[middleware1, middleware2],
				mockContext,
				'onBeforeHandle'
			);

			// Check if Application.context.run was called with the correct parameters
			expect(mockRun).toHaveBeenCalledWith(expect.any(Map), expect.any(Function));

			// Check if each middleware's method was called with the context
			expect(middleware1.onBeforeHandle).toHaveBeenCalledWith(mockContext);
			expect(middleware2.onBeforeHandle).toHaveBeenCalledWith(mockContext);

			// No value should be returned
			expect(result).toBeUndefined();
		});

		it('should stop the chain if a middleware returns a value', async () => {
			// Create middleware instances
			const middleware1 = new TestMiddleware1();
			const middleware2 = new TestMiddleware2();

			// Make the first middleware return a value
			middleware1.onBeforeHandle = mock((_ctx: Context) => 'stop');

			// Execute the middleware chain
			const result = await M.executeMiddlewareChain(
				[middleware1, middleware2],
				mockContext,
				'onBeforeHandle'
			);

			// Check if the chain stopped and returned the value
			expect(result).toBe('stop');
			expect(middleware1.onBeforeHandle).toHaveBeenCalledWith(mockContext);
			expect(middleware2.onBeforeHandle).not.toHaveBeenCalled();
		});

		it('should stop the chain and propagate errors', async () => {
			// Create middleware instances
			const middleware1 = new TestMiddleware1();
			const middleware2 = new TestMiddleware2();

			// Make the first middleware throw an error
			const error = new Error('Test error');
			middleware1.onBeforeHandle = mock((_ctx: Context) => {
				throw error;
			});

			// Execute the middleware chain and expect it to throw
			await expect(
				M.executeMiddlewareChain([middleware1, middleware2], mockContext, 'onBeforeHandle')
			).rejects.toThrow(error);

			// Check if only the first middleware was called
			expect(middleware1.onBeforeHandle).toHaveBeenCalledWith(mockContext);
			expect(middleware2.onBeforeHandle).not.toHaveBeenCalled();
		});
	});

	describe('applyMiddlewares', () => {
		it('should apply middlewares to an Elysia plugin', () => {
			// Create a mock Elysia plugin
			const plugin = {
				onBeforeHandle: mock(),
				onAfterHandle: mock(),
				onAfterResponse: mock()
			} as unknown as Elysia<Route>;

			// Mock Service.make to return middleware instances
			const middleware1 = new TestMiddleware1();
			const middleware2 = new TestMiddleware2();
			const makeSpy = spyOn(Service, 'make')
				.mockReturnValueOnce(middleware1)
				.mockReturnValueOnce(middleware2);

			// Apply middlewares
			M.applyMiddlewares([TestMiddleware1, TestMiddleware2], plugin);

			// Check if Service.make was called for each middleware
			expect(makeSpy).toHaveBeenCalledWith(TestMiddleware1);
			expect(makeSpy).toHaveBeenCalledWith(TestMiddleware2);

			// Check if plugin hooks were registered
			expect(plugin.onBeforeHandle).toHaveBeenCalled();
			expect(plugin.onAfterHandle).toHaveBeenCalled();
			expect(plugin.onAfterResponse).toHaveBeenCalled();
		});

		it('should execute the middleware chain when plugin hooks are triggered', async () => {
			// Create a mock Elysia plugin with hook callbacks
			let beforeHandleCallback: (ctx: Context) => Promise<any>;
			let afterHandleCallback: (ctx: Context) => Promise<any>;
			let afterResponseCallback: (ctx: Context) => Promise<any>;

			const plugin = {
				onBeforeHandle: mock((callback) => {
					beforeHandleCallback = callback;
				}),
				onAfterHandle: mock((callback) => {
					afterHandleCallback = callback;
				}),
				onAfterResponse: mock((callback) => {
					afterResponseCallback = callback;
				})
			} as unknown as Elysia;

			const executeMiddlewareChainSpy = spyOn(M, 'executeMiddlewareChain');

			// Mock Service.make to return middleware instances
			const middleware1 = new TestMiddleware1();
			const middleware2 = new TestMiddleware2();
			const makeSpy = spyOn(Service, 'make')
				.mockReturnValueOnce(middleware1)
				.mockReturnValueOnce(middleware2);

			// Apply middlewares
			M.applyMiddlewares([TestMiddleware1, TestMiddleware2], plugin as unknown as Elysia<Route>);

			// Trigger the hooks
			await beforeHandleCallback!(mockContext);
			await afterHandleCallback!(mockContext);
			await afterResponseCallback!(mockContext);

			// Check if executeMiddlewareChain was called for each hook
			expect(executeMiddlewareChainSpy).toHaveBeenCalledTimes(3);
			expect(executeMiddlewareChainSpy).toHaveBeenCalledWith(
				[middleware1, middleware2],
				mockContext,
				'onBeforeHandle'
			);
			expect(executeMiddlewareChainSpy).toHaveBeenCalledWith(
				[middleware1, middleware2],
				mockContext,
				'onAfterHandle'
			);
			expect(executeMiddlewareChainSpy).toHaveBeenCalledWith(
				[middleware1, middleware2],
				mockContext,
				'onAfterResponse'
			);
		});
	});

	describe('Middleware lifecycle hooks', () => {
		it('should have default empty implementations for lifecycle hooks', () => {
			// Create a middleware instance
			class EmptyMiddleware extends M.Middleware {}
			const middleware = new EmptyMiddleware();

			// Check if the lifecycle hooks exist and return undefined
			expect(middleware.onBeforeHandle(mockContext)).toBeUndefined();
			expect(middleware.onAfterHandle(mockContext)).toBeUndefined();
			expect(middleware.onAfterResponse(mockContext)).toBeUndefined();
		});

		it('should allow overriding lifecycle hooks', () => {
			// Create a middleware with custom implementations
			class CustomMiddleware extends M.Middleware {
				public onBeforeHandle(_ctx: Context): string {
					return 'before';
				}

				public onAfterHandle(_ctx: Context): string {
					return 'after';
				}

				public onAfterResponse(_ctx: Context): string {
					return 'response';
				}
			}

			const middleware = new CustomMiddleware();

			// Check if the custom implementations are used
			expect(middleware.onBeforeHandle(mockContext)).toBe('before');
			expect(middleware.onAfterHandle(mockContext)).toBe('after');
			expect(middleware.onAfterResponse(mockContext)).toBe('response');
		});
	});
});
