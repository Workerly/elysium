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
import { Maker } from './src/commands';

const command = Bun.argv[2];

if (command) {
	const action = command.split(':')[0];
	const args = Bun.argv.slice(3);

	switch (action) {
		case 'make': {
			const maker = Maker.get(command);
			if (!maker) {
				console.log('Unknown maker:', command);
				// TODO: Display list of available makers
				process.exit(1);
			}

			await maker.run(args);
			break;
		}
		default:
			console.log('Unknown command:', command);
			break;
	}
}

const { App } = await import(`${process.cwd()}/src/app`);

class StyxApp extends App {}

new StyxApp();
