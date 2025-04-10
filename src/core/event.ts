import { EventEmitter } from 'node:events';

/**
 * Internal event bus used by the framework.
 * @author Axel Nana <axel.nana@workbud.com>
 */
class EventBus extends EventEmitter {
	static readonly instance = new EventBus();

	private constructor() {
		super();
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

/**
 * Marks a method as an event listener.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param options The decorator options.
 */
export const on = (options: Omit<ListenProps, 'mode'>): MethodDecorator => {
	return function (target, propertyKey, descriptor) {
		const listener = async function (eventData: EventData<any>) {
			try {
				await (descriptor.value as EventHandler<any>)(eventData);
			} catch (e) {
				EventBus.instance.emit('elysium:error', { data: e, source: null });
			}
		};

		const prepend = options.prepend ?? false;
		if (prepend) {
			EventBus.instance.prependListener(options.event, listener);
		} else {
			EventBus.instance.on(options.event, listener);
		}
	};
};

/**
 * Marks a method as an event listener that listens for the event only once.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param options The decorator options.
 */
export const once = (options: Omit<ListenProps, 'mode'>): MethodDecorator => {
	return function (target, propertyKey, descriptor) {
		const prepend = options.prepend ?? false;
		if (prepend) {
			EventBus.instance.prependOnceListener(
				options.event,
				descriptor.value as EventHandler<any, typeof target>
			);
		} else {
			EventBus.instance.once(options.event, descriptor.value as EventHandler<any, typeof target>);
		}
	};
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

	return function (target, propertyKey, descriptor) {
		// TODO: Use logger service
		console.error("Unknown mode provided to @listen. Use either 'on' or 'once'.");
	};
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
		EventBus.instance.emit(event, {
			data,
			source
		} satisfies EventData<TData, TSource>);
	};

	/**
	 * Registers an event listener for the specified event.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param event The event name.
	 * @param handler The event handler function.
	 */
	export const on = <TData, TSource = any>(
		event: string,
		handler: EventHandler<TData, TSource>
	): void => {
		EventBus.instance.on(event, handler);
	};

	/**
	 * Removes all event listeners for the specified event.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param event The event name.
	 */
	export const off = (event: string): void => {
		EventBus.instance.removeAllListeners(event);
	};
}
