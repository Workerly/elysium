import type { Class } from 'type-fest';

import { isString } from 'radash';

import { Symbols } from './utils';

/**
 * The scope of a service.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export enum ServiceScope {
	/**
	 * A single instance of the service is created and shared everywhere it is injected or retrieved.
	 */
	SINGLETON,

	/**
	 * A new instance of the service is created every time it is injected or retrieved.
	 */
	FACTORY
}

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
	scope: ServiceScope;

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
 * Type for a factory function.
 * @author Axel Nana <axel.nana@workbud.com>
 */
type FactoryFn<T> = () => T extends void ? never : T;

/**
 * Utility function to check if a value is a class.
 * @author Axel Nana <axel.nana@workbud.com>
 * @param value The value to check.
 * @returns `true` if the value is a class, `false` otherwise.
 */
const isClass = <T, V>(value: Class<T> | V): value is Class<T> => {
	return typeof value === 'function' && value.prototype && value.prototype.constructor === value;
};

/**
 * Storage for registered services.
 * @author Axel Nana <axel.nana@workbud.com>
 */
const servicesRegistry = new Map<string, ServiceRegistration>();

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
	 * Set it to `Scope.FACTORY` to ensure that every time you inject or retrieve this
	 * service, you have a new instance created.
	 *
	 * @see ServiceScope
	 */
	scope: ServiceScope;
}>;

/**
 * Marks a class as a service
 * @author Axel Nana <axel.nana@workbud.com>
 * @param options The decorator options.
 */
export const service = (options?: ServiceProps) => {
	return function (target: ServiceClass) {
		const name = options?.name ?? target.name;
		const scope = options?.scope ?? ServiceScope.SINGLETON;

		if (Service.exists(name)) {
			// TODO: Use the logger service here
			console.error(`A service with the name ${name} has already been registered.`);
			process.exit(1);
		}

		const factory = () => Service.make(target);

		if (scope === ServiceScope.SINGLETON) {
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
		const services = Reflect.getMetadata(Symbols.services, target, propertyKey!) ?? [];
		const types = Reflect.getMetadata('design:paramtypes', target, propertyKey!) ?? [];

		services.push({
			name: name ?? types[parameterIndex].name,
			index: parameterIndex
		});

		Reflect.defineMetadata(Symbols.services, services, target, propertyKey!);
	};
};

export namespace Service {
	/**
	 * Retrieves a registered service's instance from the container.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param service The name of the service, or its class.
	 * @returns An instance of the registered service, or `null` if no service with that name/type was registered.
	 */
	export const get = <T>(service: string | TypedServiceClass<T>): T | null => {
		const name = isString(service) ? service : service.name;

		if (exists(name)) {
			const service = servicesRegistry.get(name)!;
			return service.factory() as T;
		}

		return null;
	};

	/**
	 * Instantiates a service with its dependencies.
	 *
	 * This function always create a new instance of the service, even if the service's scope is `ServiceScope.SINGLETON`
	 * and it has already been registered in the container.
	 *
	 * @author Axel Nana <axel.nana@workbud.com>
	 *
	 * @param service The service class to instantiate.
	 */
	export const make = <T>(service: TypedServiceClass<T>): T => {
		const dependencies: Array<InjectedService> =
			Reflect.getMetadata(Symbols.services, service) ?? [];

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

		return new service(...params);
	};

	/**
	 * Binds a service to the container and sets it as a singleton.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param service The service class to bind.
	 * @param name An optional name for the service. If not set, the name of the service class is used instead.
	 */
	export const bind = <T>(service: TypedServiceClass<T>, name?: string): T => {
		const s = make(service);
		return instance(name ?? service.name, s);
	};

	/**
	 * Binds a service to the container and sets it as a factory.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param name A name for the service.
	 * @param factory The factory function used to instantiate the service.
	 */
	export function factory<T>(name: string, factory: FactoryFn<T>): T;

	/**
	 * Binds a service to the container and sets it as a factory.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param service The service class to bind.
	 * @param name An optional name for the service. If not set, the name of the service class is used instead.
	 */
	export function factory<T>(service: TypedServiceClass<T>, name?: string): T;

	/**
	 * Binds a service to the container and sets it as a factory.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param serviceOrName The service class to bind or its name.
	 * @param nameOrFactory The service name or a factory function.
	 */
	export function factory<T>(
		serviceOrName: TypedServiceClass<T> | string,
		nameOrFactory?: FactoryFn<T> | string
	): T {
		const serviceName = isString(serviceOrName)
			? serviceOrName
			: ((nameOrFactory as string | undefined) ?? serviceOrName.name);

		if (exists(serviceName)) {
			// TODO: Use the logger service here
			console.error(`A service with the name ${serviceName} has already been registered.`);
			process.exit(1);
		}

		const factory = () => {
			return isClass(serviceOrName) ? make(serviceOrName) : (nameOrFactory as FactoryFn<T>)();
		};

		servicesRegistry.set(serviceName, {
			scope: ServiceScope.FACTORY,
			factory
		});

		return factory();
	}

	/**
	 * Binds a service's instance to the container.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param service The service class or name to bind.
	 * @param instance The instance to bind.
	 */
	export const instance = <T>(service: string | TypedServiceClass<T>, instance: T): T => {
		const serviceName = isString(service) ? service : service.name;

		if (exists(serviceName)) {
			// TODO: Use the logger service here
			console.error(`A service with the name ${serviceName} has already been registered.`);
			process.exit(1);
		}

		servicesRegistry.set(serviceName, {
			scope: ServiceScope.SINGLETON,
			factory() {
				return instance;
			}
		});

		return instance;
	};

	/**
	 * Removes a service from the container.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param service The service class or name to remove.
	 */
	export const remove = (service: string | TypedServiceClass<any>): void => {
		const serviceName = isString(service) ? service : service.name;
		servicesRegistry.delete(serviceName);
	};

	/**
	 * Checks if a service exists in the container.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param service The service class or name to check.
	 * @returns `true` if the service exists, `false` otherwise.
	 */
	export const exists = (service: string | TypedServiceClass<any>): boolean => {
		const serviceName = isString(service) ? service : service.name;
		return servicesRegistry.has(serviceName);
	};

	/**
	 * Clears the container.
	 * @author Axel Nana <axel.nana@workbud.com>
	 */
	export const clear = () => {
		servicesRegistry.clear();
	};
}
