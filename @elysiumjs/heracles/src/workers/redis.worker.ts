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

import type { JobClass } from '../job';
import type { JobDispatchOptions } from '../queue';
import type { TransportEvent } from '../transport';
import type { Worker, WorkerQueueOptions } from '../worker';

import { Service } from '@elysiumjs/core';

import { Job, JobOverlapBehavior, JobStatus, WithId } from '../job';
import { TransportMode } from '../transport';
import { RedisTransport } from '../transports/redis.transport';
import { getJobMetadata } from '../utils';
import { BaseWorker } from './base.worker';

/**
 * Worker implementation that uses Redis for communication.
 * This worker can run in a separate process from the dispatcher.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export class RedisWorker extends BaseWorker<RedisTransport> {
	/**
	 * Whether the worker is currently running
	 */
	private isRunning: boolean = false;

	/**
	 * Queues registered with this worker
	 */
	private registeredQueues: Set<string> = new Set();

	/**
	 * Creates a new RedisWorker instance
	 * @param connectionName Name of the Redis connection to use
	 * @param options Additional options for the Redis transport
	 */
	constructor(connectionName: string = 'default', options: Record<string, any> = {}) {
		super(options.id);

		this.transport = new RedisTransport(TransportMode.CONSUMER, {
			connection: connectionName,
			consumerName: `worker-${this.id}`,
			...options
		});

		// Set up message handling
		this.transport.onMessage(this.handleTransportMessage.bind(this));

		this.debug(`RedisWorker ${this.id} created with connection: ${connectionName}`);
	}

	/**
	 * Start the worker and begin processing jobs
	 */
	public async start(): Promise<void> {
		// Call parent implementation first
		await super.start();

		if (this.isRunning) {
			return;
		}

		this.isRunning = true;

		// Store registered queues
		for (const queueName of this.queues.keys()) {
			this.registeredQueues.add(queueName);
		}

		// Start the transport
		await this.transport.start();

		// Register worker with queues
		await this.transport.registerWorker(this.id, Array.from(this.registeredQueues));

		this.info(
			`Redis worker ${this.id} started for queues: ${Array.from(this.registeredQueues).join(', ')}`
		);
	}

	/**
	 * Stop the worker
	 * @param force If true, cancel all jobs in progress
	 */
	public async stop(force: boolean = false): Promise<void> {
		this.isRunning = false;

		// Call parent implementation
		await super.stop(force);

		// Unregister worker
		await this.transport.unregisterWorker(this.id);

		// Stop the transport
		await this.transport.stop();

		this.info(`Redis worker ${this.id} stopped`);
	}

	/**
	 * Process the next job in a queue, respecting overlap settings
	 * @param queueName Name of the queue
	 */
	protected async processNextJob(queueName: string): Promise<void> {
		const queue = this.queues.get(queueName);
		if (!queue || queue.paused || queue.processing >= queue.options.concurrency!) {
			return;
		}

		// Find the next eligible job based on overlap behavior
		let eligibleJobIndex = -1;

		const now = new Date();

		for (let i = 0; i < queue.jobs.length; i++) {
			const queuedJob = queue.jobs[i];

			// Skip jobs scheduled for the future
			if (queuedJob.scheduledFor && queuedJob.scheduledFor > now) {
				continue;
			}

			// Remove cancelled jobs
			if (queuedJob.job.status === JobStatus.CANCELLED) {
				eligibleJobIndex = i;
				break;
			}

			// Check job overlap constraints
			const jobOptions = queuedJob.job.constructor as JobClass<Job>;
			const metadata = getJobMetadata(jobOptions);

			// If this job has NO_OVERLAP behavior, check if another job with the same ID is running
			if (metadata?.overlapBehavior === JobOverlapBehavior.NO_OVERLAP) {
				const isLocked = await this.transport.isJobLocked(queuedJob.job.id, queueName);

				if (isLocked) {
					// Skip this job for now, as another job with the same ID is running
					continue;
				}
			}

			// This job is eligible for processing
			eligibleJobIndex = i;
			break;
		}

		// If no eligible job was found, return
		if (eligibleJobIndex === -1) {
			return;
		}

		// Get the eligible job and remove it from the queue
		const queuedJob = queue.jobs.splice(eligibleJobIndex, 1)[0];

		if (!queuedJob) {
			return;
		}

		// Skip cancelled jobs
		if (queuedJob.job.status === JobStatus.CANCELLED) {
			this.info(`Skipping cancelled job ${queuedJob.job.id}`);

			await this.sendJobStatusUpdate(
				queuedJob.job.id,
				queuedJob.job.dispatchId,
				queueName,
				JobStatus.CANCELLED
			);

			return this.processQueueJobs(queueName);
		}

		// If job has NO_OVERLAP behavior, acquire a lock
		const jobOptions = queuedJob.job.constructor as JobClass<Job>;
		const metadata = getJobMetadata(jobOptions);

		if (metadata?.overlapBehavior === JobOverlapBehavior.NO_OVERLAP) {
			const transport = this.transport as RedisTransport;
			const lockAcquired = await transport.acquireJobLock(queuedJob.job.id, queueName);

			if (!lockAcquired) {
				// Another worker acquired the lock first, put the job back in the queue
				queue.jobs.push(queuedJob);
				return;
			}
		}

		// Track job as active
		queue.activeJobs.set(queuedJob.job.id, queuedJob);
		queue.processing++;

		// Update job status to running
		await this.sendJobStatusUpdate(
			queuedJob.job.id,
			queuedJob.job.dispatchId,
			queueName,
			JobStatus.RUNNING,
			undefined
		);

		try {
			this.debug(
				`Processing job ${queuedJob.job.id} (dispatch: ${queuedJob.job.dispatchId}) from queue '${queueName}'`
			);

			await queuedJob.job.run();

			// Handle job completion based on status
			if (queuedJob.job.status === JobStatus.FAILED) {
				// Get max retries
				const maxRetries =
					queuedJob.maxRetries !== undefined ? queuedJob.maxRetries : queue.options.maxRetries!;

				if (queuedJob.retries < maxRetries) {
					// Increment retry count
					queuedJob.retries++;
					queuedJob.job.incrementRetries();
					this.warning(
						`Job ${queuedJob.job.id} failed, retrying (${queuedJob.retries}/${maxRetries})`
					);

					// Get retry delay
					const retryDelay =
						queuedJob.retryDelay !== undefined ? queuedJob.retryDelay : queue.options.retryDelay!;

					// Update job status to scheduled for retry
					await this.sendJobStatusUpdate(
						queuedJob.job.id,
						queuedJob.job.dispatchId,
						queueName,
						JobStatus.SCHEDULED_FOR_RETRY,
						queuedJob.job.lastError?.message
					);

					// Schedule retry
					setTimeout(() => {
						if (queuedJob.job.status !== JobStatus.CANCELLED) {
							queue.jobs.push(queuedJob);
							this.processQueueJobs(queueName);
						} else {
							this.info(`Skipping cancelled job ${queuedJob.job.id} during retry delay`);
							this.sendJobStatusUpdate(
								queuedJob.job.id,
								queuedJob.job.dispatchId,
								queueName,
								JobStatus.CANCELLED
							);
						}
					}, retryDelay);
				} else {
					// Job failed after all retries
					this.error(
						`Job ${queuedJob.job.id} failed after ${queuedJob.retries} retries (max: ${maxRetries}): ${queuedJob.job.lastError?.message}`
					);

					// Update job status to failed
					await this.sendJobStatusUpdate(
						queuedJob.job.id,
						queuedJob.job.dispatchId,
						queueName,
						JobStatus.FAILED,
						queuedJob.job.lastError?.message
					);

					// Pause queue if configured to do so
					if (queue.options.pauseOnError) {
						this.pause(queueName);
						this.warning(`Queue '${queueName}' paused due to job failure`);
					}
				}
			} else if (queuedJob.job.status === JobStatus.COMPLETED) {
				// Job completed successfully
				this.success(`Job ${queuedJob.job.id} completed successfully`);

				// Update job status to completed
				await this.sendJobStatusUpdate(
					queuedJob.job.id,
					queuedJob.job.dispatchId,
					queueName,
					JobStatus.COMPLETED
				);
			} else if ((queuedJob.job.status as JobStatus) === JobStatus.CANCELLED) {
				// Job was cancelled while running
				this.info(`Job ${queuedJob.job.id} cancelled while running`);

				// Update job status to cancelled
				await this.sendJobStatusUpdate(
					queuedJob.job.id,
					queuedJob.job.dispatchId,
					queueName,
					JobStatus.CANCELLED
				);
			}
		} catch (error) {
			// Handle unexpected errors during job execution
			this.error(`Unexpected error processing job ${queuedJob.job.id}: ${error}`);

			// Update job status to failed
			await this.sendJobStatusUpdate(
				queuedJob.job.id,
				queuedJob.job.dispatchId,
				queueName,
				JobStatus.FAILED,
				error instanceof Error ? error.message : String(error)
			);

			// Pause queue if configured to do so
			if (queue.options.pauseOnError) {
				this.pause(queueName);
				this.warning(`Queue '${queueName}' paused due to unexpected error`);
			}
		} finally {
			// Release lock if job has NO_OVERLAP behavior
			if (metadata?.overlapBehavior === JobOverlapBehavior.NO_OVERLAP) {
				// If there's an overlap delay, keep the lock for that duration
				if (metadata.overlapDelay && metadata.overlapDelay > 0) {
					setTimeout(() => {
						this.transport.releaseJobLock(queuedJob.job.id, queueName);
					}, metadata.overlapDelay);
				} else {
					// Release lock immediately
					await this.transport.releaseJobLock(queuedJob.job.id, queueName);
				}
			}

			// Remove job from active jobs
			queue.activeJobs.delete(queuedJob.job.id);
			queue.processing--;

			// Process next job in queue
			this.processQueueJobs(queueName);
		}
	}

	/**
	 * Create a new queue with the specified options
	 * @param options Queue options
	 */
	public override async createQueue(options: WorkerQueueOptions): Promise<Worker> {
		const result = await super.createQueue(options);

		// Register the new queue with the transport if worker is running
		if (this.isRunning && !this.registeredQueues.has(options.name)) {
			this.registeredQueues.add(options.name);
			await this.transport.registerWorker(this.id, Array.from(this.registeredQueues));
		}

		return result;
	}

	/**
	 * Handle a message from the transport
	 * @param message The message to handle
	 */
	private async handleTransportMessage(message: TransportEvent): Promise<void> {
		try {
			switch (message.type) {
				case 'job:process': {
					// Add job to queue
					const {
						job: jobName,
						args = [],
						queue = 'default',
						options = {},
						jobId,
						dispatchId
					} = message;
					await this.handleProcessJob(jobId, dispatchId, jobName, args, queue, options);
					break;
				}

				case 'job:cancel': {
					// Cancel job
					const { jobId, dispatchId, queue = 'default' } = message;
					const cancelled = await this.cancelJob(jobId, queue);

					// Send response
					if (cancelled) {
						await this.sendJobStatusUpdate(jobId, dispatchId, queue, JobStatus.CANCELLED);
					}
					break;
				}

				case 'job:cancelAll': {
					// Cancel all jobs in queue
					const { queue = 'default' } = message;
					await this.cancelAllJobs(queue);
					break;
				}
			}
		} catch (error) {
			this.error(`Error handling transport message: ${error}`);
		}
	}

	/**
	 * Handle a job:process message
	 * @param jobName Job class name
	 * @param args Job constructor arguments
	 * @param queueName Queue name
	 * @param options Job options
	 */
	private async handleProcessJob(
		jobId: string,
		dispatchId: string,
		jobName: string,
		args: any[],
		queueName: string,
		messageOptions: any
	): Promise<void> {
		try {
			// Get job class from Service container
			const JobClass = Service.get(jobName) as JobClass<Job>;

			if (!JobClass) {
				throw new Error(`Job class not found: ${jobName}`);
			}

			// Create job instance
			const job = new (WithId(JobClass, jobId, dispatchId))(...(args || []));
			job.queueName = queueName;

			// Parse job options
			const jobOptions: JobDispatchOptions = {};

			if (messageOptions.scheduledFor) {
				jobOptions.scheduledFor =
					typeof messageOptions.scheduledFor === 'string'
						? new Date(messageOptions.scheduledFor)
						: messageOptions.scheduledFor;
			}

			if (messageOptions.priority !== undefined) {
				jobOptions.priority = Number(messageOptions.priority);
			}

			if (messageOptions.maxRetries !== undefined) {
				jobOptions.maxRetries = Number(messageOptions.maxRetries);
			}

			if (messageOptions.retryDelay !== undefined) {
				jobOptions.retryDelay = Number(messageOptions.retryDelay);
			}

			// Check if we should schedule the job for later
			if (jobOptions.scheduledFor && jobOptions.scheduledFor > new Date()) {
				// For scheduled jobs, set status to SCHEDULED_FOR_RETRY
				await this.sendJobStatusUpdate(
					job.id,
					job.dispatchId,
					queueName,
					JobStatus.SCHEDULED_FOR_RETRY
				);
				this.debug(
					`Scheduled job ${job.id} for future execution at ${jobOptions.scheduledFor.toISOString()}`
				);
			} else {
				// For immediate jobs, set status to PENDING
				await this.sendJobStatusUpdate(job.id, job.dispatchId, queueName, JobStatus.PENDING);
				this.debug(`Added job ${job.id} to queue ${queueName} with initial status: pending`);
			}

			// Add job to queue for processing
			await this.addJob(job, queueName, jobOptions);
		} catch (error: any) {
			this.error(`Error processing job ${jobName}: ${error.message}`);
			this.sendJobStatusUpdate(jobId, dispatchId, queueName, JobStatus.FAILED, error.message);
			throw error;
		}
	}
}
