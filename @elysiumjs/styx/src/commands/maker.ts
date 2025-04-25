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

import { Command, CommandArgumentType } from '@elysiumjs/core';

/**
 * Maker is a base class for all makers.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export abstract class Maker extends Command {
	public static readonly command: string = 'make';
	public static readonly description: string = 'Creates a new Elysium item';

	@Command.arg({
		description: 'The name of the item to create',
		type: CommandArgumentType.STRING
	})
	protected name?: string;

	@Command.arg({
		description: 'The module where the item will be created',
		type: CommandArgumentType.STRING
	})
	protected module?: string;
}
