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

import type { AppHttpContext } from '@elysiumjs/core';
import type { Context as ElysiaContext, Handler, HTTPMethod, PreContext, TSchema } from 'elysia';
import type { Class, MergeDeep } from 'type-fest';
import type { Middleware } from './middleware';
import type { Module } from './module';

import { Elysia, t } from 'elysia';
import { assign, isEmpty, objectify } from 'radash';

import { Application } from './app';
import { Database } from './database';
import { applyMiddlewares, executeMiddlewareChain } from './middleware';
import { Service } from './service';
import { nextTick, Symbols } from './utils';

/**
 * A route is a string that starts with a forward slash.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type Route = `/${string}`;

/**
 * A class for validating data against a schema.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type ValidatorClass<T extends TSchema = TSchema> = {
	/**
	 * The validation schema. This schema is automatically checked against the input data during
	 * the validation stage of the HTTP request.
	 */
	readonly schema: T;

	/**
	 * Whether the request should be authorized before validation. If the request is not authorized,
	 * the validation will be skipped.
	 */
	authorize(ctx: Context<T['static']>): Promise<boolean>;

	/**
	 * Processes custom validation logic. This method is called after the validation schema is checked
	 * against the input data. So it's safe to assume that the schema is valid.
	 * @param data The input data to validate.
	 * @returns Whether the input data is valid.
	 */
	validate(ctx: Context<T['static']>): Promise<boolean>;
};

/**
 * A function that handles an HTTP request.
 * @author Axel Nana <axel.nana@workbud.com>
 */
type HttpRequestHandler = (...args: unknown[]) => unknown;

/**
 * Stores metadata for an HTTP request handler.
 * @author Axel Nana <axel.nana@workbud.com>
 */
type HttpRequestHandlerMetadata = {
	/**
	 * The path of the HTTP route.
	 */
	path: Route;

	/**
	 * The HTTP method of the handler.
	 */
	method: HTTPMethod;

	/**
	 * The request handler function.
	 */
	handler: HttpRequestHandler;

	/**
	 * The response schema.
	 */
	response?: TSchema | Record<number, TSchema>;

	/**
	 * The request body schema.
	 */
	body?: { schema?: TSchema; validator?: ValidatorClass; index: number };

	/**
	 * The request query schema.
	 */
	query?: { schema?: TSchema; index: number };

	/**
	 * The request parameters.
	 */
	params: Array<{ slug: string; schema: TSchema; index: number }>;

	/**
	 * The raw context for the handler.
	 */
	rawContext?: { index: number };

	/**
	 * Custom decorators for the handler.
	 */
	customDecorators: Array<{ handler: Handler; index: number }>;

	/**
	 * The middlewares for the handler.
	 */
	middlewares: Array<Class<Middleware>>;

	/**
	 * The OpenAPI's operationId for the handler.
	 */
	operationId?: string;

	/**
	 * The OpenAPI's description for the handler.
	 */
	description?: string;

	/**
	 * The list of services injected in the handler.
	 */
	services: Array<{ name: string; index: number }>;

	/**
	 * Whether the request handler is transactional.
	 *
	 * If set to `true`, a new transaction will be created and all the database
	 * queries running for that handler will be wrapped in that transaction.
	 */
	transactional?: boolean;
};

/**
 * Parameters for registering an HTTP request handler.
 * @author Axel Nana <axel.nana@workbud.com>
 */
type HttpRequestHandlerRegistrationProps = Pick<
	HttpRequestHandlerMetadata,
	'path' | 'method' | 'handler' | 'response' | 'operationId' | 'description' | 'transactional'
> & {
	target: Object;
	propertyKey: string | symbol;
};

/**
 * Metadata for the HTTP context.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type Singleton<TController = unknown, TModule extends Module = Module> = MergeDeep<
	AppHttpContext,
	{
		decorator: {
			[key: string]: unknown;

			/**
			 * The controller instance.
			 */
			controller: () => TController;

			/**
			 * The module instance.
			 */
			module: TModule;
		};

		resolve: {
			/**
			 * The tenant ID.
			 */
			readonly tenant: string;
		};
	}
>;

