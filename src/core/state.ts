import 'reflect-metadata';

import { Symbols } from './utils';

/**
 * Marks a module or app property as a state variable.
 * @author Axel Nana <axel.nana@workbud.com>
 *
 * If registered on a module class, the state variable will be available in every handler of each controller
 * registered in this module.
 *
 * If registered on an app class, the state variable will be available on every request handlers of the app.
 *
 * @param name An optional name for the state variable. If not set the property name is used.
 */
export const asState = (name?: string): PropertyDecorator => {
	return function (target, propertyKey) {
		const states: Array<string> = Reflect.getMetadata(Symbols.states, target) ?? [];

		states.push(name ?? (propertyKey as string));

		Reflect.defineMetadata(Symbols.states, states, target);
	};
};

/**
 * Resolves a state variable from the app or module.
 * @author Axel Nana <axel.nana@workbud.com>
 *
 * @param name An optional name for the state variable. If not set, the name of the parameter is used to resolve
 * the state variable.
 */
export const state = (name?: string): ParameterDecorator => {
	return function (target, propertyKey, parameterIndex) {
		Reflect.defineMetadata(
			Symbols.state,
			{ name: name ?? propertyKey, index: parameterIndex },
			target,
			propertyKey!
		);
	};
};
