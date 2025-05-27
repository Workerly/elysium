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

import 'reflect-metadata';

import type { Class } from 'type-fest';
import type { Job } from '../job';
import type { TransportEvent } from '../transport';

import { Service } from '@elysiumjs/core';

import { WorkerStatus } from '../worker';
import { ThreadWorker } from './thread.worker';

// Define self for TypeScript
declare const self: Worker;

// Ensure we're in a worker context
if (typeof self === 'undefined') {
	throw new Error('This script must be run in a worker context');
}

// Log worker startup
console.log(`Heracles thread worker starting...`);

// Set a global worker reference
let worker: ThreadWorker | null = null;

// For storing pre-imported job classes
const jobClasses = new Map<string, Class<Job>>();

// Handle all messages from the main thread
self.addEventListener('message', async (event) => {
	try {
		// Process the message based on its type
		if (event.data && typeof event.data === 'object') {
			const message = event.data as TransportEvent;

			switch (message.type) {
				case 'worker:init': {
					// Initialize worker if not already initialized
					if (!worker) {
						const { queues = ['default'], options = {} } = message as any;

						console.log(`Initializing worker with queues: ${queues.join(', ')}`);

						// Initialize worker with provided queues
						worker = new ThreadWorker(queues);

						// Configure worker with options
						if (options.concurrency) {
							for (const queue of queues) {
								await worker.setConcurrency(queue, options.concurrency);
							}
						}

						// Store worker in global scope for debug purposes
						(self as any).__worker = worker;

						// Start the worker
						await worker.start();

						// Send ready message back to main thread
						self.postMessage({
							type: 'worker:ready',
							id: worker.id,
							queues: Array.from(worker.getInfo().queues),
							status: worker.status,
							timestamp: Date.now()
						});
					}
					break;
				}

				case 'job:process': {
					// Process a job
					if (!worker) {
						throw new Error('Worker not initialized');
					}

					// Handle the job processing
					const { job: jobName, args = [], queue = 'default', options } = message;
					await handleMessage(message);
					break;
				}

				default:
					// Other messages will be handled by the ThreadWorker itself
					if (worker) {
						await handleMessage(message);
					} else {
						console.warn(`Received message before worker initialization: ${message.type}`);

						// Try to handle initialization on the fly
						worker = new ThreadWorker(['default']);
						await worker.start();
						await handleMessage(message);
					}
					break;
			}
		}
	} catch (error) {
		console.error('Error handling message in worker thread:', error);

		// Report error to main thread
		self.postMessage({
			type: 'worker:error',
			error: error instanceof Error ? error.message : String(error),
			timestamp: Date.now()
		});
	}
});

/**
 * Handle a transport message
 */
async function handleMessage(message: TransportEvent): Promise<void> {
	if (!worker) {
		throw new Error('Worker not initialized');
	}

	// Forward the message to the worker instance for processing
	await worker.handleMessage(message);
}

// Send open message to main thread to indicate worker is ready for initialization
self.postMessage({ type: 'worker:open' });

// Handle uncaught errors
self.addEventListener('error', (event) => {
	console.error('Uncaught error in worker thread:', event.error || event.message);

	// Report error to main thread
	self.postMessage({
		type: 'worker:error',
		error: event.error?.message || event.message || 'Unknown error',
		timestamp: Date.now()
	});
});

// Handle unhandled promise rejections
self.addEventListener('unhandledrejection', (event) => {
	console.error('Unhandled rejection in worker thread:', event.reason);

	// Report error to main thread
	self.postMessage({
		type: 'worker:error',
		error: event.reason?.message || String(event.reason) || 'Unhandled promise rejection',
		timestamp: Date.now()
	});
});

// Initialize custom module loading if needed
if (typeof Bun !== 'undefined') {
	// Bun-specific initialization
	console.log('Running in Bun environment');
}

// Export ThreadWorker and other components for testing/debugging
export { ThreadWorker, WorkerStatus };