/**
 * The Elysia context with the controller injected.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type Context<
	TBody = unknown,
	TController = unknown,
	TModule extends Module = Module
> = ElysiaContext<
	{
		body: TBody;
	},
	Singleton<TController, TModule>
>;

export type ElysiaApp = Elysia<Route, Singleton>;

const registerHttpRequestHandler = (props: HttpRequestHandlerRegistrationProps) => {
	const body = Reflect.getMetadata('http:body', props.target, props.propertyKey);
	const params = Reflect.getMetadata('http:params', props.target, props.propertyKey) ?? [];
	const query = Reflect.getMetadata('http:query', props.target, props.propertyKey);
	const rawContext = Reflect.getMetadata('http:rawContext', props.target, props.propertyKey);
	const customDecorators =
		Reflect.getMetadata('http:customDecorators', props.target, props.propertyKey) ?? [];
	const middlewares =
		Reflect.getMetadata(Symbols.middlewares, props.target, props.propertyKey) ?? [];
	const services = Reflect.getMetadata(Symbols.services, props.target, props.propertyKey) ?? [];

	const { path, method, handler, target, response, operationId, description, transactional } =
		props;

	const metadata: HttpRequestHandlerMetadata[] =
		Reflect.getMetadata(Symbols.http, target.constructor) ?? [];

	metadata.push({
		path,
		method,
		body,
		params,
		query,
		customDecorators,
		rawContext,
		handler,
		middlewares,
		response,
		operationId,
		description,
		services,
		transactional
	});

	Reflect.defineMetadata(Symbols.http, metadata, target.constructor);
};

/**
 * The scope of an HTTP controller.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export enum HttpControllerScope {
	/**
	 * The controller is instantiated once in the server and used for every request.
	 */
	SERVER,

	/**
	 * A new instance of the controller is created for each request.
	 */
	REQUEST
}

/**
 * Properties required when declaring an HTTP controller using the `@http()` decorator.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type HttpControllerProps = {
	/**
	 * The path of the HTTP route.
	 */
	path: Route;

	/**
	 * The scope of the HTTP controller.
	 * @default HttpControllerScope.SERVER
	 */
	scope?: HttpControllerScope;

	/**
	 * The list of tags for the controller.
	 * Used in Swagger documentation.
	 */
	tags?: Array<string>;

	/**
	 * Whether to create a database transaction for all the queries executed
	 * for all the request handlers in this controller.
	 */
	transactional?: boolean;
};

/**
 * Properties required when declaring an HTTP request handler.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type RequestHandlerDecoratorProps = {
	/**
	 * The HTTP method of the handler.
	 */
	method?: HTTPMethod;

	/**
	 * The path of the HTTP route.
	 */
	path?: Route;

	/**
	 * The schema of the response body.
	 */
	response?: TSchema | Record<number, TSchema>;

	/**
	 * The operation ID for the handler.
	 * Used in Swagger documentation.
	 */
	operationId?: string;

	/**
	 * The description for the handler.
	 * Used in Swagger documentation.
	 */
	description?: string;

	/**
	 * Whether to create a database transaction for all the queries executed
	 * for this request handler.
	 */
	transactional?: boolean;
};

