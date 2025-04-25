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

import type { Elysia } from 'elysia';

import { isObject, isPrimitive } from 'radash';

export namespace Symbols {
	export const app = Symbol('app');

	export const controller = Symbol('controller');

	export const middlewares = Symbol('middlewares');

	export const services = Symbol('services');

	export const websocket = Symbol('websocket');

	export const wamp = Symbol('wamp');

	export const http = Symbol('http');

	export const job = Symbol('job');

	export const arg = Symbol('command:arguments');

	export const elysiaPlugin = Symbol('elysia:plugin');
}

export const nextTick = () => new Promise((resolve) => process.nextTick(resolve));

export type ElysiaPlugin = () => Promise<Elysia>;

/**
 * Deeply merges objects from right to left
 * Arrays are also merged if they are found in child objects
 *
 * @param target The target object to merge into
 * @param sources One or more source objects to merge from
 * @returns The merged object (same reference as target)
 */
export function deepMerge<T extends Record<string, any | any[]>>(target: T, ...sources: T[]): T {
	if (!sources.length) return target;

	const source = sources.shift();
	if (source === undefined) return target;

	if (isObject(target) && isObject(source)) {
		for (const key in source) {
			if (isObject(source[key])) {
				if (!target[key]) {
					Object.assign(target, { [key]: source[key] });
				}
			} else {
				if (Array.isArray(source[key])) {
					if (!Array.isArray(target[key])) {
						target[key] = [];
					}
					// Merge arrays by concatenating and removing duplicates for primitive values
					if (source[key].length > 0 && !isObject(source[key][0])) {
						target[key] = [...new Set([...target[key], ...source[key]])];
					} else {
						// For arrays of objects, merge each item
						source[key].forEach((item: any, index: number) => {
							if (isObject(item) && target[key][index]) {
								target[key][index] = deepMerge(target[key][index], item);
							} else {
								if (!target[key].includes(item)) {
									target[key].push(item);
								}
							}
						});
					}
				} else {
					deepMerge(target[key], source[key]);
				}
			}
		}
	}

	return deepMerge(target, ...sources);
}
