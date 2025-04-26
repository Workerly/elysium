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

import type { WriteStream } from 'node:tty';

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
	[ConsoleFormat.BLACK]: Bun.color('black', 'ansi') || Bun.color('black', 'ansi-256') || '',
	[ConsoleFormat.RED]: Bun.color('red', 'ansi') || Bun.color('red', 'ansi-256') || '',
	[ConsoleFormat.GREEN]: Bun.color('green', 'ansi') || Bun.color('green', 'ansi-256') || '',
	[ConsoleFormat.YELLOW]: Bun.color('yellow', 'ansi') || Bun.color('yellow', 'ansi-256') || '',
	[ConsoleFormat.BLUE]: Bun.color('blue', 'ansi') || Bun.color('blue', 'ansi-256') || '',
	[ConsoleFormat.MAGENTA]: Bun.color('magenta', 'ansi') || Bun.color('magenta', 'ansi-256') || '',
	[ConsoleFormat.CYAN]: Bun.color('cyan', 'ansi') || Bun.color('cyan', 'ansi-256') || '',
	[ConsoleFormat.WHITE]: Bun.color('white', 'ansi') || Bun.color('white', 'ansi-256') || '',
	[ConsoleFormat.GRAY]: Bun.color('gray', 'ansi') || Bun.color('gray', 'ansi-256') || '',
	[ConsoleFormat.BOLD]: '\x1b[1m',
	[ConsoleFormat.UNDERLINE]: '\x1b[4m',
	[ConsoleFormat.ITALIC]: '\x1b[3m',
	[ConsoleFormat.INVERSE]: '\x1b[7m'
};

/**
 * A utility class for console IO with various formatting options.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export class Console {
	protected static readonly SPACE_WIDTH = 60;

	/**
	 * Write a message to the console.
	 * @param message The message to write.
	 * @param newLine Whether to add a newline at the end (default: `true`).
	 * @param out The output stream to write to (default: `process.stdout`).
	 */
	public write(message: string, newLine: boolean = true, out: WriteStream = process.stdout): void {
		out.write(message + (newLine ? '\n' : ''));
	}

	/**
	 * Write a new line to the console.
	 */
	public newLine(): void {
		this.write('\n', false);
	}

	/**
	 * Write an info message to the console (blue text).
	 * @param message The message to write.
	 */
	public info(message: string): void {
		this.write(`ℹ️ ${message}`);
	}

	/**
	 * Write a success message to the console (green text).
	 * @param message The message to write.
	 */
	public success(message: string): void {
		this.write(`✅ ${message}`);
	}

	/**
	 * Write a warning message to the console (yellow text).
	 * @param message The message to write.
	 */
	public warning(message: string): void {
		this.write(`⚠️ ${message}`);
	}

	/**
	 * Write an error message to the console (red text).
	 * @param message The message to write.
	 */
	public error(message: string): void {
		this.write(`❌ ${message}`, true, process.stderr);
	}

	/**
	 * Write a debug message to the console (gray text).
	 * Only shown if the DEBUG environment variable is set.
	 * @param message The message to write.
	 */
	public debug(message: string): void {
		if (process.env.DEBUG) {
			this.write(`🔍 ${message}`);
		}
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
		process.stdout.moveCursor(x, y);
	}

	/**
	 * Clear the current line in the console.
	 */
	public clearLine(): void {
		process.stdout.clearLine(0);
		process.stdout.cursorTo(0);
	}

	/**
	 * Format a time value in seconds to a human-readable string.
	 * @param seconds The time value in seconds.
	 * @returns A formatted time string.
	 */
	protected formatTime(seconds: number): string {
		if (seconds < 60) return `${seconds.toFixed(1)}s`;
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
		return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
	}
	/**
	 * Start a spinner in the console.
	 * @param title Optional title for the spinner.
	 * @param frames Optional custom frames for the spinner animation.
	 * @param frameDelay Optional delay between frames in milliseconds.
	 */
	public spinner(
		title: string = 'Processing',
		frames?: string[],
		frameDelay?: number
	): CommandSpinner {
		return new CommandSpinner(title, frames, frameDelay);
	}
}

export class CommandSpinner extends Console {
	/**
	 * Whether the spinner is currently active.
	 */
	#active: boolean = false;

