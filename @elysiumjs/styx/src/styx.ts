#!/usr/bin/env bun
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
import 'reflect-metadata';
import '@elysiumjs/core';

import {
	HeraclesCleanCommand,
	HeraclesListCommand,
	HeraclesWorkCommand,
	MakeCommandCommand,
	MakeControllerCommand,
	MakeJobCommand,
	MakeMiddlewareCommand,
	MakeModelCommand,
	MakeRepositoryCommand,
	MakeServiceCommand,
	MakeValidatorCommand,
	MigrationGenerateCommand,
	MigrationRunCommand,
	ModuleNewCommand,
	ModuleRenameCommand
} from './commands';
import { getProjectPath } from './utils';

const projectPath = getProjectPath();
const { App } = await import(`${projectPath}/src/app`);

@App.register({
	commands: [
		HeraclesCleanCommand,
		HeraclesListCommand,
		HeraclesWorkCommand,
		MakeCommandCommand,
		MakeControllerCommand,
		MakeJobCommand,
		MakeMiddlewareCommand,
		MakeModelCommand,
		MakeRepositoryCommand,
		MakeServiceCommand,
		MakeValidatorCommand,
		MigrationGenerateCommand,
		MigrationRunCommand,
		ModuleNewCommand,
		ModuleRenameCommand
	].filter((command) => (ELYSIUM_BUILD ? !command.dev : true))
})
class StyxApp extends App {}

new StyxApp();
