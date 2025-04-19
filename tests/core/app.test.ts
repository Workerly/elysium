import 'reflect-metadata';

import type { Mock } from 'bun:test';
import type { AppContext } from '../../src/core/app';
import type { Route } from '../../src/core/utils';

import { AsyncLocalStorage } from 'node:async_hooks';

import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { Elysia } from 'elysia';

import { app, Application } from '../../src/core/app';
import { Database } from '../../src/core/database';
import { Event } from '../../src/core/event';
import { Middleware } from '../../src/core/middleware';
import { module, Module } from '../../src/core/module';
import { Redis } from '../../src/core/redis';
import { Service } from '../../src/core/service';
import { nextTick, Symbols } from '../../src/core/utils';

// Mock dependencies
mock.module('../../src/core/database', () => ({
	Database: {
		registerConnection: mock(Database.registerConnection),
		connectionExists: mock(Database.connectionExists),
		setDefaultConnection: mock(Database.setDefaultConnection),
		getDefaultConnection: mock(Database.getDefaultConnection),
		getConnection: mock(Database.getConnection)
	}
}));

mock.module('../../src/core/redis', () => ({
	Redis: {
		registerConnection: mock(Redis.registerConnection),
		connectionExists: mock(Redis.connectionExists),
		setDefaultConnection: mock(Redis.setDefaultConnection),
		getDefaultConnection: mock(Redis.getDefaultConnection),
		getConnection: mock(Redis.getConnection)
	}
}));

