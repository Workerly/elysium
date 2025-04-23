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

import type { ServerWebSocket } from 'bun';
import type { Context, ErrorContext, TSchema } from 'elysia';
import type { Class, ConditionalPick, JsonObject, Primitive } from 'type-fest';
import type { Route } from './http';

import { Elysia } from 'elysia';

import { Event } from './event';
import { Service } from './service';
import { nextTick, Symbols } from './utils';

/**
 * Properties required when declaring a websocket controller using the `@websocket()` decorator.
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
	} & Context &
		TData
>;

/**
 * The data generated when an error occurs in a websocket connection.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type WSError = ErrorContext & { error: Readonly<Error> };

export namespace Websocket {
	/**
	 * Marks a class as a websocket controller.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param props The websocket route properties.
	 */
	export const controller = (props: WebsocketProps) => {
		return function (target: Class<any>) {
			async function handleWebsocket(): Promise<Elysia> {
				// TODO: Use the logger service here
				console.log(`Registering Websocket route for ${props.path} using ${target.name}`);
				await nextTick();

				const controller = Service.make(target);

				const metadata = Reflect.getMetadata(Symbols.websocket, target) ?? {};
				const open = metadata.open?.bind(controller);
				const close = metadata.close?.bind(controller);
				const message = metadata.message?.bind(controller);
				const drain = metadata.drain?.bind(controller);
				const error =
					metadata.error?.bind(controller) ??
					((e: WSError) => Event.emit('elysium:error', e.error));

				const app = new Elysia();

				// TODO: Add middlewares here
				app.ws(props.path, {
					// TODO: beforeHandle
					// TODO: afterHandle
					open,
					close,
					message,
					drain,
					error,
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
	 *
	 * This decorator should be used on a websocket controller method. Only one "open" event handler
	 * can be defined per websocket controller.
	 *
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	export const onOpen = (): MethodDecorator => {
		return function (target, propertyKey, descriptor) {
			const metadata = Reflect.getMetadata(Symbols.websocket, target.constructor) ?? {};
			metadata.open = descriptor.value;
			Reflect.defineMetadata(Symbols.websocket, metadata, target.constructor);
		};
	};

	/**
	 * Marks a method as the websocket "close" event handler.
	 *
	 * This decorator should be used on a websocket controller method. Only one "close" event handler
	 * can be defined per websocket controller.
	 *
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	export const onClose = (): MethodDecorator => {
		return function (target, propertyKey, descriptor) {
			const metadata = Reflect.getMetadata(Symbols.websocket, target.constructor) ?? {};
			metadata.close = descriptor.value;
			Reflect.defineMetadata(Symbols.websocket, metadata, target.constructor);
		};
	};

	/**
	 * Marks a method as the websocket "message" event handler.
	 *
	 * This decorator should be used on a websocket controller method. Only one "message" event handler
	 * can be defined per websocket controller.
	 *
	 * @author Axel Nana <axel.nana@workbud.com>
	 *
	 * @param schema The schema of the message body.
	 */
	export const onMessage = (schema?: TSchema): MethodDecorator => {
		return function (target, propertyKey, descriptor) {
			const metadata = Reflect.getMetadata(Symbols.websocket, target.constructor) ?? {};
			metadata.message = descriptor.value;
			metadata.body = schema;
			Reflect.defineMetadata(Symbols.websocket, metadata, target.constructor);
		};
	};

	/**
	 * Marks a method as the websocket "drain" event handler.
	 *
	 * This decorator should be used on a websocket controller method. Only one "drain" event handler
	 * can be defined per websocket controller.
	 *
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	export const onDrain = (): MethodDecorator => {
		return function (target, propertyKey, descriptor) {
			const metadata = Reflect.getMetadata(Symbols.websocket, target.constructor) ?? {};
			metadata.drain = descriptor.value;
			Reflect.defineMetadata(Symbols.websocket, metadata, target.constructor);
		};
	};

	/**
	 * Marks a method as the websocket "error" event handler.
	 *
	 * This decorator should be used on a websocket controller method. Only one "error" event handler
	 * can be defined per websocket controller.
	 *
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	export const onError = (): MethodDecorator => {
		return function (target, propertyKey, descriptor) {
			const metadata = Reflect.getMetadata(Symbols.websocket, target.constructor) ?? {};
			metadata.error = descriptor.value;
			Reflect.defineMetadata(Symbols.websocket, metadata, target.constructor);
		};
	};
}
