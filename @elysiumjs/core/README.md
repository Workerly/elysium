# @elysiumjs/core

Core functionalities for the Elysium.js framework.

> **NOTE**
>
> This package is part of the Elysium.js framework, which is built exclusively for Bun runtime.

## Installation

```bash
bun install @elysiumjs/core
```

## Features

- Dependency Injection
- HTTP Controllers
- WebSocket support
- WAMP protocol integration
- Command-line interface (`@elysiumjs/styx`), with support for custom commands
- Event system
- Caching (memory and Redis)
- PostgreSQL database support with Drizzle ORM
- Model classes and repositories for database interactions
- Multi-tenancy support enabled
- Swagger documentation

## Usage

Create a controller class:

```typescript
import { Http } from '@elysiumjs/core';

@Http.controller({ path: '/users' })
export class UserController {
	@Http.get({ path: '/:id' })
	public getUser(id: string) {
		return { id };
	}
}
```

Create a module class:

```typescript
import { Module } from '@elysiumjs/core';

import { UserController } from './controllers/http/user.controller';

@Module.register({
	controllers: [UserController]
})
export class MainModule extends Module {
	public constructor() {
		super();
	}

	public async beforeRegister(): Promise<void> {
		console.log('Module is being registered');
	}

	public async afterRegister(): Promise<void> {
		console.log('Module registered successfully');
	}
}
```

Create an application class:

```typescript
import { Application } from '@elysiumjs/core';

import { MainModule } from './main.module';

@Application.register({
	modules: [MainModule],
	server: {
		name: 'Elysium',
		port: 3000
	}
})
export class App extends Application {}
```

Create an entrypoint file:

```typescript
import 'reflect-metadata'; // <- IMPORTANT TO ADD THIS LINE IN THE ENTRYPOINT FILE

import { App } from './app';

new App();
```

Start the server:

```bash
bun run index.ts serve
```

Or, if using `styx`, run:

```bash
bun styx serve
```

## Documentation

TODO

## Contributing

This project is built primarily to meet requirements for internal projects at [Workbud Technologies Inc.](https://www.workbud.com)

Feel free to open issues for any bugs or questions you may have. Pull requests are also welcome, but they will be reviewed to ensure they align with our internal project's goals and standards.

## License

This project is licensed under the Apache License, Version 2.0. See the [LICENSE](https://github.com/workbud/elysium/blob/main/LICENSE) file for more information.