mock.module('../../src/core/service', () => ({
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

mock.module('../../src/core/event', () => ({
	Event: {
		emit: mock(Event.emit),
		on: mock(Event.on),
		once: mock(Event.once),
		off: mock(Event.off)
	}
}));

// Test decorator
describe('@app decorator', () => {
	afterAll(() => {
		mock.restore();
	});

	it('should set metadata on the target class', () => {
		// Create a test class
		@app({
			debug: true,
			modules: [],
			commands: []
		})
		class TestApp extends Application {}

		// Check if metadata was set correctly
		const metadata = Reflect.getMetadata(Symbols.app, TestApp);
		expect(metadata).toBeDefined();
		expect(metadata.debug).toBe(true);
		expect(metadata.modules).toBeArrayOfSize(0);
		expect(metadata.commands).toBeArrayOfSize(0);
	});
});

// Test Application class
describe('Application class', () => {
	// Mock process.exit to prevent tests from exiting
	const originalExit = process.exit;

	// Reset mocks before each test
	beforeEach(() => {
		process.exit = mock() as any;
		mock.restore();
	});

	afterEach(() => {
		process.exit = originalExit;
		Service.clear();
	});

	afterAll(() => {
		mock.restore();
	});

	describe('constructor', () => {
		it('should register the application instance in the service container', () => {
			// Create a test class
			@app({
				debug: true
			})
			class TestApp extends Application {}

			// Create an instance
			new TestApp();

			// Check if the instance was registered
			expect(Service.instance).toHaveBeenCalledWith('elysium.app', expect.any(TestApp));
		});

		it('should set debug mode from app props', () => {
			// Create a test class with debug mode enabled
			@app({
				debug: true
			})
			class TestApp extends Application {}

			// Create an instance
			const instance = new TestApp();

			// Check if debug mode is set
			expect(instance.isDebug).toBe(true);
		});

		it('should register Redis connections if provided', () => {
			// Create a test class with Redis configuration
			@app({
				redis: {
					default: 'main',
					connections: {
						main: { url: 'redis://localhost:6379' }
					}
				}
			})
			class TestApp extends Application {}

			// Create an instance
			new TestApp();

			// Check if Redis connections were registered
			expect(Redis.registerConnection).toHaveBeenCalledWith('main', {
				url: 'redis://localhost:6379'
			});
			expect(Redis.connectionExists).toHaveBeenCalledWith('main');
			expect(Redis.setDefaultConnection).toHaveBeenCalledWith('main');
		});

		it('should register Database connections if provided', () => {
			// Create a test class with Database configuration
			@app({
				database: {
					default: 'main',
					connections: {
						main: { connection: process.env.DATABASE_TEST_URL! }
					}
				}
			})
			class TestApp extends Application {}

			// Create an instance
			new TestApp();

			// Check if Database connections were registered
			expect(Database.registerConnection).toHaveBeenCalledWith('main', {
				connection: process.env.DATABASE_TEST_URL!
			});
			expect(Database.connectionExists).toHaveBeenCalledWith('main');
			expect(Database.setDefaultConnection).toHaveBeenCalledWith('main');
		});

		it('should emit an event when the application is launched', async () => {
			// Create a test class
			@app()
			class TestApp extends Application {
				// Override run to avoid actual execution
				protected async run(): Promise<void> {
					return Promise.resolve();
				}
			}

			// Create an instance
			const instance = new TestApp();

			// Wait for the next tick to allow the event to be emitted
			await nextTick();

			// Check if the event was emitted
			expect(Event.emit).toHaveBeenCalledWith('elysium:app:launched', instance, instance);
		});
	});

	describe('static methods', () => {
		it('should return the application instance', () => {
			// Mock the Service.get method to return a test instance
			const testInstance = {};
			(Service.get as Mock<typeof Service.get>).mockReturnValueOnce(testInstance);

			// Call the static method
			const instance = Application.instance;

			// Check if the correct service was requested
			expect(Service.get).toHaveBeenCalledWith('elysium.app');
			expect(instance).toBe(testInstance as Application);
		});

		it('should return the application context', () => {
			// Create a mock context
			const mockContext: AppContext = new AsyncLocalStorage();

			// Mock the Application.instance getter
			const mockInstance = {
				_appContextStorage: mockContext
			};

			// Use Object.defineProperty to mock the getter
			const originalDescriptor = Object.getOwnPropertyDescriptor(Application, 'instance');
			Object.defineProperty(Application, 'instance', {
				get: () => mockInstance
			});

			expect(Application.instance).toBe(mockInstance as unknown as Application);

			// Call the static method
			const context = Application.context;

			// Check if the correct context was returned
			expect(context).toBe(mockContext);

			// Restore the original descriptor
			if (originalDescriptor) {
				Object.defineProperty(Application, 'instance', originalDescriptor);
			}
		});
	});

	describe('getters and setters', () => {
		it('should get and set debug mode', () => {
			// Create a test class
			@app({
				debug: false
			})
			class TestApp extends Application {
				// Override run to avoid actual execution
				protected async run(): Promise<void> {
					return Promise.resolve();
				}
			}

			// Create an instance
			const instance = new TestApp();

			// Check initial debug mode
			expect(instance.isDebug).toBe(false);

			// Set debug mode
			instance.isDebug = true;

			// Check if debug mode was set
			expect(instance.isDebug).toBe(true);
		});

		it('should get the Elysia instance', () => {
			// Create a test class
			@app()
			class TestApp extends Application {
				// Override run to directly call commandServe to initialize Elysia
				protected async run(): Promise<void> {
					// @ts-expect-error The commandServe method is private
					await this.commandServe();
				}
			}

			// Create an instance
			const instance = new TestApp();

			// Check if the Elysia instance is accessible
			expect(instance.elysia).toBeDefined();
		});
	});

	describe('lifecycle hooks', () => {
		it('should call onStart when the server starts', async () => {
			// Create a test class with an overridden onStart method
			@app()
			class TestApp extends Application {
				protected async onStart(elysia: Elysia<Route>): Promise<void> {}

				// Override run to avoid actual execution
				protected async run(): Promise<void> {
					// @ts-expect-error The commandServe method is private
					return this.commandServe();
				}
			}

			// Create a spy on the onStart method
			// @ts-expect-error The onStart method is protected
			const onStartSpy = spyOn(TestApp.prototype, 'onStart');

			// Create an instance
			const instance = new TestApp();

			await nextTick();

			// Check if onStart was called
			expect(onStartSpy).toHaveBeenCalledWith(instance.elysia);
			expect(Event.emit).toHaveBeenLastCalledWith(
				'elysium:server:start',
				instance.elysia,
				instance
			);
		});

		it('should call onStop when the server stops', async () => {
			// Create a test class with an overridden onStop method
			@app()
			class TestApp extends Application {
				protected async onStop(elysia: Elysia<Route>): Promise<void> {
					// Do nothing
				}

				// Override run to avoid actual execution
				protected async run(): Promise<void> {
					// @ts-expect-error The commandServe method is private
					return this.commandServe();
				}
			}

			// Create a spy on the onStop method
			// @ts-expect-error The onStop method is protected
			const onStopSpy = spyOn(TestApp.prototype, 'onStop');

			// Create an instance
			const instance = new TestApp();

			await nextTick();
			process.emit('SIGINT');
			await nextTick();

			// Check if onStop was called
			expect(onStopSpy).toHaveBeenCalledWith(instance.elysia);
			expect(Event.emit).toHaveBeenCalledWith('elysium:server:stop', instance.elysia, instance);
		});

		it('should call onError when an error occurs', async () => {
			// Create a test class with an overridden onError method
			@app()
			class TestApp extends Application {
				protected async onError(e: any): Promise<boolean> {
					return true;
				}

				// Override run to avoid actual execution
				protected async run(): Promise<void> {
					// @ts-expect-error The commandServe method is private
					return this.commandServe();
				}
			}

			// Create a spy on the onError method
			// @ts-expect-error The onError method is protected
			const onErrorSpy = spyOn(TestApp.prototype, 'onError');

			// Create an instance
			const instance = new TestApp();

			instance.elysia.get('/', ({ error }) => error(500, 'Test error'));
			await fetch('http://localhost:3000/');
			await nextTick();

			// Check if onError was called
			expect(onErrorSpy).toHaveBeenCalledWith(expect.anything());
			expect(Event.emit).toHaveBeenCalledWith('elysium:error', expect.anything());
		});
	});

	describe('module registration', () => {
		it('should register modules correctly', async () => {
			@module()
			class TestModule1 extends Module {}

			@module()
			class TestModule2 extends Module {}

			// Create a test class with modules
			@app({
				modules: [TestModule1, TestModule2]
			})
			class TestApp extends Application {
				// Override run to directly call commandServe
				protected async run(): Promise<void> {
					// @ts-expect-error The commandServe method is private
					return this.commandServe();
				}
			}

			// Spies the use function
			const useSpy = spyOn(Elysia.prototype, 'use');

			// Create an instance
			new TestApp();

			// Check if modules were registered correctly
			await nextTick();
			expect(Service.bind).toHaveBeenCalledWith(TestModule1);

			await nextTick();
			expect(Service.bind).toHaveBeenCalledWith(TestModule2);

			await nextTick();
			expect(useSpy).toHaveBeenCalledTimes(2);
		});
	});

	describe('middleware application', () => {
		it('should apply middlewares correctly', async () => {
			// Mock the applyMiddlewares function
			const mi = await import('../../src/core/middleware');
			const applyMiddlewaresSpy = spyOn(mi, 'applyMiddlewares');

			try {
				class Middleware1 extends Middleware {}
				class Middleware2 extends Middleware {}

				// Create mock middlewares
				const mockMiddlewares = [Middleware1, Middleware2];

				// Set middlewares metadata
				@app()
				class TestApp extends Application {
					// Override run to directly call commandServe
					protected async run(): Promise<void> {
						// @ts-expect-error The commandServe method is private
						return this.commandServe();
					}
				}

				// Apply app decorator

				// Set middlewares metadata
				Reflect.defineMetadata(Symbols.middlewares, mockMiddlewares, TestApp);

				// Create an instance
				const instance = new TestApp();
				await nextTick();

				// Check if middlewares were applied correctly
				expect(applyMiddlewaresSpy).toHaveBeenCalledWith(mockMiddlewares, instance.elysia);
			} finally {
				// Restore the original function
				applyMiddlewaresSpy.mockRestore();
			}
		});
	});

	describe('command methods', () => {
		it('should handle the serve command', async () => {
			// Create a test class
			@app({
				server: { port: 8000 },
				modules: [],
				swagger: false
			})
			class TestApp extends Application {
				// Override run to directly call commandServe
				protected async run(): Promise<void> {
					// @ts-expect-error The commandServe method is private
					return this.commandServe();
				}
			}

			Event.on('elysium:server:after-init', async (e) => {
				spyOn(e.source.elysia, 'listen');
			});

			// Create an instance
			const instance = new TestApp();

			await nextTick();

			// Check if Elysia was initialized correctly
			expect(instance.elysia.listen).toHaveBeenCalledWith(8000);
		});

		it('should handle the exec command', async () => {
			// Create a mock command class
			const mockCommand = {
				command: 'test',
				description: 'Test command'
			};

			// Create a mock command instance
			const mockCommandInstance = {
				init: mock().mockResolvedValue(true),
				run: mock().mockResolvedValue(undefined)
			};

			// Mock Service.make to return the mock command instance
			(Service.make as Mock<typeof Service.make>).mockReturnValueOnce(mockCommandInstance);

			// Create a test class
			@app({
				commands: [mockCommand as any]
			})
			class TestApp extends Application {
				// Override run to directly call commandExec
				protected async run(): Promise<void> {
					// @ts-expect-error The commandExec method is private
					return this.commandExec('test', ['arg1', 'arg2']);
				}
			}

			// Create an instance
			new TestApp();
			await nextTick();

			// Check if the command was executed correctly
			expect(Service.make).toHaveBeenCalledWith(mockCommand);
			expect(mockCommandInstance.init).toHaveBeenCalledWith('arg1', 'arg2');
			expect(mockCommandInstance.run).toHaveBeenCalled();

			await nextTick();
			expect(process.exit).toHaveBeenCalledWith(0);
		});

		it('should handle the work command', async () => {
			// Mock the Worker module
			mock.module('../../src/core/worker', () => ({
				Worker: {
					spawn: mock()
				}
			}));

			// Create a test class with a public commandWork method
			@app()
			class TestApp extends Application {
				// Make commandWork public for testing
				protected async run(): Promise<void> {
					// @ts-expect-error The commandWork method is private
					return super.commandWork(['--queue=test', '--concurrency=2']);
				}
			}

			// Create an instance
			new TestApp();
			await nextTick();

			// Check if Worker.spawn was called
			const workerModule = await import('../../src/core/worker');
			expect(workerModule.Worker.spawn).toHaveBeenCalled();
		});

		it('should handle the list command', async () => {
			// Create mock command classes
			const mockCommands = [
				{ command: 'test:one', description: 'Test command one' },
				{ command: 'test:two', description: 'Test command two' }
			];

			let output = '';
			process.stdout.write = mock((message: string) => {
				output += message;
				return true;
			});

			// Create a test class
			@app({
				commands: mockCommands as any
			})
			class TestApp extends Application {
				protected async run(): Promise<void> {
					// @ts-expect-error The commandList method is private
					return super.commandList();
				}
			}

			// Create an instance
			new TestApp();
			await nextTick();

			// Check if the commands were listed correctly
			expect(process.stdout.write).toHaveBeenCalled();
			expect(output).toContain('test:one');
			expect(output).toContain('test:two');
			expect(output).toContain('Test command one');
			expect(output).toContain('Test command two');
			expect(process.exit).not.toHaveBeenCalled(); // commandList doesn't exit
		});

		it('should handle the help command', async () => {
			// Create a mock command class
			const mockCommand = {
				command: 'test',
				description: 'Test command'
			};

			// Create a mock command instance
			const mockCommandInstance = {
				help: mock().mockResolvedValue('Test command help text')
			};

			let output = '';
			process.stdout.write = mock((message: string) => {
				output += message;
				return true;
			});

			// Mock Service.make to return the mock command instance
			(Service.make as Mock<typeof Service.make>).mockImplementationOnce((service) =>
				service === (mockCommand as any) ? (mockCommandInstance as any) : undefined
			);

			// Save original argv
			const originalArgv = process.argv;

			try {
				// Mock argv for help command
				process.argv = ['bun', 'styx', 'help', 'test'];

				// Create a test class with a modified run method
				@app({
					commands: [mockCommand as any]
				})
				class TestApp extends Application {}

				// Create an instance
				new TestApp();

				await nextTick();

				// Check if the help was displayed correctly
				expect(Service.make).toHaveBeenCalledWith(mockCommand);
				expect(mockCommandInstance.help).toHaveBeenCalled();
				expect(output).toContain('Test command help text');
			} finally {
				// Restore original argv
				process.argv = originalArgv;
			}
		});

		it('should handle the describe command', async () => {
			// Create a mock command class
			const mockCommand = {
				command: 'test',
				description: 'Test command'
			};

			let output = '';
			process.stdout.write = mock((message: string) => {
				output += message;
				return true;
			});

			// Create a test class
			@app({
				commands: [mockCommand as any]
			})
			class TestApp extends Application {
				public async run(): Promise<void> {
					// @ts-expect-error The commandDescribe method is private
					return super.commandDescribe();
				}
			}

			// Create an instance
			new TestApp();

			await nextTick();

			// Check if the description was displayed correctly
			expect(output).toContain('Usage:');
			expect(output).toContain('Commands:');
		});
	});
});
