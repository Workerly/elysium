# @elysiumjs/plugin-sentry

Enables Sentry error reporting for Elysium applications.

## Installation

```bash
bun add @elysiumjs/plugin-sentry
```

## Usage

```ts
import { Application } from '@elysiumjs/core';
import { plugin as sentry } from '@elysiumjs/plugin-sentry';

@Application.register({
	// Your other app options
	plugins: [
		sentry({
			serverName: 'my-app',
			dsn: 'https://<key>@sentry.io/<project>'
		})
		// Your other plugins
	]
})
class MyApp extends Application {}
```

## Configuration

This plugin forwards all options to the Sentry initialization method. You can find the full list of options [here](https://docs.sentry.io/platforms/javascript/guides/bun/configuration/options/).

## License

This project is licensed under the terms of the [Apache License 2.0](LICENSE).
