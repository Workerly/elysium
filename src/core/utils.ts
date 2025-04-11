import type { Elysia } from 'elysia';

export type Route = `/${string}`;

export namespace Symbols {
	export const modules = Symbol('modules');

	export const controllers = Symbol('controllers');

	export const controller = Symbol('controller');

	export const middlewares = Symbol('middlewares');

	export const services = Symbol('services');

	export const states = Symbol('states');

	export const state = Symbol('state');

	export const macros = Symbol('macros');

	export const macro = Symbol('macro');

	export const websocket = Symbol('websocket');

	export const wamp = Symbol('wamp');

	export const elysiaPlugin = Symbol('elysia:plugin');
}

export const nextTick = () => new Promise((resolve) => process.nextTick(resolve));

export enum Scope {
	SINGLETON,
	FACTORY
}

export type ElysiaPlugin = () => Promise<Elysia>;
