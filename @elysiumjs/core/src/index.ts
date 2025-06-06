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

import type { SingletonBase } from 'elysia';

import './macros';

export { type Elysia, type TSchema, type Static, t } from 'elysia';
export { type AppContext, type ElysiumPlugin, Application } from './app';
export { Cache } from './cache';
export {
	type CommandArgumentProps,
	type CommandClass,
	Command,
	CommandArgumentType
} from './command';
export { ConsoleFormat, InteractsWithConsole } from './console';
export { Database } from './database';
export { Env } from './env';
export { type EventData, type EventHandler, Event } from './event';
export { type Context, type Route, HttpControllerScope, Http } from './http';
export { Job } from './job';
export { Middleware } from './middleware';
export { type ModelClass, Model, Tenancy } from './model';
export { type ModuleClass, Module } from './module';
export { Redis } from './redis';
export {
	type IdType,
	type RepositoryInterface,
	type RepositoryClass,
	Repository
} from './repository';
export { ServiceScope, Service } from './service';
export {
	type WampRegistrationOptions,
	type WampSubscriptionOptions,
	type WampProps,
	type WampRegistrationHandlerArgs,
	type WampSubscriptionHandlerArgs,
	type WampRegistrationHandler,
	type WampSubscriptionHandler,
	Wamp
} from './wamp';
export { type WS, type WSError, Websocket } from './websocket';
export { type QueueOptions, WorkerPool, Worker } from './worker';

/**
 * The type for the context of the application.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export interface AppHttpContext extends SingletonBase {}

/**
 * The type for all registered environment variables.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export interface AppEnv {
	[key: string]: string;
}
