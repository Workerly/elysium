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

import type { JobStatusInfo, Transport, TransportEvent } from '../transport';

import { InteractsWithConsole } from '@elysiumjs/core';

import { JobStatus } from '../job';
import { TransportMode } from '../transport';

/**
 * Manages a Bun Worker as a "thread" channel (producer driven).
 */
export class ThreadTransport extends InteractsWithConsole implements Transport {
	private worker: Worker | null = null;
	private workerReady = false;
	private messageHandlers: Array<(message: TransportEvent) => void> = [];
	private workerScript = './src/workers/thread.worker.ts'; // Path to ThreadWorker
	// No local cache needed since Queue already manages job statuses
	private registeredWorkers: Map<string, Set<string>> = new Map(); // workerId -> Set of queues
	private options: Record<string, any>;

	constructor(
		private readonly mode: TransportMode,
		options: Record<string, any> = {}
	) {
		super();

		this.options = options;
		this.workerScript = ELYSIUM_BUILD
			? './thread.worker.js'
			: this.options.workerScript || __dirname + '/../workers/thread.worker.ts';
	}

	async start(): Promise<void> {
		if (this.worker) return; // Already started

		this.debug(`Starting ThreadTransport with worker script: ${this.workerScript}`);
		this.worker = new Worker(this.workerScript);

		// Thread ready flag
		this.worker.addEventListener('open', () => {
			this.workerReady = true;
			this.debug('ThreadTransport worker ready');
		});

		// Message event listener for handling responses
		this.worker.addEventListener('message', (event: MessageEvent) => {
			const message = event.data as TransportEvent;

			// Handle specific message types
			if (message.type === 'job:status' || message.type === 'job:result') {
				this.handleStatusMessage(message);
			} else if (message.type === 'worker:register' || message.type === 'worker:unregister') {
				this.updateWorkerRegistration(message);
			}

			// Forward message to all handlers
			for (const handler of this.messageHandlers) {
				try {
					handler(message);
				} catch (error) {
					this.error(`Error in message handler: ${error}`);
				}
			}
		});

		// Handle worker errors
		this.worker.addEventListener('error', (event) => {
			this.error(`Worker error: ${event}`);
		});
	}

	/**
	 * Process job status messages
	 * This method is called when a job status message is received from a worker thread
	 * The message is then forwarded to the Queue via the message handlers
	 */
	private handleStatusMessage(message: TransportEvent): void {
		// Simply forward the message to handlers (Queue will store the status)
		this.debug(
			`Received status update for job ${(message as any).jobId}: ${(message as any).status}`
		);
	}

	/**
	 * Update worker registration information
	 */
	private updateWorkerRegistration(message: TransportEvent): void {
		if (message.type === 'worker:register' && message.queues) {
			const queues = new Set(message.queues);
			this.registeredWorkers.set(message.workerId, queues);
			this.debug(`Worker ${message.workerId} registered for queues: ${message.queues.join(', ')}`);
		} else if (message.type === 'worker:unregister') {
			this.registeredWorkers.delete(message.workerId);
			this.debug(`Worker ${message.workerId} unregistered`);
		}
	}

	async stop(): Promise<void> {
		if (this.worker) {
			this.debug('Stopping ThreadTransport worker');

			try {
				// Send terminate message to gracefully shut down
				await this.send({
					type: 'worker:unregister',
					workerId: 'main'
				});

				// Wait a moment to allow graceful shutdown
				await new Promise((resolve) => setTimeout(resolve, 100));

				// Force terminate if still running
				this.worker.terminate();
			} catch (error) {
				this.error(`Error stopping ThreadTransport: ${error}`);
			} finally {
				this.worker = null;
				this.workerReady = false;
				this.messageHandlers = [];
				this.debug('ThreadTransport stopped');
			}
		}
	}

