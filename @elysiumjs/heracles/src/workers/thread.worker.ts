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

import type { Class } from 'type-fest';
import type { Job } from '../job';
import type { JobDispatchOptions } from '../queue';
import type { TransportEvent } from '../transport';

import { Service } from '@elysiumjs/core';

import { JobStatus } from '../job';
import { TransportMode } from '../transport';
import { ThreadTransport } from '../transports/thread.transport';
import { BaseWorker } from './base.worker';

declare const self: Worker;

/**
 * Worker class that receives jobs from parent thread.
 */
export class ThreadWorker extends BaseWorker {
	/**
	 * Transport instance used for communication with main thread
	 */
	private readonly transport: ThreadTransport;

	constructor(queues: string[] = ['default'], id?: string) {
		super(id);

		this.info(`ThreadWorker ${this.id} started with queues: ${queues.join(', ')}`);

		// Create transport in consumer mode if in worker thread
		this.transport = new ThreadTransport(TransportMode.CONSUMER);
		this.debug('Created transport in consumer mode');

		// Only set up message listeners if running in a worker thread
		this.setupMessageListeners();

		// Initialize the specified queues
		for (const queueName of queues) {
			if (!this.queues.has(queueName)) {
				this.createQueue({ name: queueName });
			}
		}

		// Report that the worker is ready if in worker thread
		self.postMessage({
			type: 'worker:ready',
			id: this.id,
			queues: Array.from(this.queues.keys()),
			status: this.status
		});
	}

	/**
	 * Set up message listeners for worker thread
	 */
	private setupMessageListeners(): void {
		self.addEventListener('message', async (event: MessageEvent) => {
			const message = event.data as TransportEvent;

			try {
				await this.handleMessage(message);
			} catch (error: any) {
				this.error(`Error handling message: ${error}`);
				self.postMessage({
					type: 'worker:error',
					error: error.message || String(error),
					workerId: this.id
				});
			}
		});

		// Handle errors
		self.addEventListener('error', (e) => {
			this.trace({ ...e.error, filename: e.filename }, `ThreadWorker ${this.id} error:`);
			self.postMessage({
				type: 'worker:error',
				error: e.error?.message || e.message || 'Unknown error',
				workerId: this.id
			});
		});

		// Handle unhandled promise rejections
		self.addEventListener('unhandledrejection', (e: any) => {
			const error = e.reason || e;
			this.trace(error, `ThreadWorker ${this.id} unhandled rejection:`);
			self.postMessage({
				type: 'worker:error',
				error: error.message || String(error),
				workerId: this.id
			});
		});
	}

	/**
	 * Handle a message from the main thread
	 * @public This method is exposed to be called from thread.worker.entry.ts
	 */
	public async handleMessage(message: TransportEvent): Promise<void> {
		switch (message.type) {
			case 'job:process': {
				// Process a new job
				const { job: jobName, args = [], queue = 'default', options } = message;
				this.debug(`ThreadWorker ${this.id} received job ${jobName} for queue ${queue}`);
				await this.handleProcessJob(jobName, args, queue, {
					...options,
					scheduledFor: new Date(options?.scheduledFor ?? Date.now())
				});
				break;
			}

			case 'job:cancel': {
				// Cancel a job
				const { jobId, queue = 'default' } = message;
				const canceled = await this.cancelJob(jobId, queue);
				this.sendStatusUpdate({
					type: 'job:canceled',
					jobId,
					queue,
					success: canceled,
					count: canceled ? 1 : 0
				});
				break;
			}

			case 'job:cancelAll': {
				// Cancel all jobs in a queue
				const { queue = 'default' } = message;
				const canceledCount = await this.cancelAllJobs(queue);
				this.sendStatusUpdate({
					type: 'job:canceled',
					queue,
					count: canceledCount
				});
				break;
			}

			case 'job:status': {
				// Get job status
				const { jobId, queue = 'default' } = message;
				const job = await this.getJob(jobId, queue);

				if (job) {
					this.sendStatusUpdate({
						type: 'job:status',
						jobId,
						queue,
						status: job.status,
						error: job.lastError?.message,
						retries: job.retries,
						startedAt: job.startedAt?.toISOString(),
						completedAt: job.completedAt?.toISOString()
					});
				} else {
					this.sendStatusUpdate({
						type: 'job:status',
						jobId,
						queue,
						status: 'unknown'
					});
				}
				break;
			}

			case 'worker:register': {
				// Add new queues to this worker
				if (message.queues?.length) {
					for (const queueName of message.queues) {
						if (!this.queues.has(queueName)) {
							await this.createQueue({ name: queueName });
						}
					}

					// Send updated worker info
					this.sendWorkerStatusUpdate();
				}
				break;
			}

			case 'worker:unregister': {
				// Stop the worker
				await this.stop();

				// Notify main thread that worker is stopping
				this.sendStatusUpdate({
					type: 'worker:status',
					workerId: this.id,
					status: 'stopped',
					queues: Array.from(this.queues.keys()),
					processing: 0,
					waiting: 0
				});

				break;
			}
		}
	}

