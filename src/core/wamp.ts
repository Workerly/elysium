import 'reflect-metadata';

import type { Class } from 'type-fest';

import { omit } from 'radash';
import Wampy from 'wampy';

import { Event } from './event';
import { bind } from './service';
import { Symbols } from './utils';

// FIXME: Temporary solution for Bun to properly fill the protocol field. Remove this once oven-sh/bun#18744 is fixed.
class WampWebsocket extends WebSocket {
	public constructor(url: string, protocols?: string | string[]) {
		super(url, protocols);
	}

	public get protocol(): string {
		return 'wamp.2.json';
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
};

/**
 * Data sent to a WAMP RPC.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type WampRegistrationHandlerArgs = {
	/**
	 * The arguments passed to the RPC or subscription.
	 */
	argsList: any[];

	/**
	 * The keyword arguments passed to the RPC or subscription.
	 */
	argsDict: any;

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

/**
 * Marks a class as a WAMP controller.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param options The decorator options.
 */
export const wamp = (options: WampProps) => {
	return function (target: Class<any>) {
		// TODO: Use the logger service here
		console.log(`Registering Wamp route for ${options.url} using ${target.name}`);

		const controller = bind(target);

		const metadata = Reflect.getMetadata(Symbols.wamp, target) ?? {};

		const w = new Wampy(options.url, {
			ws: WampWebsocket,
			...omit(options, ['url']),
			onClose: metadata.close?.bind(controller),
			onError() {
				metadata.error?.bind(controller)();
				// TODO: Add more details like controller name and url
				Event.emit('elysium:error', new Error('Wamp connection error'));
			},
			onReconnect: metadata.reconnect?.bind(controller),
			onReconnectSuccess: metadata.reconnectSuccess?.bind(controller)
		});

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

		w.connect().then(metadata.open?.bind(controller));
	};
};

/**
 * Registers a method as a WAMP RPC.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param topic The RPC topic to register.
 * @param options The registration options.
 */
export const register = (topic: string, options?: WampRegistrationOptions): MethodDecorator => {
	return function (target, propertyKey, descriptor) {
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
	return function (target, propertyKey, descriptor) {
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
 * Marks a method as the WAMP "open" event handler.
 * @author Axel Nana <axel.nana@workbud.com>
 *
 * This decorator should be used on a WAMP controller method. Only one "open" event handler
 * can be defined per WAMP controller.
 */
export const onOpen = (): MethodDecorator => {
	return function (target, propertyKey, descriptor) {
		const metadata = Reflect.getMetadata(Symbols.wamp, target.constructor) ?? {};
		metadata.open = descriptor.value;
		Reflect.defineMetadata(Symbols.wamp, metadata, target.constructor);
	};
};

/**
 * Marks a method as the WAMP "close" event handler.
 * @author Axel Nana <axel.nana@workbud.com>
 *
 * This decorator should be used on a WAMP controller method. Only one "close" event handler
 * can be defined per WAMP controller.
 */
export const onClose = (): MethodDecorator => {
	return function (target, propertyKey, descriptor) {
		const metadata = Reflect.getMetadata(Symbols.wamp, target.constructor) ?? {};
		metadata.close = descriptor.value;
		Reflect.defineMetadata(Symbols.wamp, metadata, target.constructor);
	};
};

/**
 * Marks a method as the WAMP "error" event handler.
 * @author Axel Nana <axel.nana@workbud.com>
 *
 * This decorator should be used on a WAMP controller method. Only one "error" event handler
 * can be defined per WAMP controller.
 */
export const onError = (): MethodDecorator => {
	return function (target, propertyKey, descriptor) {
		const metadata = Reflect.getMetadata(Symbols.wamp, target.constructor) ?? {};
		metadata.error = descriptor.value;
		Reflect.defineMetadata(Symbols.wamp, metadata, target.constructor);
	};
};

/**
 * Marks a method as the WAMP "reconnect" event handler.
 * @author Axel Nana <axel.nana@workbud.com>
 *
 * This decorator should be used on a WAMP controller method. Only one "reconnect" event handler
 * can be defined per WAMP controller.
 */
export const onReconnect = (): MethodDecorator => {
	return function (target, propertyKey, descriptor) {
		const metadata = Reflect.getMetadata(Symbols.wamp, target.constructor) ?? {};
		metadata.reconnect = descriptor.value;
		Reflect.defineMetadata(Symbols.wamp, metadata, target.constructor);
	};
};

/**
 * Marks a method as the WAMP "reconnectSuccess" event handler.
 * @author Axel Nana <axel.nana@workbud.com>
 *
 * This decorator should be used on a WAMP controller method. Only one "reconnectSuccess" event handler
 * can be defined per WAMP controller.
 */
export const onReconnectSuccess = (): MethodDecorator => {
	return function (target, propertyKey, descriptor) {
		const metadata = Reflect.getMetadata(Symbols.wamp, target.constructor) ?? {};
		metadata.reconnectSuccess = descriptor.value;
		Reflect.defineMetadata(Symbols.wamp, metadata, target.constructor);
	};
};
