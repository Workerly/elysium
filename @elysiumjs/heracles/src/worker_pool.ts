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

import type { Job, JobDispatchOptions } from './job';
import type { WorkerInfo } from './worker';

import { InteractsWithConsole } from '@elysiumjs/core';

/**
 * Interface for tracking worker selection state per queue.
 */
interface QueueWorkerState {
	/**
	 * All workers assigned to this queue
	 */
	workers: WorkerInfo[];

	/**
	 * Index of the last selected worker for round-robin
	 */
	lastWorkerIndex: number;
}

/**
 * WorkerPool manages a pool of workers and distributes jobs among them
 * using a round-robin algorithm.
 */
export class WorkerPool extends InteractsWithConsole {
	/**
	 * Singleton instance of the worker pool
	 */
	private static _instance: WorkerPool;

	/**
	 * All workers in the pool, indexed by worker ID
	 */
	private workers: Map<string, WorkerInfo> = new Map();

	/**
	 * Queue-to-workers mapping for tracking which workers handle each queue
	 */
	private queueWorkers: Map<string, QueueWorkerState> = new Map();

	/**
	 * Last used worker per queue for true round-robin
	 */
	private lastUsedWorker: Map<string, string> = new Map();

	/**
	 * Get the singleton instance of the worker pool
	 */
	public static get instance(): WorkerPool {
		if (!WorkerPool._instance) {
			WorkerPool._instance = new WorkerPool();
		}
		return WorkerPool._instance;
	}

	/**
	 * Private constructor to enforce singleton pattern
	 */
	private constructor() {
		super();
	}

	/**
	 * Initialize the worker pool
	 */
	public async init(): Promise<void> {
		this.info('WorkerPool initialized');
	}

	/**
	 * Add a worker to the pool and associate it with queues
	 *
	 * @param worker The worker information to add
	 * @param queues The queues this worker will handle
	 */
	public async addWorker(worker: WorkerInfo, queues: string[] = []): Promise<void> {
		if (this.workers.has(worker.id)) {
			this.warning(`Worker ${worker.id} is already registered in the pool`);
			return;
		}

		// Store the worker
		this.workers.set(worker.id, worker);

		// Associate worker with each queue
		for (const queueName of queues) {
			// Get or create queue state
			const queueState = this.getOrCreateQueueState(queueName);

			// Add worker to queue if not already present
			if (!queueState.workers.some((w) => w.id === worker.id)) {
				queueState.workers.push(worker);
				this.debug(`Worker ${worker.id} assigned to queue '${queueName}'`);
			}
		}

		this.info(`Worker ${worker.id} added to pool with ${queues.length} queues`);
	}

	/**
	 * Remove a worker from the pool
	 *
	 * @param workerId The ID of the worker to remove
	 */
	public async removeWorker(workerId: string): Promise<void> {
		const worker = this.workers.get(workerId);
		if (!worker) {
			this.warning(`Attempted to remove non-existent worker ${workerId}`);
			return;
		}

		// Remove worker from all queues
		for (const [queueName, queueState] of this.queueWorkers.entries()) {
			const workerIndex = queueState.workers.findIndex((w) => w.id === workerId);
			if (workerIndex >= 0) {
				queueState.workers.splice(workerIndex, 1);

				// Adjust lastWorkerIndex if needed
				if (queueState.lastWorkerIndex >= queueState.workers.length) {
					queueState.lastWorkerIndex = queueState.workers.length > 0 ? 0 : -1;
				}

				// Also adjust lastUsedWorker if it was this worker
				if (this.lastUsedWorker.get(queueName) === workerId) {
					this.lastUsedWorker.delete(queueName);
				}

				this.debug(`Worker ${workerId} removed from queue '${queueName}'`);
			}
		}

		// Remove worker from the pool
		this.workers.delete(workerId);
		this.info(`Worker ${workerId} removed from pool`);
	}

	/**
	 * Terminate all workers in the pool
	 */
	public async terminate(): Promise<void> {
		for (const workerId of this.workers.keys()) {
			await this.removeWorker(workerId);
		}

		this.info('WorkerPool terminated');
	}

	/**
	 * Get the next available worker for a queue using round-robin
	 *
	 * @param queueName The name of the queue to get a worker for
	 * @returns The selected worker info or null if none available
	 */
	public getNextWorker(queueName: string): WorkerInfo | null {
		const queueState = this.queueWorkers.get(queueName);
		if (!queueState || queueState.workers.length === 0) {
			this.warning(`No workers available for queue '${queueName}'`);
			return null;
		}

		// True round-robin selection that considers worker load
		// First, sort workers by number of active jobs (lightest load first)
		const sortedWorkers = [...queueState.workers].sort((a, b) => a.activeJobs - b.activeJobs);

		// If there's a big difference in load (e.g., more than 5 jobs), prefer the least loaded worker
		const leastLoaded = sortedWorkers[0];
		const mostLoaded = sortedWorkers[sortedWorkers.length - 1];

		if (mostLoaded.activeJobs - leastLoaded.activeJobs > 5) {
			this.debug(
				`Selected least loaded worker ${leastLoaded.id} for queue '${queueName}' (load: ${leastLoaded.activeJobs}/${mostLoaded.activeJobs})`
			);
			return leastLoaded;
		}

		// Otherwise, use round-robin to ensure fair distribution
		// Find the index of the last used worker, or -1 if none was used yet
		const lastUsedWorkerId = this.lastUsedWorker.get(queueName);
		let lastIndex = -1;

		if (lastUsedWorkerId) {
			lastIndex = queueState.workers.findIndex((w) => w.id === lastUsedWorkerId);
		}

		// Move to the next worker
		const nextIndex = (lastIndex + 1) % queueState.workers.length;
		const selectedWorker = queueState.workers[nextIndex];

		// Update the last used worker
		this.lastUsedWorker.set(queueName, selectedWorker.id);
		queueState.lastWorkerIndex = nextIndex;

		this.debug(
			`Selected worker ${selectedWorker.id} for queue '${queueName}' (worker ${nextIndex + 1}/${queueState.workers.length}, active jobs: ${selectedWorker.activeJobs})`
		);
		return selectedWorker;
	}

