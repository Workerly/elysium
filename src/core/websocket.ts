import type { ServerWebSocket } from 'bun';
import type { Context, TSchema } from 'elysia';
import type { Class, ConditionalPick, JsonObject, Primitive } from 'type-fest';

import { Elysia } from 'elysia';

import { bind } from './service';
import { nextTick, Route, Symbols } from './utils';

/**
 * Properties required when declaring a websocket route using the `@websocket()` decorator.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type WebsocketProps = {
	/**
	 * The path of the websocket route.
	 */
	path: Route;

	/**
	 * The options for the websocket server.
	 */
	options?: ConditionalPick<Bun.WebSocketHandler, Primitive | JsonObject>;
};

/**
 * The websocket connection instance.
 * @author Axel Nana <axel.nana@workbud.com>
 * @template TData Additional data stored in the websocket connection.
 */
export type WS<TData = unknown> = ServerWebSocket<
	{
		/**
		 * Unique identifier for the websocket connection.
		 */
		id: string;

		/**
		 * The Elysia context for the websocket connection.
		 */
		data: Context;
	} & TData
>;

/**
 * Marks a class as a websocket controller.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param props The websocket route properties.
 */
export const websocket = (props: WebsocketProps) => {
	return function (target: Class<any>) {
		async function handleWebsocket(): Promise<Elysia> {
			// TODO: Use the logger service here
			console.log(`Registering Websocket route for ${props.path} using ${target.name}`);
			await nextTick();

			const controller = bind(target);

			const metadata = Reflect.getMetadata(Symbols.websocket, target) ?? {};
			const open = metadata.open?.bind(controller);
			const close = metadata.close?.bind(controller);
			const message = metadata.message?.bind(controller);
			const drain = metadata.drain?.bind(controller);

			const app = new Elysia();

			// TODO: Add middlewares here
			app.ws(props.path, {
				// TODO: beforeHandle
				// TODO: afterHandle
				open,
				close,
				message,
				drain,
				body: metadata.body,
				...props.options
			});

			return app;
		}

		Reflect.defineMetadata(Symbols.elysiaPlugin, handleWebsocket, target);
	};
};

/**
 * Marks a method as the websocket "open" event handler.
 * @author Axel Nana <axel.nana@workbud.com>
 *
 * This decorator should be used on a websocket controller method. Only one "open" event handler
 * can be defined per websocket controller.
 */
export const onOpen = (): MethodDecorator => {
	return function (target, propertyKey, descriptor) {
		const metadata = Reflect.getMetadata(Symbols.websocket, target.constructor) || {};
		metadata.open = descriptor.value;
		Reflect.defineMetadata(Symbols.websocket, metadata, target.constructor);
	};
};

/**
 * Marks a method as the websocket "close" event handler.
 * @author Axel Nana <axel.nana@workbud.com>
 *
 * This decorator should be used on a websocket controller method. Only one "close" event handler
 * can be defined per websocket controller.
 */
export const onClose = (): MethodDecorator => {
	return function (target, propertyKey, descriptor) {
		const metadata = Reflect.getMetadata(Symbols.websocket, target.constructor) || {};
		metadata.close = descriptor.value;
		Reflect.defineMetadata(Symbols.websocket, metadata, target.constructor);
	};
};

/**
 * Marks a method as the websocket "message" event handler.
 * @author Axel Nana <axel.nana@workbud.com>
 *
 * This decorator should be used on a websocket controller method. Only one "message" event handler
 * can be defined per websocket controller.
 *
 * @param schema The schema of the message body.
 */
export const onMessage = (schema: TSchema): MethodDecorator => {
	return function (target, propertyKey, descriptor) {
		const metadata = Reflect.getMetadata(Symbols.websocket, target.constructor) || {};
		metadata.message = descriptor.value;
		metadata.body = schema;
		Reflect.defineMetadata(Symbols.websocket, metadata, target.constructor);
	};
};

/**
 * Marks a method as the websocket "drain" event handler.
 * @author Axel Nana <axel.nana@workbud.com>
 *
 * This decorator should be used on a websocket controller method. Only one "drain" event handler
 * can be defined per websocket controller.
 */
export const onDrain = (): MethodDecorator => {
	return function (target, propertyKey, descriptor) {
		const metadata = Reflect.getMetadata(Symbols.websocket, target.constructor) || {};
		metadata.drain = descriptor.value;
		Reflect.defineMetadata(Symbols.websocket, metadata, target.constructor);
	};
};
