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

import type { Class } from 'type-fest';

import { Elysia } from 'elysia';
import { omit } from 'radash';
// @ts-expect-error The Wampy type definitions are not up to date
import Wampy from 'wampy';

import { Event } from './event';
import { Service } from './service';
import { nextTick, Symbols } from './utils';

// FIXME: Temporary solution for Bun to properly fill the protocol field. Remove this once oven-sh/bun#18744 is fixed.
class WampWebsocket extends WebSocket {
	public constructor(
		url: string,
		private readonly protocols?: string | string[]
	) {
		super(url, protocols);
	}

	public get protocol(): string {
		return this.protocols?.[0] ?? 'wamp.2.json';
	}
}

/**
 * Options used to register a WAMP RPC for invocation.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type WampRegistrationOptions = {
	/**
	 * The match policy to use for the registration.
	 * @default 'exact'
	 */
	match?: 'prefix' | 'exact' | 'wildcard';

	/**
	 * The invocation policy to use for the registration.
	 * @default 'single'
	 */
	invoke?: 'single' | 'first' | 'last' | 'roundrobin' | 'random';
};

/**
 * Options used to subscribe to a WAMP topic.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type WampSubscriptionOptions = Omit<WampRegistrationOptions, 'invoke'>;

/**
 * Properties required when declaring a WAMP controller using the `@wamp()` decorator.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type WampProps = {
	/**
	 * The URL to the WAMP server.
	 */
	url: string;

	/**
	 * The name of the realm to connect to.
	 */
	realm: string;

	/**
	 * Whether to automatically reconnect to the WAMP server on connection loss.
	 */
	autoReconnect?: boolean;

	/**
	 * The maximum number of times to retry connecting to the WAMP server.
	 */
	maxRetries?: number;

	/**
	 * The interval to wait between retries when connecting to the WAMP server.
	 */
	retryInterval?: number;

	/**
	 * The authentication ID to use in challenges.
	 */
	authid?: string;

	/**
	 * An array of supported authentication methods.
	 */
	authmethods?: string[];
};

/**
 * Data sent to a WAMP RPC.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type WampRegistrationHandlerArgs<TList = any[], TDict = any> = {
	/**
	 * The arguments passed to the RPC or subscription.
	 */
	argsList: TList;

	/**
	 * The keyword arguments passed to the RPC or subscription.
	 */
	argsDict: TDict;

	/**
	 * The WAMP details object.
	 */
	details: {
		receive_progress?: boolean;
		trustlevel?: number;
	};

	/**
	 * The result handler for the RPC. Use this to send progressive results.
	 * @param value
	 */
	result_handler: (value: any) => void;

	/**
	 * The error handler for the RPC when working with progressive results.
	 * @param error The thrown error.
	 */
	error_handler: (error: any) => void;
};

/**
 * Data sent to a WAMP subscription.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type WampSubscriptionHandlerArgs = Omit<
	WampRegistrationHandlerArgs,
	'result_handler' | 'error_handler'
>;

/**
 * The WAMP RPC handler function.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param data The data sent to the handler.
 */
export type WampRegistrationHandler = <T = any>(data: WampRegistrationHandlerArgs) => T;

/**
 * The WAMP subscription handler function.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param data The data sent to the handler.
 */
export type WampSubscriptionHandler = <T = any>(data: WampSubscriptionHandlerArgs) => T;

/**
 * Metadata for a WAMP RPC.
 * @author Axel Nana <axel.nana@workbud.com>
 */
type WampRegistration = {
	/**
	 * The topic to register the RPC for.
	 */
	topic: string;

	/**
	 * The registration options for the RPC.
	 */
	options?: WampRegistrationOptions;

	/**
	 * The RPC handler function.
	 */
	handler: WampRegistrationHandler;
};

/**
 * Metadata for a WAMP subscription.
 * @author Axel Nana <axel.nana@workbud.com>
 */
type WampSubscription = {
	/**
	 * The topic to subscribe to.
	 */
	topic: string;

	/**
	 * The subscription options for the subscription.
	 */
	options?: WampSubscriptionOptions;

	/**
	 * The subscription handler function.
	 */
	handler: WampSubscriptionHandler;
};

export namespace Wamp {
	/**
	 * Marks a class as a WAMP controller.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param options The decorator options.
	 */
	export const controller = (options: WampProps) => {
		return function (target: Class<any>) {
			async function handleWamp(): Promise<Elysia> {
				// TODO: Use the logger service here
				console.log(`Registering Wamp route for ${options.url} using ${target.name}`);
				await nextTick();

				const controller = Service.make(target);

				const metadata = Reflect.getMetadata(Symbols.wamp, target) ?? {};

				const w = new Wampy(options.url, {
					ws: WampWebsocket,
					...omit(options, ['url']),
					onChallenge: metadata.challenge?.bind(controller),
					onClose: metadata.close?.bind(controller),
					onError() {
						metadata.error?.call(controller);
						// TODO: Add more details like controller name and url
						Event.emit('elysium:error', new Error('Wamp connection error'));
					},
					onReconnect: metadata.reconnect?.bind(controller),
					onReconnectSuccess: metadata.reconnectSuccess?.bind(controller)
				});

				const app = new Elysia();

				app.onStart(async (_) => {
					try {
						await w.connect();
						metadata.open?.call(controller);

						const registrations: WampRegistration[] = metadata.registrations ?? [];
						const subscriptions: WampSubscription[] = metadata.subscriptions ?? [];

						for (const registration of registrations) {
							w.register(
								registration.topic,
								registration.handler.bind(controller),
								registration.options
							).then((r: { topic: string; requestId: string; registrationId: string }) => {
								// TODO: Use the logger service here
								console.log(`Registered ${registration.topic} with id ${r.registrationId}`);
							});
						}

						for (const subscription of subscriptions) {
							w.subscribe(
								subscription.topic,
								subscription.handler.bind(controller),
								subscription.options
							).then(
								(s: {
									topic: string;
									requestId: string;
									subscriptionId: string;
									subscriptionKey: string;
								}) => {
									// TODO: Use the logger service here
									console.log(`Subscribed ${subscription.topic} with id ${s.subscriptionId}`);
								}
							);
						}
					} catch (error) {
						// noop
					}
				});

				return app;
			}

			Reflect.defineMetadata(Symbols.elysiaPlugin, handleWamp, target);
		};
	};

