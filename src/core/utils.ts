import type { Elysia } from 'elysia';

export type Route = `/${string}`;

export namespace Symbols {
	export const app = Symbol('app');

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

	export const http = Symbol('http');

	export const job = Symbol('job');

	export const elysiaPlugin = Symbol('elysia:plugin');
}

export const nextTick = () => new Promise((resolve) => process.nextTick(resolve));

export type ElysiaPlugin = () => Promise<Elysia>;
