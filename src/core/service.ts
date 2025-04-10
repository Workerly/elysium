import 'reflect-metadata';

import type { Class } from 'type-fest';

import { isString } from 'radash';

import { Scope, Symbols } from './utils';

/**
 * A generic service class.
 * @author Axel Nana <axel.nana@workbud.com>
 */
type ServiceClass = Class<any>;

/**
 * A typed service class.
 * @author Axel Nana <axel.nana@workbud.com>
 */
type TypedServiceClass<T> = Class<T>;

/**
 * Describes metadata for each registered service.
 * @author Axel Nana <axel.nana@workbud.com>
 */
type ServiceRegistration = {
	/**
	 * The service's scope.
	 */
	scope: Scope;

	/**
	 * A factory function that create the service.
	 *
	 * When `scope` is set to `Scope.SINGLETON`, this function always return the
	 * same instance.
	 *
	 * @returns An instance to the service.
	 */
	factory: () => any;
};

/**
 * Describes the metadata stored for each injected services.
 * @author Axel Nana <axel.nana@workbud.com>
 */
type InjectedService = {
	/**
	 * The name of the injected service. It should match the one used when
	 * registering the service.
	 */
	name: string;

	/**
	 * The index in the constructor where the service is injected.
	 */
	index: number;
};

/**
 * Properties required when declaring a service using the `@service()` decorator.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type ServiceProps = Partial<{
	/**
	 * The name of the service. If not set, it will default to the service class name.
	 */
	name: string;

	/**
	 * The service's scope.
	 *
	 * Set it to `Scope.SINGLETON` to ensure that only one instance of this service is
	 * used everywhere it is injected or retrieved.
	 *
	 * Set it to `Scope.FACTORY` to ensure that everytime you inject or retrieve this
	 * service, you have a new instace created.
	 *
	 * @see Scope
	 */
	scope: Scope;
}>;

/**
 * Storage for registered services.
 * @author Axel Nana <axel.nana@workbud.com>
 */
const servicesRegistry = new Map<string, ServiceRegistration>();

/**
 * Marks a class as a service
 * @author Axel Nana <axel.nana@workbud.com>
 * @param options The decorator options.
 */
export const service = (options?: ServiceProps) => {
	return function (target: ServiceClass) {
		const name = options?.name ?? target.name;
		const scope = options?.scope ?? Scope.SINGLETON;

		if (servicesRegistry.has(name)) {
			// TODO: Use the logger service here
			console.error(`A service with the name ${name} has already been registered.`);
			process.exit(1);
		}

		const dependencies: Array<InjectedService> =
			Reflect.getMetadata(Symbols.services, target) ?? [];

		const params: any[] = [];
		dependencies.forEach((dependency) => {
			const s = get(dependency.name);

			if (s === null) {
				// TODO: Use the logger service here
				console.error(
					`Cannot inject a service. No service was registered with the name: ${dependency.name}`
				);
				process.exit(1);
			}

			params[dependency.index] = s;
		});

		const factory = () => new target(...params);

		if (scope === Scope.SINGLETON) {
			const service = factory();
			servicesRegistry.set(name, {
				scope,
				factory() {
					return service;
				}
			});
		} else {
			servicesRegistry.set(name, {
				scope,
				factory
			});
		}
	};
};

/**
 * Resolves a registered service and set it as a parameter value.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param name An optional name for the service. If not set, the name of the parameter's type is used instead.
 */
export const inject = (name?: string): ParameterDecorator => {
	return function (target, propertyKey, parameterIndex) {
		const services = Reflect.getMetadata(Symbols.services, target) ?? [];
		const types = Reflect.getMetadata('design:paramtypes', target) ?? [];

		services.push({
			name: name ?? types[parameterIndex].name,
			index: parameterIndex
		});

		Reflect.defineMetadata(Symbols.services, services, target);
	};
};

/**
 * Retrieves a registered service's instance.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param service The name of the service, or its class.
 * @returns An instance of the registred service, or `null` if no service with that name/type was registered.
 */
export const get = <T>(service: string | TypedServiceClass<T>): T | null => {
	const name = isString(service) ? service : service.name;

	if (servicesRegistry.has(name)) {
		const service = servicesRegistry.get(name)!;
		return service.factory() as T;
	}

	return null;
};