	async send(message: TransportEvent): Promise<void> {
		if (!this.worker) {
			this.debug('Starting worker before sending message');
			await this.start();
		}

		// Ensure worker is ready
		if (!this.workerReady) {
			this.debug('Waiting for worker to be ready');
			await new Promise((resolve) =>
				this.worker!.addEventListener('open', () => resolve(undefined), { once: true })
			);
		}

		try {
			this.debug(`Sending ${message.type} message to worker`);
			this.worker!.postMessage(message);
		} catch (error) {
			this.error(`Error sending message to worker: ${error}`);
			throw new Error(`Failed to send message: ${error}`);
		}
	}

	/**
	 * Register a callback to handle messages from the transport
	 */
	onMessage(handler: (message: TransportEvent) => void): void {
		this.messageHandlers.push(handler);
	}

	/**
	 * Updates the status of a job directly
	 * @param jobId The ID of the job to update
	 * @param queueName The name of the queue the job is in
	 * @param updates The updates to apply to the job status
	 */
	async updateJobStatus(
		jobId: string,
		dispatchId: string,
		queueName: string,
		updates: Partial<JobStatusInfo>
	): Promise<void> {
		// Get the current timestamp for all updates
		const now = Date.now().toString();
		const statusValue = updates.status || 'unknown';

		// Determine if this is a terminal status that should use job:result type
		const isTerminalStatus =
			statusValue === JobStatus.COMPLETED ||
			statusValue === JobStatus.FAILED ||
			statusValue === JobStatus.CANCELLED;

		// Create the message with the appropriate type
		const messageType = isTerminalStatus ? 'job:result' : 'job:status';
		const message = {
			type: messageType,
			jobId,
			queue: queueName,
			status: statusValue,
			error: updates.error,
			retries: updates.retries || 0,
			startedAt: updates.startedAt,
			completedAt: updates.completedAt || (isTerminalStatus ? now : undefined),
			updatedAt: updates.updatedAt || now
		};

		if (this.mode === TransportMode.PRODUCER) {
			// In producer mode, forward the status update to the worker thread
			await this.send(message as TransportEvent);
			this.debug(
				`[Producer] Sent ${messageType} for job ${jobId} to worker thread: ${statusValue}`
			);
		} else {
			// In consumer mode, we're in the worker thread, so send message to main thread
			if (typeof self !== 'undefined') {
				// @ts-ignore - self is available in worker threads
				self.postMessage(message);
				this.debug(
					`[Consumer] Sent ${messageType} for job ${jobId} to main thread: ${statusValue}`
				);
			} else {
				this.warning(`Unable to send job status update: not in a worker context`);
			}
		}
	}

	/**
	 * Get the current status of a job
	 */
	async getJobStatus(jobId: string, dispatchId: string, queueName: string): Promise<JobStatusInfo> {
		try {
			// Request status from worker
			await this.send({
				type: 'job:status',
				jobId,
				dispatchId,
				queue: queueName,
				status: 'unknown'
			});

			// Since we don't maintain a local cache, we'll return a pending status
			// The Queue will receive the actual status via the message handler when the worker responds
			return {
				jobId,
				dispatchId,
				queue: queueName,
				status: 'unknown',
				retries: 0,
				createdAt: new Date().toISOString()
			};
		} catch (error) {
			this.error(`Error getting job status for ${jobId}: ${error}`);
			// Return a basic status object on error
			return {
				jobId,
				dispatchId,
				queue: queueName,
				status: 'unknown',
				retries: 0,
				createdAt: new Date().toISOString(),
				error: `Failed to get status: ${error}`
			};
		}
	}

	/**
	 * Register a worker with the transport
	 */
	async registerWorker(workerId: string, queues: string[]): Promise<void> {
		await this.send({
			type: 'worker:register',
			workerId,
			queues
		});

		// Store locally too
		this.registeredWorkers.set(workerId, new Set(queues));
	}

	/**
	 * Unregister a worker from the transport
	 */
	async unregisterWorker(workerId: string): Promise<void> {
		await this.send({
			type: 'worker:unregister',
			workerId
		});

		// Remove from local storage
		this.registeredWorkers.delete(workerId);
	}
}