	/**
	 * The title for the spinner.
	 */
	#title: string = '';

	/**
	 * The start time of the spinner.
	 */
	#startTime: number = 0;

	/**
	 * The interval ID for the spinner animation.
	 */
	#intervalId: Timer | null = null;

	/**
	 * The current frame of the spinner.
	 */
	#currentFrame: number = 0;

	/**
	 * The custom frames for the spinner animation.
	 */
	readonly #frames: string[] = [
		'🕐',
		'🕑',
		'🕒',
		'🕓',
		'🕔',
		'🕕',
		'🕖',
		'🕗',
		'🕘',
		'🕙',
		'🕚',
		'🕛'
	];

	/**
	 * The delay between frames in milliseconds.
	 */
	readonly #frameDelay: number = 80; // milliseconds between frames

	/**
	 * Create a new spinner instance.
	 * @param title Optional title for the spinner.
	 * @param frames Optional custom frames for the spinner animation.
	 * @param frameDelay Optional delay between frames in milliseconds.
	 */
	constructor(title: string = 'Processing', frames?: string[], frameDelay?: number) {
		super();

		this.#title = title;
		if (frames) this.#frames = frames;
		if (frameDelay) this.#frameDelay = frameDelay;

		if (this.#active) return;

		this.#active = true;
		this.#startTime = Date.now();
		this.#currentFrame = 0;

		// Start the animation
		this.#intervalId = setInterval(() => {
			this.render();
		}, this.#frameDelay);

		// Initial render
		this.render();
	}

	/**
	 * Update the spinner with a new title.
	 * @param newTitle New title for the spinner.
	 */
	public update(newTitle: string): void {
		if (!this.#active) return;
		this.#title = newTitle;
	}

	/**
	 * Complete the spinner and reset its state.
	 * @param message Optional completion message to display.
	 * @param success Whether the operation was successful (affects the symbol shown).
	 */
	public complete(message?: string, success: boolean = true): void {
		if (!this.#active) return;

		// Stop the animation
		if (this.#intervalId) {
			clearInterval(this.#intervalId);
			this.#intervalId = null;
		}

		// Calculate elapsed time
		const elapsedMs = Date.now() - this.#startTime;
		const elapsedSec = elapsedMs / 1000;

		// Clear the current line
		this.clearLine();

		// Determine completion symbol
		const time = this.formatTime(elapsedSec);

		// Write the completion message
		if (message) {
			this[success ? 'success' : 'error'](`${message} (${time})`);
		} else {
			this[success ? 'success' : 'error'](`${this.#title} completed in ${time}`);
		}

		// Reset spinner state
		this.#active = false;
	}

	/**
	 * Fail the spinner and reset its state.
	 * @param message Optional failure message to display.
	 */
	public fail(message?: string): void {
		this.complete(message, false);
	}

	/**
	 * Pause the spinner temporarily to display a message.
	 * @param message The message to display.
	 */
	public pause(message: string): void {
		if (!this.#active) return;

		// Temporarily stop the animation
		if (this.#intervalId) {
			clearInterval(this.#intervalId);
			this.#intervalId = null;
		}

		// Clear the current line
		this.clearLine();

		// Display the message
		this.write(message);

		// Restart the animation
		this.#intervalId = setInterval(() => {
			this.render();
		}, this.#frameDelay);
	}

	/**
	 * Check if the spinner is currently active.
	 * @returns True if the spinner is active, false otherwise.
	 */
	public isActive(): boolean {
		return this.#active;
	}

	/**
	 * Get the elapsed time since the spinner started.
	 * @returns The elapsed time in seconds.
	 */
	public getElapsedTime(): number {
		return (Date.now() - this.#startTime) / 1000;
	}

	/**
	 * Render the current frame of the spinner.
	 */
	private render(): void {
		if (!this.#active) return;

		// Calculate elapsed time
		const elapsedSec = this.getElapsedTime();

		// Get the current frame
		const frame = this.#frames[this.#currentFrame];

		// Increment frame counter
		this.#currentFrame = (this.#currentFrame + 1) % this.#frames.length;

		// Clear the current line
		this.clearLine();

		// Write the spinner frame and title
		this.write(`${frame} ${this.#title} (${this.formatTime(elapsedSec)})`, false);
	}
}