	/**
	 * Process the next job in a queue
	 */
	public async processNextJob(queueName: string): Promise<void> {
		const queue = this.queues.get(queueName);
		if (!queue || queue.paused || queue.processing >= queue.options.concurrency!) {
			return;
		}

		const queuedJob = queue.jobs.shift();
		if (!queuedJob) {
			return;
		}

		if (queuedJob.job.status === JobStatus.CANCELLED) {
			this.info(`Skipping cancelled job ${queuedJob.job.id}`);
			this.sendStatusUpdate({
				type: 'job:status',
				jobId: queuedJob.job.id,
				queue: queueName,
				status: JobStatus.CANCELLED
			});

			this.processQueueJobs(queueName);
			return;
		}

		// Add to active jobs
		queue.activeJobs.set(queuedJob.job.id, queuedJob);
		queue.processing++;

		// Send job started status update
		try {
			await this.transport.updateJobStatus(queuedJob.job.id, queuedJob.job.dispatchId, queueName, {
				status: JobStatus.RUNNING,
				startedAt: new Date().toISOString()
			});
		} catch (error) {
			this.error(`Error updating job status to RUNNING: ${error}`);
		}

		try {
			this.debug(`Processing job ${queuedJob.job.id} from queue '${queueName}'`);
			await queuedJob.job.run();

			// Handle job completion based on status
			if (queuedJob.job.status === JobStatus.FAILED) {
				// Determine max retries - use job-specific setting if available, otherwise queue setting
				const maxRetries =
					queuedJob.maxRetries !== undefined ? queuedJob.maxRetries : queue.options.maxRetries!;

				if (queuedJob.retries < maxRetries) {
					// Schedule for retry
					queuedJob.retries++;
					queuedJob.job.incrementRetries();
					this.warning(
						`Job ${queuedJob.job.id} failed, retrying (${queuedJob.retries}/${maxRetries})`
					);

					// Determine retry delay - use job-specific setting if available, otherwise queue setting
					const retryDelay =
						queuedJob.retryDelay !== undefined ? queuedJob.retryDelay : queue.options.retryDelay!;

					// Set scheduled time for retry
					const retryTime = new Date();
					retryTime.setMilliseconds(retryTime.getMilliseconds() + retryDelay);
					queuedJob.scheduledFor = retryTime;

					// Send status update for scheduled retry
					try {
						await this.transport.updateJobStatus(queuedJob.job.id, queuedJob.job.id, queueName, {
							status: JobStatus.SCHEDULED_FOR_RETRY,
							error: queuedJob.job.lastError?.message,
							retries: queuedJob.retries
						});
					} catch (error) {
						this.error(`Error updating job status to SCHEDULED_FOR_RETRY: ${error}`);
					}

					// Schedule the retry
					setTimeout(async () => {
						if (queuedJob.job.status !== JobStatus.CANCELLED) {
							queue.jobs.push(queuedJob);
							this.processQueueJobs(queueName);
						} else {
							this.info(`Skipping cancelled job ${queuedJob.job.id} during retry delay`);
							try {
								await this.transport.updateJobStatus(
									queuedJob.job.id,
									queuedJob.job.id,
									queueName,
									{
										status: JobStatus.CANCELLED
									}
								);
							} catch (error) {
								this.error(`Error updating job status to CANCELLED: ${error}`);
							}
						}
					}, retryDelay);
				} else {
					// Job failed permanently after all retries
					const maxRetries =
						queuedJob.maxRetries !== undefined ? queuedJob.maxRetries : queue.options.maxRetries!;
					this.error(
						`Job ${queuedJob.job.id} failed after ${queuedJob.retries} retries (max: ${maxRetries})`
					);

					// Send final failure status
					const completedAt = queuedJob.job.completedAt?.toISOString() || new Date().toISOString();
					try {
						await this.transport.updateJobStatus(queuedJob.job.id, queuedJob.job.id, queueName, {
							status: JobStatus.FAILED,
							error: queuedJob.job.lastError?.message,
							completedAt
						});
					} catch (error) {
						this.error(`Error updating job status to FAILED: ${error}`);
					}

					if (queue.options.pauseOnError) {
						this.pause(queueName);
						this.warning(`Queue '${queueName}' paused due to job failure`);
					}
				}
			} else if (queuedJob.job.status === JobStatus.COMPLETED) {
				// Job completed successfully
				this.success(`Job ${queuedJob.job.id} completed successfully`);

				// Send completion status
				const completedAt = queuedJob.job.completedAt?.toISOString() || new Date().toISOString();
				try {
					await this.transport.updateJobStatus(queuedJob.job.id, queuedJob.job.id, queueName, {
						status: JobStatus.COMPLETED,
						completedAt
					});
				} catch (error) {
					this.error(`Error updating job status to COMPLETED: ${error}`);
				}
			} else if (queuedJob.job.status === JobStatus.CANCELLED) {
				// Job was cancelled while running
				this.info(`Job ${queuedJob.job.id} cancelled while running`);

				// Send cancellation status
				const completedAt = queuedJob.job.completedAt?.toISOString() || new Date().toISOString();
				try {
					await this.transport.updateJobStatus(queuedJob.job.id, queuedJob.job.id, queueName, {
						status: JobStatus.CANCELLED,
						completedAt
					});
				} catch (error) {
					this.error(`Error updating job status to CANCELLED: ${error}`);
				}
			}
		} catch (error: any) {
			// Handle unexpected errors during job execution
			this.error(`Unexpected error processing job ${queuedJob.job.id}: ${error}`);

			// Send error status using transport if available
			const completedAt = new Date().toISOString();
			const errorMsg = error.message || String(error);
			if (this.transport && typeof this.transport.updateJobStatus === 'function') {
				await this.transport.updateJobStatus(queuedJob.job.id, queuedJob.job.id, queueName, {
					status: JobStatus.FAILED,
					error: errorMsg,
					completedAt
				});
			} else {
				this.sendStatusUpdate({
					type: 'job:result',
					jobId: queuedJob.job.id,
					queue: queueName,
					status: JobStatus.FAILED,
					error: errorMsg,
					completedAt
				});
			}

			if (queue.options.pauseOnError) {
				this.pause(queueName);
				this.warning(`Queue '${queueName}' paused due to unexpected error`);
			}
		} finally {
			// Remove job from active jobs and decrement processing count
			queue.activeJobs.delete(queuedJob.job.id);
			queue.processing--;

			// Send worker status update
			this.sendWorkerStatusUpdate();

			// Process next job if available
			this.processQueueJobs(queueName);
		}
	}

