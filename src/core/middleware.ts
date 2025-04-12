import type { Class } from 'type-fest';

import { Context, PreContext } from 'elysia';

import { Symbols } from './utils';

export const middleware = (
	...middlewares: Class<Middleware>[]
): ClassDecorator & MethodDecorator => {
	return function (target: Object, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) {
		if (propertyKey === undefined && descriptor === undefined) {
			const m = Reflect.getMetadata(Symbols.middlewares, target) ?? [];
			m.push(...middlewares);
			Reflect.defineMetadata(Symbols.middlewares, m, target);
		} else {
			const m = Reflect.getMetadata(Symbols.middlewares, target, propertyKey!) ?? [];
			m.push(...middlewares);
			Reflect.defineMetadata(Symbols.middlewares, m, target, propertyKey!);
		}
	};
};

export abstract class Middleware {
	public onAfterHandle(ctx: Context): any {}

	public onBeforeHandle(ctx: Context): any {}

	public onAfterResponse(ctx: Context): any {}
}
