import type { WriteStream } from 'node:tty';

import * as readline from 'node:readline';

import { omit } from 'radash';

/**
 * ANSI color codes and styles for console output.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export enum ConsoleFormat {
	BLACK,
	RED,
	GREEN,
	YELLOW,
	BLUE,
	MAGENTA,
	CYAN,
	WHITE,
	GRAY,
	BOLD,
	UNDERLINE,
	ITALIC,
	INVERSE
}

/**
 * A map of console format codes to ANSI escape codes.
 * @author Axel Nana <axel.nana@workbud.com>
 */
const formatMap: Record<ConsoleFormat, string> = {
	[ConsoleFormat.BLACK]: Bun.color('black', 'ansi')!,
	[ConsoleFormat.RED]: Bun.color('red', 'ansi')!,
	[ConsoleFormat.GREEN]: Bun.color('green', 'ansi')!,
	[ConsoleFormat.YELLOW]: Bun.color('yellow', 'ansi')!,
	[ConsoleFormat.BLUE]: Bun.color('blue', 'ansi')!,
	[ConsoleFormat.MAGENTA]: Bun.color('magenta', 'ansi')!,
	[ConsoleFormat.CYAN]: Bun.color('cyan', 'ansi')!,
	[ConsoleFormat.WHITE]: Bun.color('white', 'ansi')!,
	[ConsoleFormat.GRAY]: Bun.color('gray', 'ansi')!,
	[ConsoleFormat.BOLD]: '\x1b[1m',
	[ConsoleFormat.UNDERLINE]: '\x1b[4m',
	[ConsoleFormat.ITALIC]: '\x1b[3m',
	[ConsoleFormat.INVERSE]: '\x1b[7m'
};

