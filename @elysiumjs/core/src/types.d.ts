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

declare namespace globalThis {
	/**
	 * A macro indicating if the code is running from a build.
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	var ELYSIUM_BUILD: boolean;
}

declare module '@elysiumjs/core' {
	/**
	 * The type for all registered environment variables.
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	type AppEnv = Record<string, unknown>;

	/**
	 * The type for the context of the application.
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	type AppHttpContext = import('elysia').SingletonBase;
}
