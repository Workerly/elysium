import type {
	AnyElysia,
	Context,
	Handler,
	HTTPMethod,
	PreContext,
	SingletonBase,
	TSchema
} from 'elysia';
import type { Class } from 'type-fest';
import type { Route } from './utils';

import { Elysia, t } from 'elysia';
import { assign, isEmpty, objectify, trim, uid } from 'radash';

import { Middleware } from './middleware';
import { Service } from './service';
import { nextTick, Symbols } from './utils';

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
	 * The request body schema.
	 */
	body?: { schema?: TSchema; index: number };

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
};

/**
 * Parameters for registering an HTTP request handler.
 * @author Axel Nana <axel.nana@workbud.com>
 */
type HttpRequestHandlerRegistrationProps = Pick<
	HttpRequestHandlerMetadata,
	'path' | 'method' | 'handler'
> & {
	target: Object;
	propertyKey: string | symbol;
};

/**
 * The Elysia context with the controller injected.
 * @author Axel Nana <axel.nana@workbud.com>
 */
type ContextWithController = Context<{}, SingletonBase & { controller: any }>;

const registerHttpRequestHandler = (props: HttpRequestHandlerRegistrationProps) => {
	const body = Reflect.getMetadata('http:body', props.target, props.propertyKey);
	const params = Reflect.getMetadata('http:params', props.target, props.propertyKey) ?? [];
	const query = Reflect.getMetadata('http:query', props.target, props.propertyKey);
	const rawContext = Reflect.getMetadata('http:rawContext', props.target, props.propertyKey);
	const customDecorators =
		Reflect.getMetadata('http:customDecorators', props.target, props.propertyKey) ?? [];
	const middlewares =
		Reflect.getMetadata(Symbols.middlewares, props.target, props.propertyKey) ?? [];

	const { path, method, handler, target } = props;

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
		middlewares
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
export type HttpProps = {
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
};

/**
 * Marks a class as an HTTP controller.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param props The decorator options.
 */
export const http = (props: HttpProps) => {
	return function (target: Class<any>) {
		async function handleHttp(): Promise<AnyElysia> {
			// TODO: Use the logger service here
			console.log(`Registering HTTP route for ${props.path} using ${target.name}`);
			await nextTick();

			props = assign({ path: '/', scope: HttpControllerScope.SERVER, tags: [] }, props);

			const app = new Elysia({ prefix: props.path, name: target.name });

			if (props.scope === HttpControllerScope.SERVER) {
				app.decorate('controller', Service.make(target));
			} else if (props.scope === HttpControllerScope.REQUEST) {
				app.resolve({ as: 'scoped' }, () => ({
					controller: Service.make(target)
				}));
			}

			const onRequest = Reflect.getMetadata('http:onRequest', target) ?? {};
			if (onRequest.handler) {
				app.onRequest((c: PreContext<SingletonBase & { controller: any }>) => {
					const controller = c.controller;
					const handler = onRequest.handler.bind(controller);
					return handler(c);
				});
			}

			const middlewares = Reflect.getMetadata(Symbols.middlewares, target) ?? [];

			for (const middleware of middlewares) {
				const m = Service.make<Middleware>(middleware)!;
				app.onAfterHandle(m.onAfterHandle.bind(m));
				app.onBeforeHandle(m.onBeforeHandle.bind(m));
				app.onAfterResponse(m.onAfterResponse.bind(m));
			}

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

					return parameters;
				};

				const isGenerator = route.handler.constructor.name.includes('GeneratorFunction');
				const isSSE = route.method === 'elysium:SSE';

				route.method = isSSE ? 'GET' : route.method;

				const getHandler = () => {
					if (isGenerator) {
						return async function* (c: ContextWithController) {
							const controller = c.controller;
							const handler = route.handler.bind(controller);

							try {
								for await (const eachValue of handler(...(await getParameters(c))) as any[])
									yield eachValue;
							} catch (error: any) {
								yield error;
							}
						};
					}

					if (isSSE) {
						return async function* (c: ContextWithController) {
							const controller = c.controller;
							const handler = route.handler.bind(controller);

							c.set.headers['Content-Type'] = 'text/event-stream';
							c.set.headers['Cache-Control'] = 'no-cache';
							c.set.headers['Connection'] = 'keep-alive';

							while (true) {
								yield `data: ${await handler(...(await getParameters(c)))}\n\n`;
								await Bun.sleep(1);
							}
						};
					}

					return async function (c: ContextWithController) {
						const controller = c.controller;
						const handler = route.handler.bind(controller);
						return handler(...(await getParameters(c)));
					};
				};

				const params = objectify(
					route.params ?? [],
					(p) => p.slug,
					(p) => p.schema
				);

				app.route(route.method, `/${trim(route.path, '/')}`, getHandler(), {
					// @ts-ignore
					config: {},
					beforeHandle(c: ContextWithController) {
						for (const middleware of route.middlewares) {
							const m = Service.make(middleware);
							m.onBeforeHandle(c);
						}
					},
					afterHandle(c: ContextWithController) {
						for (const middleware of route.middlewares) {
							const m = Service.make(middleware);
							m.onAfterHandle(c);
						}
					},
					afterResponse(c: ContextWithController) {
						for (const middleware of route.middlewares) {
							const m = Service.make(middleware);
							m.onAfterResponse(c);
						}
					},
					tags: props.tags,
					body: route.body?.schema,
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
 * @param path The path of the HTTP route.
 */
export const sse = (path: Route = '/'): MethodDecorator => custom('elysium:SSE', path);

/**
 * Marks a method as an HTTP "get" request handler.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param path The path of the HTTP route.
 */
export const get = (path: Route = '/'): MethodDecorator => custom('GET', path);

/**
 * Marks a method as an HTTP "post" request handler.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param path The path of the HTTP route.
 */
export const post = (path: Route = '/'): MethodDecorator => custom('POST', path);

/**
 * Marks a method as an HTTP "put" request handler.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param path The path of the HTTP route.
 */
export const put = (path: Route = '/'): MethodDecorator => custom('PUT', path);

/**
 * Marks a method as an HTTP "delete" request handler.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param path The path of the HTTP route.
 */
export const del = (path: Route = '/'): MethodDecorator => custom('DELETE', path);

/**
 * Marks a method as an HTTP "patch" request handler.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param path The path of the HTTP route.
 */
export const patch = (path: Route = '/'): MethodDecorator => custom('PATCH', path);

/**
 * Marks a method as an HTTP "head" request handler.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param path The path of the HTTP route.
 */
export const head = (path: Route = '/'): MethodDecorator => custom('HEAD', path);

/**
 * Marks a method as an HTTP "options" request handler.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param path The path of the HTTP route.
 */
export const options = (path: Route = '/'): MethodDecorator => custom('OPTIONS', path);

/**
 * Marks a method as an HTTP "trace" request handler.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param path The path of the HTTP route.
 */
export const trace = (path: Route = '/'): MethodDecorator => custom('TRACE', path);

/**
 * Marks a method as an HTTP request handler with a custom method.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param method The HTTP method.
 * @param path The path of the HTTP route.
 */
export const custom = (method: HTTPMethod, path: Route = '/'): MethodDecorator => {
	return function (target, propertyKey, descriptor) {
		process.nextTick(() => {
			registerHttpRequestHandler({
				path,
				method,
				handler: descriptor.value as HttpRequestHandler,
				target,
				propertyKey
			});
		});
	};
};

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
export const body = (schema?: TSchema): ParameterDecorator => {
	return function (target, propertyKey, parameterIndex) {
		Reflect.defineMetadata('http:body', { schema, index: parameterIndex }, target, propertyKey!);
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