/**
 * A utility class for console IO with various formatting options.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export class InteractsWithConsole {
	protected static readonly SPACE_WIDTH = 60;

	/**
	 * Write a message to the console.
	 * @param message The message to write.
	 * @param newLine Whether to add a newline at the end (default: true).
	 */
	public write(message: string, newLine: boolean = true, out: WriteStream = process.stdout): void {
		out.write(message + (newLine ? '\n' : ''));
	}

	/**
	 * Write a new line to the console.
	 */
	public newLine(): void {
		this.write('');
	}

	/**
	 * Write an info message to the console (blue text).
	 * @param message The message to write.
	 */
	public info(message: string): void {
		this.write(`${this.format('ℹ', ConsoleFormat.BLUE)} ${message}`);
	}

	/**
	 * Write a success message to the console (green text).
	 * @param message The message to write.
	 */
	public success(message: string): void {
		this.write(`${this.format('✓', ConsoleFormat.GREEN)} ${message}`);
	}

	/**
	 * Write a warning message to the console (yellow text).
	 * @param message The message to write.
	 */
	public warning(message: string): void {
		this.write(`${this.format('⚠', ConsoleFormat.YELLOW)} ${message}`);
	}

	/**
	 * Write an error message to the console (red text).
	 * @param message The message to write.
	 */
	public error(message: string): void {
		this.write(`${this.format('✗', ConsoleFormat.RED)} ${message}`, true, process.stderr);
	}

	/**
	 * Write a debug message to the console (gray text).
	 * Only shown if DEBUG environment variable is set.
	 * @param message The message to write.
	 */
	public debug(message: string): void {
		if (process.env.DEBUG) {
			this.write(`${this.format('🔍', ConsoleFormat.GRAY)} ${message}`);
		}
	}

	/**
	 * Display a JavaScript error in the console with its message, stack trace,
	 * and any additional relevant information.
	 * @param error The error to display.
	 * @param title Optional title to display before the error message (default: '').
	 */
	public trace(error: Error & Record<string, any>, title?: string): void {
		if (!error) return;

		// Determine standard error information
		const errorName = error.name || 'Error';
		const errorMessage = error.message || 'An error occurred';
		const errorStack = error.stack || '';

		// Display the title if provided
		if (title) {
			this.title(title);
		}

		// Display the error name and message in red
		this.write(this.format(`${errorName}: ${errorMessage}`, ConsoleFormat.RED));

		// Display the stack trace in gray, each line prefixed by a tab for readability
		this.write(this.format('Stack Trace:', ConsoleFormat.BOLD));
		this.write(
			this.format(
				errorStack
					.split('\n')
					.map((line) => `\t${line}`)
					.join('\n'),
				ConsoleFormat.GRAY
			)
		);

		// Display any other custom properties
		const customProps = omit(error, ['name', 'message', 'stack']);

		if (customProps.length > 0) {
			this.write(this.format('Additional Information:', ConsoleFormat.BOLD));
			Object.keys(customProps).forEach((prop) => {
				const value = error[prop];
				this.write(`\t${prop}: ${JSON.stringify(value)}`, false);
			});
		}
	}

	/**
	 * Write a title to the console (bold text with underline).
	 * @param title The title to write.
	 */
	public title(title: string): void {
		this.write('');
		this.write(`\x1b[1m\x1b[4m${title}\x1b[0m`);
		this.write('');
	}

	/**
	 * Write a section header to the console (bold text).
	 * @param header The section header to write.
	 */
	public section(header: string): void {
		this.write('');
		this.write(`\x1b[1m${header}\x1b[0m`);
	}

	/**
	 * Create a table from an array of objects and write it to the console.
	 * @param data The array of objects to display.
	 * @param columns Optional column configuration.
	 */
	public table<T extends Record<string, any>>(
		data: T[],
		columns?: {
			[K in keyof T]?: {
				header?: string;
				width?: number;
				format?: (value: T[K]) => string;
			};
		}
	): void {
		if (data.length === 0) {
			this.info('No data to display');
			return;
		}

		// Determine columns to display
		const keys = Object.keys(columns || data[0]) as (keyof T)[];

		// Calculate column widths
		const widths: Record<string, number> = {};
		for (const key of keys) {
			const columnConfig = columns?.[key];
			if (columnConfig?.width) {
				widths[key as string] = columnConfig.width;
				continue;
			}

			// Get header length
			const headerLength = (columnConfig?.header || String(key)).length;

			// Get max data length
			const maxDataLength = Math.max(
				...data.map((row) => {
					const value = row[key];
					if (columnConfig?.format) {
						return columnConfig.format(value).length;
					}
					return String(value === null || value === undefined ? '' : value).length;
				})
			);

			widths[key as string] = Math.max(headerLength, maxDataLength);
		}

		// Create header row
		let header = '';
		let separator = '';
		for (const key of keys) {
			const columnConfig = columns?.[key];
			const headerText = columnConfig?.header || String(key);
			const width = widths[key as string];

			header += `| ${headerText.padEnd(width)} `;
			separator += `| ${'-'.repeat(width)} `;
		}
		header += '|';
		separator += '|';

		this.write(header);
		this.write(separator);

		// Create data rows
		for (const row of data) {
			let line = '';
			for (const key of keys) {
				const columnConfig = columns?.[key];
				const width = widths[key as string];
				const value = row[key];

				let displayValue: string;
				if (columnConfig?.format) {
					displayValue = columnConfig.format(value);
				} else {
					displayValue = String(value === null || value === undefined ? '' : value);
				}

				line += `| ${displayValue.padEnd(width)} `;
			}
			line += '|';
			this.write(line);
		}

		this.write('');
	}

	/**
	 * Format text with multiple ANSI styles.
	 * @param text The text to format.
	 * @param styles The styles to apply.
	 * @returns The formatted text.
	 */
	public format(text: string, ...styles: ConsoleFormat[]): string {
		const styleCodes = styles.map((style) => formatMap[style]).join('');
		return `${styleCodes}${text}\x1b[0m`;
	}

	/**
	 * Format text as bold.
	 * @param text The text to format.
	 * @returns The formatted text.
	 */
	public bold(text: string): string {
		return this.format(text, ConsoleFormat.BOLD);
	}

	/**
	 * Format text as italic.
	 * @param text The text to format.
	 * @returns The formatted text.
	 */
	public italic(text: string): string {
		return this.format(text, ConsoleFormat.ITALIC);
	}

	/**
	 * Format text as underline.
	 * @param text The text to format.
	 * @returns The formatted text.
	 */
	public underline(text: string): string {
		return this.format(text, ConsoleFormat.UNDERLINE);
	}

	/**
	 * Clear the console screen.
	 */
	public clear(): void {
		process.stdout.write('\x1Bc');
	}

	/**
	 * Move the cursor to a specific position.
	 * @param x The x coordinate (column).
	 * @param y The y coordinate (row).
	 */
	public moveCursor(x: number, y: number): void {
		process.stdout.cursorTo(x, y);
	}

	/**
	 * Clear the current line in the console.
	 */
	public clearLine(): void {
		process.stdout.clearLine(0);
		process.stdout.cursorTo(0);
	}

	// User Input Methods

	/**
	 * Prompt the user for input.
	 * @param question The question to ask.
	 * @param defaultValue Optional default value.
	 * @returns The user's input.
	 */
	protected async prompt(question: string, defaultValue?: string): Promise<string> {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});

		const defaultText = defaultValue ? ` (default: ${defaultValue})` : '';

		return new Promise<string>((resolve) => {
			rl.question(`${question}${defaultText}: `, (answer) => {
				rl.close();
				resolve(answer || defaultValue || '');
			});
		});
	}

	/**
	 * Prompt the user for a password (input is hidden).
	 * @param question The question to ask.
	 * @returns The user's password.
	 */
	protected async promptPassword(question: string): Promise<string> {
		// Create readline interface
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});

		// Mute stdin echo
		process.stdin.setRawMode?.(true);

		return new Promise<string>((resolve) => {
			let password = '';

			// Write question
			process.stdout.write(`${question}: `);

			// Handle keypress events
			process.stdin.on('data', (data) => {
				const char = data.toString();

				// Check for Enter key (carriage return)
				if (char === '\r' || char === '\n') {
					process.stdout.write('\n');
					process.stdin.setRawMode?.(false);
					process.stdin.removeAllListeners('data');
					rl.close();
					resolve(password);
					return;
				}

				// Check for backspace
				if (char === '\b' || char === '\x7f') {
					if (password.length > 0) {
						password = password.slice(0, -1);
						process.stdout.write('\b \b'); // Erase character from terminal
					}
					return;
				}

				// Add character to password
				password += char;
				process.stdout.write('*'); // Show asterisk instead of actual character
			});
		});
	}

	/**
	 * Prompt the user for confirmation (yes/no).
	 * @param question The question to ask.
	 * @param defaultValue Optional default value (true for yes, false for no).
	 * @returns True if the user confirmed, false otherwise.
	 */
	protected async confirm(question: string, defaultValue: boolean = false): Promise<boolean> {
		const defaultText = defaultValue ? 'Y/n' : 'y/N';
		const answer = await this.prompt(`${question} [${defaultText}]`);

		if (!answer) {
			return defaultValue;
		}

		return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
	}

	/**
	 * Prompt the user to select from a list of options.
	 * @param question The question to ask.
	 * @param options The options to choose from.
	 * @param defaultIndex Optional default option index.
	 * @returns The selected option.
	 */
	protected async select<T extends string>(
		question: string,
		options: T[],
		defaultIndex: number = 0
	): Promise<T> {
		if (options.length === 0) {
			throw new Error('No options provided for selection');
		}

		// Display options
		this.write(question);
		options.forEach((option, index) => {
			const isDefault = index === defaultIndex;
			this.write(`  ${index + 1}. ${option}${isDefault ? ' (default)' : ''}`);
		});

		// Get user selection
		const selection = await this.prompt('Enter your choice (number)');

		// Parse selection
		if (!selection) {
			return options[defaultIndex];
		}

		const index = parseInt(selection, 10) - 1;
		if (isNaN(index) || index < 0 || index >= options.length) {
			this.warning(`Invalid selection. Using default: ${options[defaultIndex]}`);
			return options[defaultIndex];
		}

		return options[index];
	}
}
