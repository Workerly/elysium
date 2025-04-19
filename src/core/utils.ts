import type { Elysia } from 'elysia';

export namespace Symbols {
	export const app = Symbol('app');

	export const controller = Symbol('controller');

	export const middlewares = Symbol('middlewares');

	export const services = Symbol('services');

	export const websocket = Symbol('websocket');

	export const wamp = Symbol('wamp');

	export const http = Symbol('http');

	export const job = Symbol('job');

	export const elysiaPlugin = Symbol('elysia:plugin');
}

export const nextTick = () => new Promise((resolve) => process.nextTick(resolve));

export type ElysiaPlugin = () => Promise<Elysia>;