export namespace Http {
	/**
	 * Marks a class as an HTTP controller.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param props The decorator options.
	 */
	export const controller = (props: HttpControllerProps = { path: '/' }) => {
		return function (target: Class<any>) {
			async function handleHttp(): Promise<ElysiaApp> {
				// TODO: Use the logger service here
				console.log(`Registering HTTP controller for ${props.path} using ${target.name}`);
				await nextTick();

				props = assign({ path: '/', scope: HttpControllerScope.SERVER, tags: [] }, props);

				const app: ElysiaApp = new Elysia({
					prefix: props.path,
					name: target.name
				});

				if (props.scope === HttpControllerScope.SERVER) {
					const controller = Service.make(target);
					app.decorate('controller', () => controller);
				} else if (props.scope === HttpControllerScope.REQUEST) {
					app.decorate('controller', () => Service.make(target));
				}

				const onRequest = Reflect.getMetadata('http:onRequest', target) ?? {};
				if (onRequest.handler) {
					app.onRequest((c: PreContext<Singleton>) => {
						const controller = c.controller();
						return onRequest.handler.call(controller, c);
					});
				}

				const middlewares = Reflect.getMetadata(Symbols.middlewares, target) ?? [];
				applyMiddlewares(middlewares, app);

				const metadata: HttpRequestHandlerMetadata[] =
					Reflect.getMetadata(Symbols.http, target) ?? [];

				for (const route of metadata) {
					const getParameters = async (c: Context) => {
						const parameters: any[] = [];

						if (route.rawContext) {
							parameters[route.rawContext.index] = c;
						}

						if (route.body) {
							parameters[route.body.index] = c.body;
						}

						if (route.query) {
							parameters[route.query.index] = c.query;
						}

						if (!isEmpty(route.params)) {
							for (const param of route.params) {
								parameters[param.index] = c.params[param.slug];
							}
						}

						if (!isEmpty(route.customDecorators)) {
							for (const customDecorator of route.customDecorators) {
								parameters[customDecorator.index] = await customDecorator.handler(c);
							}
						}

						if (!isEmpty(route.services)) {
							for (const service of route.services) {
								parameters[service.index] = Service.get(service.name);
							}
						}

						return parameters;
					};

					const isGenerator = route.handler.constructor.name.includes('GeneratorFunction');
					const isSSE = route.method === 'elysium:SSE';
					const isTransactional = route.transactional ?? props.transactional ?? false;
					const isValidator =
						route.body && route.body.schema === undefined && route.body.validator !== undefined;

					route.method = isSSE ? 'GET' : route.method;

					const getHandler = () => {
						const initTransactedHandler = (c: Context) => {
							if (isTransactional) {
								return function (...args: unknown[]) {
									return Database.getDefaultConnection().transaction((tx) => {
										return Application.context.run(
											new Map([
												['tenant', c.tenant as unknown],
												['http:context', c],
												['db:tx', tx]
											]),
											() => {
												try {
													return route.handler.call(c.controller(), ...args) as Promise<unknown>;
												} catch (e) {
													tx.rollback();
													throw e;
												}
											}
										);
									});
								};
							}

							return function (...args: unknown[]) {
								return Application.context.run(
									new Map([
										['tenant', c.tenant as unknown],
										['http:context', c]
									]),
									() => route.handler.call(c.controller(), ...args) as Promise<unknown>
								);
							};
						};

						if (isGenerator) {
							return async function* (c: Context) {
								const handler = initTransactedHandler(c);

								try {
									for await (const eachValue of handler(...(await getParameters(c))) as any)
										yield eachValue;
								} catch (error: any) {
									yield error;
								}
							};
						}

						if (isSSE) {
							return async function* (c: Context) {
								const handler = initTransactedHandler(c);

								c.set.headers['Content-Type'] = 'text/event-stream';
								c.set.headers['Cache-Control'] = 'no-cache';
								c.set.headers['Connection'] = 'keep-alive';

								while (true) {
									yield `data: ${await handler(...(await getParameters(c)))}\n\n`;
									await Bun.sleep(1);
								}
							};
						}

						if (isValidator) {
							return async function (c: Context) {
								if (await route.body!.validator!.validate(c)) {
									const handler = initTransactedHandler(c);
									return await handler(...(await getParameters(c)));
								}

								throw c.status(400, 'Invalid request body');
							};
						}

						return async function (c: Context) {
							const handler = initTransactedHandler(c);
							return await handler(...(await getParameters(c)));
						};
					};

					const params = objectify(
						route.params ?? [],
						(p) => p.slug,
						(p) => p.schema
					);

					const mi = route.middlewares.map((middleware) => Service.make<Middleware>(middleware));

					app.route(route.method, route.path, getHandler(), {
						// @ts-ignore
						config: {},
						async transform(c) {
							if (isValidator && !(await route.body!.validator!.authorize(c as Context))) {
								throw c.status(401, 'Unauthorized');
							}

							return executeMiddlewareChain(mi, c, 'onTransform');
						},
						beforeHandle(c) {
							return executeMiddlewareChain(mi, c, 'onBeforeHandle');
						},
						afterHandle(c) {
							return executeMiddlewareChain(mi, c, 'onAfterHandle');
						},
						afterResponse(c) {
							return executeMiddlewareChain(mi, c, 'onAfterResponse');
						},
						detail: {
							tags: props.tags,
							description: route.description,
							operationId: route.operationId
						},
						body: isValidator ? route.body?.validator?.schema : route.body?.schema,
						response: route.response,
						params: isEmpty(params) ? undefined : t.Object(params)
					});
				}

				return app;
			}

			Reflect.defineMetadata(Symbols.elysiaPlugin, handleHttp, target);
		};
	};

	/**
	 * Marks a method as an HTTP "server-sent events" request handler.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param props The request handler properties.
	 */
	export const sse = (props: RequestHandlerDecoratorProps = {}): MethodDecorator => {
		const { path = '/', ...rest } = props;
		return custom({ method: 'elysium:SSE', path, ...rest });
	};

	/**
	 * Marks a method as an HTTP "get" request handler.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param props The request handler properties.
	 */
	export const get = (props: RequestHandlerDecoratorProps = {}): MethodDecorator => {
		const { path = '/', ...rest } = props;
		return custom({ method: 'GET', path, ...rest });
	};

	/**
	 * Marks a method as an HTTP "post" request handler.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param props The request handler properties.
	 */
	export const post = (props: RequestHandlerDecoratorProps = {}): MethodDecorator => {
		const { path = '/', ...rest } = props;
		return custom({ method: 'POST', path, ...rest });
	};

	/**
	 * Marks a method as an HTTP "put" request handler.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param props The request handler properties.
	 */
	export const put = (props: RequestHandlerDecoratorProps = {}): MethodDecorator => {
		const { path = '/', ...rest } = props;
		return custom({ method: 'PUT', path, ...rest });
	};

