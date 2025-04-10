import 'reflect-metadata';

import { Symbols } from './utils';

/**
 * Describes the data needed when registering a macro.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type MacroRegristration = {
	/**
	 * The name of the macro.
	 */
	name: string;

	/**
	 * The function used to run the macro.
	 */
	func: Function;
};

/**
 * Marks a module or app method as a macro.
 * @author Axel Nana <axel.nana@workbud.com>
 *
 * If registered on a module class, the macro will be available in every handler of each controller
 * registered in this module.
 *
 * If registered on an app class, the macro will be available on every request handlers of the app.
 *
 * @param name An optional name for the macro. If not set the method name is used.
 */
export const asMacro = (name?: string): MethodDecorator => {
	return function (target, propertyKey, descriptor) {
		Reflect.defineMetadata(
			Symbols.macro,
			{
				name: name ?? (propertyKey as string),
				func: descriptor.value as Function
			} satisfies MacroRegristration,
			target,
			propertyKey!
		);
	};
};

/**
 * Resolves a macro from the app or module.
 * @author Axel Nana <axel.nana@workbud.com>
 *
 * @param name An optional name for the macro. If not set, the name of the parameter is used to resolve
 * the macro.
 */
export const macro = (name?: string): MethodDecorator => {
	return function (target, propertyKey, descriptor) {
		const macros: Array<string> = Reflect.getMetadata(Symbols.macros, target) ?? [];

		macros.push(name ?? (propertyKey as string));

		Reflect.defineMetadata(Symbols.macros, macros, target);
	};
};