	/**
	 * Create a job from a job class name and add it to a queue
	 */
	private async handleProcessJob(
		jobName: string,
		args: any[],
		queue: string = 'default',
		options?: Partial<JobDispatchOptions>
	): Promise<void> {
		this.debug(`Processing job ${jobName} in ThreadWorker for queue ${queue}`);
		try {
			// Get job class from service container
			const JobClass = Service.get(jobName) as Class<Job>;
			if (!JobClass) {
				this.error(`Job class ${jobName} not found`);
				throw new Error(`Job class ${jobName} not found`);
			}

			// Create job instance
			const job = new JobClass(...(args || []));
			job.queueName = queue;

			// Prepare job options
			const jobOptions: JobDispatchOptions = options || {};

			// Convert ISO string date to Date object if needed
			if (jobOptions.scheduledFor && typeof jobOptions.scheduledFor === 'string') {
				jobOptions.scheduledFor = new Date(jobOptions.scheduledFor);
			}

			// Set initial job status
			const initialStatus =
				jobOptions.scheduledFor && jobOptions.scheduledFor > new Date()
					? JobStatus.SCHEDULED_FOR_RETRY
					: JobStatus.PENDING;

			try {
				await this.transport.updateJobStatus(job.id, job.dispatchId, queue, {
					status: initialStatus,
					createdAt: new Date().toISOString()
				});
			} catch (error) {
				this.error(`Error setting initial job status: ${error}`);
			}

			// Add job to queue with options
			await this.addJob(job, queue, jobOptions);

			// Send job received confirmation
			this.sendStatusUpdate({
				type: 'job:received',
				jobId: job.id,
				queue
			});
		} catch (error: any) {
			// Log and report error
			this.trace(
				error,
				`Error while adding job '${jobName}' to queue '${queue}' with worker ${this.id}`
			);

			this.sendStatusUpdate({
				type: 'job:error',
				jobId: `error_${Date.now()}`,
				jobName,
				queue,
				error: error.message || String(error)
			});
		}
	}

	/**
	 * Send a status update to the main thread (legacy method)
	 * @deprecated Use transport.updateJobStatus instead
	 */
	private sendStatusUpdate(message: any): void {
		this.warning(`Using deprecated sendStatusUpdate. Use transport.updateJobStatus instead`);
		self.postMessage(message);
	}

	/**
	 * Send worker status update to main thread
	 */
	private sendWorkerStatusUpdate(): void {
		// Calculate waiting and processing counts
		let waiting = 0;
		let processing = 0;

		for (const queue of this.queues.values()) {
			waiting += queue.jobs.length;
			processing += queue.processing;
		}

		// Send status update
		self.postMessage({
			type: 'worker:status',
			workerId: this.id,
			queues: Array.from(this.queues.keys()),
			status: this.status as string,
			processing,
			waiting
		});
	}

	/**
	 * Override start method to send status update
	 */
	public async start(): Promise<void> {
		await super.start();
		this.sendWorkerStatusUpdate();
	}

	/**
	 * Override stop method to send status update
	 */
	public async stop(force: boolean = false): Promise<void> {
		await super.stop(force);
		this.sendWorkerStatusUpdate();
	}
}
