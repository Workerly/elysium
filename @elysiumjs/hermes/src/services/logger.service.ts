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

import type { Logger } from 'pino';

import { Service, ServiceScope } from '@elysiumjs/core';
import pino from 'pino';

@Service.register({ scope: ServiceScope.SINGLETON })
export class LoggerService {
	readonly #pino: Logger;

	public constructor(@Service.inject('elysium.hermes.pino') pino: pino.Logger) {
		this.#pino = pino;
	}

	public static make(name: string) {
		return new LoggerService(pino({ name }));
	}

	public info(message: string, details?: Record<string, unknown>) {
		if (details) {
			this.#pino.info(details, message);
		} else {
			this.#pino.info(message);
		}
	}

	public error(message: string, details?: Record<string, unknown>) {
		if (details) {
			this.#pino.error(details, message);
		} else {
			this.#pino.error(message);
		}
	}

	public warn(message: string, details?: Record<string, unknown>) {
		if (details) {
			this.#pino.error(details, message);
		} else {
			this.#pino.warn(message);
		}
	}

	public debug(message: string, details?: Record<string, unknown>) {
		if (details) {
			this.#pino.error(details, message);
		} else {
			this.#pino.debug(message);
		}
	}
}
