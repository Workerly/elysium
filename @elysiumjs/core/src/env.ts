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

import type { AppEnv } from '@elysiumjs/core';

const env: Map<string, unknown> = new Map();

/**
 * Initializes the environment variables.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param vars The environment variables to initialize.
 */
export const initEnv = (vars: Record<string, unknown>) => {
	for (const [key, value] of Object.entries(vars)) {
		env.set(key, value);
	}
};

export namespace Env {
	/**
	 * Gets the value of an environment variable.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param name The name of the environment variable.
	 * @returns The value of the environment variable.
	 */
	export const get = <TKey extends keyof AppEnv, TValue = AppEnv[TKey]>(name: TKey): TValue => {
		return env.get(name) as TValue;
	};

	/**
	 * Checks if an environment variable exists.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param name The name of the environment variable.
	 * @returns `true` if the environment variable exists, `false` otherwise.
	 */
	export const exists = <TKey extends keyof AppEnv>(name: TKey): boolean => {
		return env.has(name);
	};
}