	/**
	 * Marks a method as an HTTP "delete" request handler.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param props The request handler properties.
	 */
	export const del = (props: RequestHandlerDecoratorProps = {}): MethodDecorator => {
		const { path = '/', ...rest } = props;
		return custom({ method: 'DELETE', path, ...rest });
	};

	/**
	 * Marks a method as an HTTP "patch" request handler.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param props The request handler properties.
	 */
	export const patch = (props: RequestHandlerDecoratorProps = {}): MethodDecorator => {
		const { path = '/', ...rest } = props;
		return custom({ method: 'PATCH', path, ...rest });
	};

	/**
	 * Marks a method as an HTTP "head" request handler.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param props The request handler properties.
	 */
	export const head = (props: RequestHandlerDecoratorProps = {}): MethodDecorator => {
		const { path = '/', ...rest } = props ?? {};
		return custom({ method: 'HEAD', path, ...rest });
	};

	/**
	 * Marks a method as an HTTP "options" request handler.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param props The request handler properties.
	 */
	export const options = (props: RequestHandlerDecoratorProps = {}): MethodDecorator => {
		const { path = '/', ...rest } = props;
		return custom({ method: 'OPTIONS', path, ...rest });
	};

	/**
	 * Marks a method as an HTTP "trace" request handler.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param props The request handler properties.
	 */
	export const trace = (props: RequestHandlerDecoratorProps = {}): MethodDecorator => {
		const { path = '/', ...rest } = props;
		return custom({ method: 'TRACE', path, ...rest });
	};

	/**
	 * Marks a method as an HTTP request handler with a custom method.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param props The request handler properties.
	 */
	export const custom = ({
		path = '/',
		...rest
	}: RequestHandlerDecoratorProps & { method: HTTPMethod }): MethodDecorator => {
		return function (target, propertyKey, descriptor) {
			process.nextTick(() => {
				registerHttpRequestHandler({
					path,
					handler: descriptor.value as HttpRequestHandler,
					target,
					propertyKey,
					...rest
				});
			});
		};
	};

	/**
	 * Marks a method as the callback for the request handler.
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	export const onRequest = (): MethodDecorator => {
		return function (target, propertyKey, descriptor) {
			const metadata = Reflect.getMetadata('http:onRequest', target.constructor) ?? {};
			metadata.handler = descriptor.value;
			Reflect.defineMetadata('http:onRequest', metadata, target.constructor);
		};
	};

	/**
	 * Resolves the context for the current request in the annotated parameter.
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	export const context = (): ParameterDecorator => {
		return function (target, propertyKey, parameterIndex) {
			Reflect.defineMetadata('http:rawContext', { index: parameterIndex }, target, propertyKey!);
		};
	};

	/**
	 * Resolves the value of a URL parameter in the annotated parameter.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param slug The slug of the parameter.
	 * @param schema The schema of the parameter.
	 */
	export const param = (slug: string, schema?: TSchema): ParameterDecorator => {
		return function (target, propertyKey, parameterIndex) {
			const params = Reflect.getMetadata('http:params', target, propertyKey!) ?? [];
			params.push({ slug, schema: schema ?? t.String(), index: parameterIndex });
			Reflect.defineMetadata('http:params', params, target, propertyKey!);
		};
	};

	/**
	 * Resolves the value of a query parameter in the annotated parameter.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param schema The schema of the query parameter.
	 */
	export const query = (schema?: TSchema): ParameterDecorator => {
		return function (target, propertyKey, parameterIndex) {
			Reflect.defineMetadata('http:query', { schema, index: parameterIndex }, target, propertyKey!);
		};
	};

	/**
	 * Resolves the value of the request body in the annotated parameter.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param schema The schema of the request body.
	 */
	export const body = (schema?: TSchema | ValidatorClass): ParameterDecorator => {
		return function (target, propertyKey, parameterIndex) {
			if (typeof schema === 'function') {
				Reflect.defineMetadata(
					'http:body',
					{ validator: schema, index: parameterIndex },
					target,
					propertyKey!
				);
			} else {
				Reflect.defineMetadata(
					'http:body',
					{ schema, index: parameterIndex },
					target,
					propertyKey!
				);
			}
		};
	};

	/**
	 * Executes a custom function to resolve the value of the parameter from the context.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param handler The custom function that will return the value for the parameter.
	 */
	export const decorate = (handler: Handler): (() => ParameterDecorator) => {
		return () => {
			return function (target, propertyKey, parameterIndex) {
				const decorators = Reflect.getMetadata('http:customDecorators', target, propertyKey!) ?? [];
				decorators.push({ handler, index: parameterIndex });
				Reflect.defineMetadata('http:customDecorators', decorators, target, propertyKey!);
			};
		};
	};
}
