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

import { EventEmitter } from 'node:events';

import { isString } from 'radash';

/**
 * Internal event bus used by the framework.
 * @author Axel Nana <axel.nana@workbud.com>
 */
class EventBus extends EventEmitter {
	static readonly instance = new EventBus();

	private constructor() {
		super();
	}

	public emitError(error: unknown) {
		this.emit('elysium:error', { data: error, source: null });
	}

	public emitEvent(event: string, data: unknown, source: unknown = null) {
		this.emit(event, { data, source });
	}
}

/**
 * Stores the event data with the source.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type EventData<TData, TSource = null> = {
	/**
	 * The emitted data.
	 */
	data: TData;

	/**
	 * The source of the event.
	 */
	source: TSource | null;
};

/**
 * Event handler function.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type EventHandler<TData, TSource = any> = (
	event: EventData<TData, TSource>
) => void | Promise<void>;

/**
 * Properties required when declaring a method as an event listener.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type ListenProps = {
	/**
	 * The listener mode.
	 *
	 * Set it to `on` to listen for the event every time it is emitted.
	 * Set it to `once` to listen for the event only once.
	 */
	mode: 'on' | 'once';

	/**
	 * The event name.
	 */
	event: string;

	/**
	 * Whether to prepend the listener to the event. Defaults to `false`.
	 * @default false
	 */
	prepend?: boolean;
};

export namespace Event {
	/**
	 * Emits an event with the provided data and source.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param event The event name.
	 * @param data The emitted data.
	 * @param source The source of the event. Defaults to `null`.
	 */
	export const emit = <TData, TSource = any>(
		event: string,
		data: TData,
		source: TSource | null = null
	): void => {
		EventBus.instance.emitEvent(event, data, source);
	};

	/**
	 * Marks a method as an event listener.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param options The decorator options.
	 */
	export function on(options: Omit<ListenProps, 'mode'>): MethodDecorator;

	/**
	 * Registers an event listener for the specified event.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param event The event name.
	 * @param handler The event handler function.
	 */
	export function on<TData, TSource = any>(
		event: string,
		handler: EventHandler<TData, TSource>
	): void;

	export function on<TData, TSource = any>(
		event: string | Omit<ListenProps, 'mode'>,
		handler?: EventHandler<TData, TSource> | never
	): MethodDecorator | void {
		if (isString(event)) {
			EventBus.instance.on(event, handler!);
		} else {
			return function (_target, _propertyKey, descriptor) {
				const listener = async function (eventData: EventData<any>) {
					try {
						await (descriptor.value as EventHandler<any>)(eventData);
					} catch (e: unknown) {
						EventBus.instance.emitError(e);
					}
				};

				const prepend = event.prepend ?? false;
				if (prepend) {
					EventBus.instance.prependListener(event.event, listener);
				} else {
					EventBus.instance.on(event.event, listener);
				}
			};
		}
	}

	/**
	 * Marks a method as an event listener that listens for the event only once.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param options The decorator options.
	 */
	export function once(options: Omit<ListenProps, 'mode'>): MethodDecorator;

	/**
	 * Registers an event listener for the specified event that listens for the event only once.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param event The event name.
	 * @param handler The event handler function.
	 */
	export function once<TData, TSource = any>(
		event: string,
		handler: EventHandler<TData, TSource>
	): void;

	export function once<TData, TSource = any>(
		event: string | Omit<ListenProps, 'mode'>,
		handler?: EventHandler<TData, TSource> | never
	): MethodDecorator | void {
		if (isString(event)) {
			EventBus.instance.once(event, handler!);
		} else {
			return function (_target, _propertyKey, descriptor) {
				const listener = async function (eventData: EventData<any>) {
					try {
						await (descriptor.value as EventHandler<any>)(eventData);
					} catch (e: unknown) {
						EventBus.instance.emitError(e);
					}
				};

				const prepend = event.prepend ?? false;
				if (prepend) {
					EventBus.instance.prependOnceListener(event.event, listener);
				} else {
					EventBus.instance.once(event.event, listener);
				}
			};
		}
	}

	/**
	 * Removes all event listeners for the specified event.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param event The event name.
	 */
	export const off = (event: string): void => {
		EventBus.instance.removeAllListeners(event);
	};

	/**
	 * Removes all event listeners.
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	export const clear = () => {
		EventBus.instance.removeAllListeners();
	};

	/**
	 * Marks a method as an event listener.
	 * @param options The decorator options.
	 */
	export const listen = (options: ListenProps): MethodDecorator => {
		if (options.mode === 'on') {
			return on(options);
		} else if (options.mode === 'once') {
			return once(options);
		}

		return function (_target, _propertyKey, _descriptor) {
			// TODO: Use logger service
			console.error("Unknown mode provided to @listen. Use either 'on' or 'once'.");
		};
	};
}
