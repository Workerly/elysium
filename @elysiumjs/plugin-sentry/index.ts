import type { Application, ElysiumPlugin } from '@elysiumjs/core';

import { opentelemetry } from '@elysiajs/opentelemetry';
import { Env } from '@elysiumjs/core';
import * as Sentry from '@sentry/bun';
import { Elysia } from 'elysia';

/**
 * Elysium plugin for Sentry integration.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param options Plugin options.
 */
export const plugin = (options?: Sentry.BunOptions): ElysiumPlugin => {
	return async (_app: Application) => {
		const dsn = options?.dsn ?? Env.get('SENTRY_DSN');
		if (!dsn) {
			throw new Error('Must provide a DSN');
		}

		const environment = options?.environment ?? Env.get('SENTRY_ENVIRONMENT');

		Sentry.init({
			dsn,
			environment,
			tracesSampleRate: 1.0,
			integrations: [
				Sentry.bunServerIntegration(),
				Sentry.onUnhandledRejectionIntegration({
					mode: 'warn'
				}),
				Sentry.onUncaughtExceptionIntegration()
			],
			...options
		});

		return (
			new Elysia({
				name: '@elysiumjs/plugin-sentry'
			})
				.decorate('Sentry', Sentry)
				.use(
					opentelemetry({
						serviceName: options?.serverName
					})
				)
				// Capture exceptions
				.onError({ as: 'global' }, ({ error, Sentry }) => {
					Sentry.captureException(error);
				})
				// Need this to inject attributes into the span
				// https://github.com/elysiajs/opentelemetry/issues/40
				.onAfterResponse(
					{ as: 'global' },
					// @ts-expect-error Unused parameters
					function injectAttributes({
						body,
						cookie,
						params,
						request,
						response,
						route,
						server,
						store,
						headers,
						path,
						query
					}) {}
				)
		);
	};
};
