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

import type { Context } from '@elysiumjs/core';
import type { CerberusConfig } from './utils';

import { defineAbility } from '@casl/ability';
import { Application, Middleware } from '@elysiumjs/core';

export class CerberusMiddleware extends Middleware {
	public async onBeforeHandle(ctx: Context) {
		const config = Application.instance.getConfig<CerberusConfig>('elysium:cerberus');
		if (config === null) {
			throw ctx.error(500, 'Cerberus middleware is not configured');
		}

		const subject = await config.getSubject(ctx);

		if (config.defineAbility) {
			ctx['elysium:cerberus'] = await config.defineAbility(subject, defineAbility);
			return;
		}

		const abilities = await config.getAbilities(ctx);

		ctx['elysium:cerberus'] = defineAbility((can) => {
			for (const ability of abilities) {
				can(ability.action, ability.resource);
			}
		});
	}
}