	/**
	 * Execute a job using a worker from the pool
	 *
	 * @param job The job to execute
	 * @param queueName The queue the job belongs to
	 * @param options Optional job dispatch options
	 * @returns A promise that resolves when the job is dispatched to a worker
	 */
	public async runJob(
		job: Job,
		queueName: string,
		options: JobDispatchOptions = {}
	): Promise<void> {
		const worker = this.getNextWorker(queueName);
		if (!worker) {
			throw new Error(`No workers available for queue '${queueName}'`);
		}

		// Assign queue name to job
		job.queueName = queueName;

		// Apply job options
		const jobOptions = {
			scheduledFor: options.scheduledFor,
			priority: options.priority || 10,
			maxRetries: options.maxRetries,
			retryDelay: options.retryDelay
		};

		// Dispatch job to worker
		try {
			this.debug(`Dispatching job ${job.id} to worker ${worker.id} in queue '${queueName}'`);
			// Pass job options to worker
			if (typeof worker.addJob === 'function') {
				const result = await worker.addJob(job, queueName);
				if (!result) {
					throw new Error(`Worker ${worker.id} failed to accept job ${job.id}`);
				}
			} else {
				throw new Error(`Worker ${worker.id} does not implement addJob method`);
			}
		} catch (error) {
			// If this worker fails, remove it and try another worker
			this.error(`Failed to dispatch job ${job.id} to worker ${worker.id}: ${error}`);
			await this.removeWorker(worker.id);

			// Retry with another worker
			await this.runJob(job, queueName, options);
		}
	}

	/**
	 * Cancel a job across all workers
	 *
	 * @param jobId The ID of the job to cancel
	 * @param queueName Optional queue name to limit search
	 * @returns True if the job was canceled, false otherwise
	 */
	public async cancelJob(jobId: string, queueName?: string): Promise<boolean> {
		let canceled = false;

		if (queueName) {
			// Try to cancel in specific queue
			const queueState = this.queueWorkers.get(queueName);
			if (queueState) {
				// Try each worker in the queue
				for (const worker of queueState.workers) {
					try {
						if (await worker.cancelJob(jobId, queueName)) {
							canceled = true;
							this.debug(`Job ${jobId} cancelled on worker ${worker.id}`);
							break;
						}
					} catch (error) {
						this.warning(`Error cancelling job ${jobId} on worker ${worker.id}: ${error}`);
					}
				}
			}
		} else {
			// Try all workers
			for (const worker of this.workers.values()) {
				try {
					if (await worker.cancelJob(jobId)) {
						canceled = true;
						this.debug(`Job ${jobId} cancelled on worker ${worker.id}`);
						break;
					}
				} catch (error) {
					this.warning(`Error cancelling job ${jobId} on worker ${worker.id}: ${error}`);
				}
			}
		}

		return canceled;
	}

	/**
	 * Cancel all jobs across all workers
	 *
	 * @param queueName Optional queue name to limit cancellation
	 * @returns The number of jobs canceled
	 */
	public async cancelAllJobs(queueName?: string): Promise<number> {
		let total = 0;

		if (queueName) {
			// Cancel in specific queue
			const queueState = this.queueWorkers.get(queueName);
			if (queueState) {
				for (const worker of queueState.workers) {
					try {
						const count = await worker.cancelAllJobs(queueName);
						total += count;
						this.debug(`Cancelled ${count} jobs on worker ${worker.id} in queue ${queueName}`);
					} catch (error) {
						this.warning(`Error cancelling jobs on worker ${worker.id}: ${error}`);
					}
				}
			}
		} else {
			// Cancel in all workers
			for (const worker of this.workers.values()) {
				try {
					const count = await worker.cancelAllJobs();
					total += count;
					this.debug(`Cancelled ${count} jobs on worker ${worker.id}`);
				} catch (error) {
					this.warning(`Error cancelling jobs on worker ${worker.id}: ${error}`);
				}
			}
		}

		return total;
	}

	/**
	 * Get all queues being handled by this pool
	 *
	 * @returns An array of queue names
	 */
	public getQueues(): string[] {
		return Array.from(this.queueWorkers.keys());
	}

	/**
	 * Get all workers in the pool
	 *
	 * @returns An array of worker infos
	 */
	public getWorkers(): WorkerInfo[] {
		return Array.from(this.workers.values());
	}

	/**
	 * Get workers for a specific queue
	 *
	 * @param queueName The name of the queue
	 * @returns An array of worker infos for the queue
	 */
	public getWorkersForQueue(queueName: string): WorkerInfo[] {
		const queueState = this.queueWorkers.get(queueName);
		return queueState ? [...queueState.workers] : [];
	}

	/**
	 * Get or create queue state for tracking workers
	 *
	 * @param queueName The name of the queue
	 * @returns The queue worker state
	 */
	private getOrCreateQueueState(queueName: string): QueueWorkerState {
		if (!this.queueWorkers.has(queueName)) {
			this.queueWorkers.set(queueName, {
				workers: [],
				lastWorkerIndex: -1
			});
		}

		return this.queueWorkers.get(queueName)!;
	}
}
