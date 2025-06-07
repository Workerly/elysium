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

import { Command } from '@elysiumjs/core';

/**
 * Base class for Styx commands.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export abstract class BaseCommand extends Command {
	/**
	 * Whether the command is only available in development mode.
	 * This means the command will not be bundled in the production build
	 * of the application (when using Hephaestus).
	 */
	public static readonly dev: boolean = true;
}
