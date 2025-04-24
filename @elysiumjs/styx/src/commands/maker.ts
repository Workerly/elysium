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

/**
 * Maker is a base class for all makers.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export abstract class Maker {
	private static readonly makers: Map<string, Maker> = new Map();

	protected constructor(protected readonly name: string) {
		Maker.register(`make:${this.name}`, this);
	}

	/**
	 * Registers a maker.
	 * @param name The name of the maker.
	 * @param maker The maker instance.
	 */
	public static register(name: string, maker: Maker) {
		this.makers.set(name, maker);
	}

	/**
	 * Gets a maker by name.
	 * @param name The name of the maker.
	 * @returns The maker instance.
	 */
	public static get(name: string) {
		return this.makers.get(name);
	}

	/**
	 * Gets a list of all makers.
	 * @returns A list of maker names.
	 */
	public static list() {
		return Array.from(this.makers.keys());
	}

	/**
	 * Runs the maker.
	 * @param args The arguments passed to the maker.
	 * @returns A promise that resolves when the maker is complete.
	 */
	public abstract run(args: string[]): Promise<boolean>;
}
