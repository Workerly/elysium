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

import { resolve } from 'node:path';

/**
 * Describes the Elysium project's configuration.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export interface ProjectConfig {
	/**
	 * The name of the Elysium project.
	 */
	projectName: string;

	/**
	 * Whether the Elysium project is a mono module.
	 */
	mono: boolean;

	/**
	 * A map of module names to their paths.
	 *
	 * Only used if the Elysium project is not a mono module.
	 */
	modules?: Record<string, string>;
}

/**
 * Parses the Elysium project's configuration file.
 * @author Axel Nana <axel.nana@workbud.com>
 * @throws If the Elysium config file is not found.
 * @returns The Elysium project's configuration.
 */
export const parseProjectConfig = async (): Promise<ProjectConfig> => {
	const config = Bun.file(resolve('.elysiumrc'));
	if (!config.exists()) {
		throw new Error('Elysium config file not found.');
	}

	return JSON.parse(await config.text());
};

/**
 * Writes the Elysium project's configuration file.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param config The Elysium project's configuration.
 */
export const writeProjectConfig = async (config: ProjectConfig) => {
	const file = Bun.file(resolve('.elysiumrc'));
	await file.write(JSON.stringify(config, null, 2));
};

/**
 * Checks if the Elysium project is a mono-module project.
 * @author Axel Nana <axel.nana@workbud.com>
 * @returns Whether the Elysium project is a mono module.
 */
export const isMonoModule = async () => {
	const config = await parseProjectConfig();
	return config.mono;
};

/**
 * Gets the path of a module.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param moduleName The name of the module.
 * @returns The path of the module.
 */
export const getModulePath = async (moduleName: string) => {
	const config = await parseProjectConfig();
	if (config.mono) {
		return './src';
	}

	return config.modules![moduleName];
};

/**
 * Checks if a module exists.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param moduleName The name of the module.
 * @returns Whether the module exists.
 */
export const moduleExists = async (moduleName: string) => {
	const path = await getModulePath(moduleName);
	return Bun.file(path).exists();
};