	/**
	 * Registers a method as a WAMP RPC.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param topic The RPC topic to register.
	 * @param options The registration options.
	 */
	export const register = (topic: string, options?: WampRegistrationOptions): MethodDecorator => {
		return function (target, _propertyKey, descriptor) {
			const metadata = Reflect.getMetadata(Symbols.wamp, target.constructor) ?? {};

			metadata.registrations ??= [];
			metadata.registrations.push({
				topic,
				options,
				handler: descriptor.value as WampRegistrationHandler
			});

			Reflect.defineMetadata(Symbols.wamp, metadata, target.constructor);
		};
	};

	/**
	 * Subscribes to a WAMP topic.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param topic The topic to subscribe to.
	 * @param options The subscription options.
	 */
	export const subscribe = (topic: string, options?: WampSubscriptionOptions): MethodDecorator => {
		return function (target, _propertyKey, descriptor) {
			const metadata = Reflect.getMetadata(Symbols.wamp, target.constructor) ?? {};

			metadata.subscriptions ??= [];
			metadata.subscriptions.push({
				topic,
				options,
				handler: descriptor.value as WampRegistrationHandler
			});

			Reflect.defineMetadata(Symbols.wamp, metadata, target.constructor);
		};
	};

	/**
	 * Marks a method as the WAMP "challenge" event handler.
	 *
	 * This decorator should be used on a WAMP controller method. Only one "challenge" event handler
	 * can be defined per WAMP controller.
	 *
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	export const onChallenge = (): MethodDecorator => {
		return function (target, _propertyKey, descriptor) {
			const metadata = Reflect.getMetadata(Symbols.wamp, target.constructor) ?? {};
			metadata.challenge = descriptor.value;
			Reflect.defineMetadata(Symbols.wamp, metadata, target.constructor);
		};
	};

	/**
	 * Marks a method as the WAMP "open" event handler.
	 *
	 * This decorator should be used on a WAMP controller method. Only one "open" event handler
	 * can be defined per WAMP controller.
	 *
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	export const onOpen = (): MethodDecorator => {
		return function (target, _propertyKey, descriptor) {
			const metadata = Reflect.getMetadata(Symbols.wamp, target.constructor) ?? {};
			metadata.open = descriptor.value;
			Reflect.defineMetadata(Symbols.wamp, metadata, target.constructor);
		};
	};

	/**
	 * Marks a method as the WAMP "close" event handler.
	 *
	 * This decorator should be used on a WAMP controller method. Only one "close" event handler
	 * can be defined per WAMP controller.
	 *
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	export const onClose = (): MethodDecorator => {
		return function (target, _propertyKey, descriptor) {
			const metadata = Reflect.getMetadata(Symbols.wamp, target.constructor) ?? {};
			metadata.close = descriptor.value;
			Reflect.defineMetadata(Symbols.wamp, metadata, target.constructor);
		};
	};

	/**
	 * Marks a method as the WAMP "error" event handler.
	 *
	 * This decorator should be used on a WAMP controller method. Only one "error" event handler
	 * can be defined per WAMP controller.
	 *
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	export const onError = (): MethodDecorator => {
		return function (target, _propertyKey, descriptor) {
			const metadata = Reflect.getMetadata(Symbols.wamp, target.constructor) ?? {};
			metadata.error = descriptor.value;
			Reflect.defineMetadata(Symbols.wamp, metadata, target.constructor);
		};
	};

	/**
	 * Marks a method as the WAMP "reconnect" event handler.
	 *
	 * This decorator should be used on a WAMP controller method. Only one "reconnect" event handler
	 * can be defined per WAMP controller.
	 *
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	export const onReconnect = (): MethodDecorator => {
		return function (target, _propertyKey, descriptor) {
			const metadata = Reflect.getMetadata(Symbols.wamp, target.constructor) ?? {};
			metadata.reconnect = descriptor.value;
			Reflect.defineMetadata(Symbols.wamp, metadata, target.constructor);
		};
	};

	/**
	 * Marks a method as the WAMP "reconnectSuccess" event handler.
	 *
	 * This decorator should be used on a WAMP controller method. Only one "reconnectSuccess" event handler
	 * can be defined per WAMP controller.
	 *
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	export const onReconnectSuccess = (): MethodDecorator => {
		return function (target, _propertyKey, descriptor) {
			const metadata = Reflect.getMetadata(Symbols.wamp, target.constructor) ?? {};
			metadata.reconnectSuccess = descriptor.value;
			Reflect.defineMetadata(Symbols.wamp, metadata, target.constructor);
		};
	};
}
