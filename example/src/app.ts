import type { Route } from '@elysiumjs/core';
import type { Elysia } from 'elysia';

import { Application, Middleware, WorkerPool } from '@elysiumjs/core';

import { ProgressDemoCommand } from '#root/commands/progress-demo.command';
import { SpinnerDemoCommand } from '#root/commands/spinner-demo.command';
import { TestCommand } from '#root/commands/test.command';
import { MainModule } from '#root/main.module';
import { XServerMiddleware } from '#root/middlewares/x-server.middleware';

@Middleware.register(XServerMiddleware)
@Application.register({
	modules: [MainModule],
	commands: [TestCommand, SpinnerDemoCommand, ProgressDemoCommand],
	server: {
		name: App.name,
		port: parseInt(process.env.PORT!, 10) || 3000
	},
	debug: false,
	database: {
		default: 'main',
		connections: {
			main: { connection: process.env.DATABASE_URL! }
		}
	},
	redis: {
		default: 'cache',
		connections: {
			cache: { url: process.env.REDIS_URL! }
		}
	},
	swagger: {
		path: '/docs',
		documentation: {
			info: {
				title: 'Elysium',
				description: 'Elysium API Documentation',
				version: '1.0.0'
			}
		}
	}
})
export class App extends Application {
	protected async onStart(e: Elysia<Route>) {
		await super.onStart(e);
		await WorkerPool.instance.init();
		WorkerPool.instance.addWorker(['email']);
		WorkerPool.instance.addWorker(['email', 'sync']);
	}
}
