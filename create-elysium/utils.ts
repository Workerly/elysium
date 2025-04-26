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

import { pascal } from 'radash';

export const getModuleCode = (module: string) => /* js */ `import { Module } from '@elysiumjs/core';

@Module.register({
	controllers: []
})
export class ${module}Module extends Module {}
`;

export const getAppCode = (
	projectName: string,
	modules: Record<string, string>
) => /* js */ `import type { Route } from '@elysiumjs/core';
import type { Elysia } from 'elysia';

import { Application, WorkerPool } from '@elysiumjs/core';

${Object.keys(modules)
	.map((module) => `import { ${pascal(module)}Module } from '${modules[module]}';`)
	.join('\n')}

@Application.register({
	modules: [${Object.keys(modules)
		.map((module) => `${pascal(module)}Module`)
		.join(', ')}],
	commands: [],
	server: {
		name: '${projectName}',
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
				title: '${projectName}',
				description: '${projectName} API Documentation',
				version: '1.0.0'
			}
		}
	}
})
export class App extends Application {
	protected async onStart(e: Elysia<Route>) {
		await super.onStart(e);
		await WorkerPool.instance.init();
	}
}
`;
