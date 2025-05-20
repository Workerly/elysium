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

import type {
	JobStatusInfo,
	Transport,
	TransportEvent,
	TransportJobStatusMessage,
	TransportMode
} from '../transport';

import { InteractsWithConsole, Redis } from '@elysiumjs/core';
import { uid } from 'radash';

import { JobStatus } from '../job';

/**
 * Redis transport configuration options
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type RedisTransportOptions = {
	/**
	 * Redis connection name.
	 * If not provided, uses the default connection.
	 */
	connection?: string;

	/**
	 * Prefix for all Redis keys used by this transport.
	 * @default 'elysium:heracles'
	 */
	keyPrefix?: string;

	/**
	 * Group name for Redis consumer groups.
	 * @default 'workers'
	 */
	consumerGroup?: string;

	/**
	 * Consumer name for this instance in the consumer group.
	 * If not provided, a random name will be generated.
	 */
	consumerName?: string;

	/**
	 * How often to poll Redis for new messages (in milliseconds).
	 * @default 1000
	 */
	pollInterval?: number;

	/**
	 * Maximum number of messages to read in a single poll.
	 * @default 10
	 */
	batchSize?: number;

	/**
	 * Time to live for job status information (in seconds).
	 * @default 86400 (24 hours)
	 */
	statusTTL?: number;

	/**
	 * Whether to automatically clean up completed and failed jobs from streams.
	 * @default true
	 */
	cleanupCompletedJobs?: boolean;

	/**
	 * How long to retain completed jobs in the stream before cleanup (in seconds).
	 * @default 3600 (1 hour)
	 */
	completedJobRetention?: number;

	/**
	 * Maximum number of entries to keep in each stream.
	 * @default 1000
	 */
	maxStreamSize?: number;
};

/**
 * Transport implementation using Redis streams for distributed job processing.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export class RedisTransport extends InteractsWithConsole implements Transport {
	/**
	 * Redis client instance.
	 */
	private client: Bun.RedisClient;

	/**
	 * Options for this transport.
	 */
	private options: Required<RedisTransportOptions>;

	/**
	 * Mode this transport is operating in.
	 */
	private mode: TransportMode;

	/**
	 * Registered message handlers.
	 */
	private messageHandlers: Array<(message: TransportEvent) => void | Promise<void>> = [];

	/**
	 * Timer for polling Redis in consumer mode.
	 */
	private pollTimer?: NodeJS.Timeout;

	/**
	 * Timer for stream cleanup.
	 */
	private cleanupTimer?: NodeJS.Timeout;

	/**
	 * Last processed message IDs by stream.
	 */
	private lastIds: Map<string, string> = new Map();

	/**
	 * Whether to check the logs instead of new messages.
	 */
	private checkLogs: Map<string, boolean> = new Map();

	/**
	 * Consumer ID for this instance.
	 */
	private consumerId: string;

	/**
	 * Whether the consumer group has been created for each stream.
	 */
	private consumerGroupCreated: Set<string> = new Set();

	/**
	 * Map of message IDs to completed status for tracking completed jobs.
	 */
	private completedMessageIds: Map<string, { streamKey: string; timestamp: number }> = new Map();

	/**
	 * Map to track locks on job IDs for NO_OVERLAP jobs.
	 */
	private jobLocks: Map<string, { lockedUntil: number; queue: string }> = new Map();

	/**
	 * Create a new Redis transport.
	 */
	constructor(mode: TransportMode, options: RedisTransportOptions = {}) {
		super();

		this.mode = mode;
		this.options = {
			connection: options.connection ?? 'default',
			keyPrefix: options.keyPrefix ?? 'elysium:heracles',
			consumerGroup: options.consumerGroup ?? 'workers',
			consumerName: options.consumerName ?? `worker-${uid(8)}`,
			pollInterval: options.pollInterval ?? 1000,
			batchSize: options.batchSize ?? 10,
			statusTTL: options.statusTTL ?? 86400,
			cleanupCompletedJobs: options.cleanupCompletedJobs !== false, // Default to true
			completedJobRetention: options.completedJobRetention ?? 3600, // Default to 1 hour
			maxStreamSize: options.maxStreamSize ?? 1000
		};

		// Get Redis client from Redis service
		this.client = Redis.getConnection(this.options.connection);
		this.consumerId = this.mode === 'consumer' ? this.options.consumerName : `producer-${uid(8)}`;
	}

	/**
	 * Helper method to execute Redis commands with proper type conversion
	 * @param command Redis command
	 * @param args Command arguments
	 * @returns Redis response
	 */
	private redisCommand(command: string, args: any[]): Promise<any> {
		// Convert any non-string arguments to strings
		const stringArgs = args.map((arg) => {
			if (typeof arg === 'number') {
				return arg.toString();
			} else if (arg === null || arg === undefined) {
				return '';
			} else if (Array.isArray(arg)) {
				return JSON.stringify(arg);
			} else if (typeof arg === 'object') {
				return JSON.stringify(arg);
			}
			return arg;
		});

		try {
			return this.client.send(command, stringArgs);
		} catch (error) {
			throw new Error(`Redis command failed: ${command} - ${error}`);
		}
	}

	/**
	 * Finds job message ID in the stream by job ID
	 * @param jobId The job ID to find
	 * @param queueName The queue to search in
	 * @returns The message ID if found, null otherwise
	 */
	private async findJobMessageId(
		jobId: string,
		dispatchId: string,
		queueName: string
	): Promise<string | null> {
		const streamKey = this.getStreamKey(queueName);

		try {
			// Use XRANGE to find messages for this job
			// First try with the job's exact ID included in message ID (producer pattern)
			const messages = await this.redisCommand('XRANGE', [streamKey, '-', '+', 'COUNT', '1000']);

			for (const [messageId, fields] of messages) {
				// Convert fields to object and check jobId field
				const messageObj: Record<string, string> = {};
				for (let i = 0; i < fields.length; i += 2) {
					messageObj[fields[i]] = fields[i + 1];
				}

				if (messageObj.jobId === jobId && messageObj.dispatchId === dispatchId) {
					return messageId;
				}
			}
		} catch (error) {
			this.error(`Error finding job message: ${error}`);
		}

		return null;
	}

	/**
	 * Start the transport
	 */
	async start(): Promise<void> {
		try {
			// Test connection using raw command
			await this.redisCommand('PING', []);
			this.info(`RedisTransport started in ${this.mode} mode with ID: ${this.consumerId}`);

			if (this.mode === 'consumer') {
				// Start polling for messages
				this.startPolling();

				// Schedule periodic cleanup of completed jobs if enabled
				if (this.options.cleanupCompletedJobs) {
					this.scheduleStreamCleanup();
				}
			}
		} catch (error) {
			this.error(`Failed to start RedisTransport: ${error}`);
			throw new Error(`Redis connection failed: ${error}`);
		}
	}

	/**
	 * Stop the transport
	 */
	async stop(): Promise<void> {
		// Stop polling
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = undefined;
		}

		// Stop cleanup timer
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = undefined;
		}

		this.info('RedisTransport stopped');
	}

	/**
	 * Send a message through the transport
	 */
	async send(message: TransportEvent): Promise<void> {
		try {
			let queueNames: string[] = ['default'];

			// Extract queue name if the message type has it
			if ('queue' in message && typeof message.queue === 'string') {
				queueNames = [message.queue];
			} else if ('queues' in message && Array.isArray(message.queues)) {
				queueNames = message.queues;
			}

			for (const queueName of queueNames) {
				// Determine the appropriate stream based on message type
				const streamName: string = this.getStreamKey(queueName);

				// Convert message to Redis hash format
				const messageData = this.serializeMessage(message);

				// ID of the created message in the stream
				let messageId: string = '0';

				// Handle job status updates differently
				if (message.type === 'job:status' || message.type === 'job:result') {
					// Find existing message for this job
					const existingMessageId = await this.findJobMessageId(
						message.jobId,
						message.dispatchId,
						queueName
					);

					if (existingMessageId) {
						// Update existing job entry with new status
						const statusInfo: Partial<Record<keyof JobStatusInfo, string>> = {
							status: message.status,
							updatedAt: Date.now().toString()
						};

						// Add additional fields if present
						if (message.error) statusInfo['error'] = message.error;
						if (message.retries !== undefined) statusInfo['retries'] = message.retries.toString();
						if ((message as any).startedAt) statusInfo['startedAt'] = (message as any).startedAt;
						if (message.completedAt) statusInfo['completedAt'] = message.completedAt;

						// Update the job entry
						await this.redisCommand('HSET', [
							this.getJobStatusKey(message.jobId, message.dispatchId, queueName),
							...Object.entries(statusInfo).flat()
						]);

						this.debug(`Updated status for job ${message.jobId} to ${message.status}`);

						// Store in-memory for quick lookup
						await this.storeJobStatus({
							jobId: message.jobId,
							dispatchId: message.dispatchId,
							queue: queueName,
							status: message.status,
							error: message.error,
							retries: message.retries ?? 0,
							createdAt: (message as any).createdAt ?? new Date().toISOString(),
							startedAt: (message as any).startedAt,
							completedAt: message.completedAt
						});

						return;
					} else {
						// First check if we should update an existing job status instead
						const jobId = message.jobId;
						const dispatchId = message.dispatchId;
						const statusKey = this.getJobStatusKey(jobId, dispatchId, queueName);
						const exists = await this.redisCommand('EXISTS', [statusKey]);

						// Add to Redis stream using raw command
						messageId = await this.redisCommand('XADD', [
							streamName,
							'*', // Auto-generate ID
							...messageData
						]);

						if (exists) {
							// Update existing job status
							await this.updateJobStatus(message.jobId, message.dispatchId, queueName, {
								status: message.status,
								error: message.error,
								retries: message.retries ?? 0,
								startedAt: (message as any).startedAt,
								completedAt: message.completedAt,
								updatedAt: Date.now().toString()
							});
						} else {
							// Create new job status
							await this.storeJobStatus({
								jobId: message.jobId,
								dispatchId: message.dispatchId,
								queue: queueName,
								status: message.status,
								error: message.error,
								retries: message.retries ?? 0,
								createdAt: (message as any).createdAt ?? new Date().toISOString(),
								startedAt: (message as any).startedAt,
								completedAt: message.completedAt,
								messageId: messageId,
								updatedAt: Date.now().toString()
							});
						}
					}
				} else if (message.type === 'job:process') {
					// Add to Redis stream using raw command
					messageId = await this.redisCommand('XADD', [
						streamName,
						'*', // Auto-generate ID
						...messageData
					]);

					// Store job information in separate hash for easy access and updates
					await this.storeJobStatus({
						jobId: message.jobId,
						dispatchId: message.dispatchId,
						queue: queueName,
						status: JobStatus.PENDING,
						retries: 0,
						createdAt: new Date().toISOString(),
						messageId: messageId,
						updatedAt: Date.now().toString()
					});
				} else if (message.type === 'job:update') {
					// Direct update of job status without creating a new message
					await this.updateJobStatus(message.jobId, message.dispatchId, queueName, message.updates);
				} else {
					// Add to Redis stream using raw command
					messageId = await this.redisCommand('XADD', [
						streamName,
						'*', // Auto-generate ID
						...messageData
					]);
				}

				this.debug(`Sent ${message.type} message to stream ${streamName} with ID ${messageId}`);
			}
		} catch (error) {
			this.error(`Failed to send message: ${error}`);
			throw new Error(`Failed to send message: ${error}`);
		}
	}

	/**
	 * Register a callback to handle messages
	 */
	onMessage(handler: (message: TransportEvent) => void | Promise<void>): void {
		this.messageHandlers.push(handler);
	}

	/**
	 * Gets the current status of a job.
	 */
	async getJobStatus(jobId: string, dispatchId: string, queueName: string): Promise<JobStatusInfo> {
		// Try to get from Redis
		try {
			const statusKey = this.getJobStatusKey(jobId, dispatchId, queueName);
			const jobData = await this.redisCommand('HGETALL', [statusKey]);

			if (jobData) {
				const status: JobStatusInfo = {
					jobId,
					dispatchId: jobData.dispatchId,
					queue: queueName,
					status: jobData.status || 'unknown',
					error: jobData.error,
					retries: parseInt(jobData.retries || '0', 10),
					createdAt: jobData.createdAt || new Date().toISOString(),
					startedAt: jobData.startedAt,
					completedAt: jobData.completedAt,
					updatedAt: jobData.updatedAt,
					messageId: jobData.messageId
				};

				this.debug(`Retrieved job status for ${jobId} from Redis: ${status.status}`);
				return status;
			}
		} catch (error) {
			this.warning(`Failed to get job status from Redis: ${error}`);
		}

		// If we couldn't find the status, check if the job exists in the queue
		try {
			const messageId = await this.findJobMessageId(jobId, dispatchId, queueName);

			if (messageId) {
				// Job exists in the stream but doesn't have a status entry yet
				const status: JobStatusInfo = {
					jobId,
					dispatchId,
					queue: queueName,
					status: JobStatus.PENDING,
					retries: 0,
					createdAt: new Date().toISOString(),
					messageId,
					updatedAt: Date.now().toString()
				};

				// Store this status for future reference
				await this.storeJobStatus(status);
				return status;
			}
		} catch (error) {
			this.debug(`Error checking job existence in stream: ${error}`);
		}

		// Return default status if not found
		return {
			jobId,
			dispatchId,
			queue: queueName,
			status: 'unknown',
			retries: 0,
			createdAt: new Date().toISOString()
		};
	}

	/**
	 * Updates a job's status directly in Redis without creating a new message.
	 *
	 * @param jobId The ID of the job to update
	 * @param queueName The queue the job belongs to
	 * @param updates The status updates to apply
	 */
	async updateJobStatus(
		jobId: string,
		dispatchId: string,
		queueName: string,
		updates: Partial<JobStatusInfo>
	): Promise<void> {
		try {
			const statusKey = this.getJobStatusKey(jobId, dispatchId, queueName);
			const timestamp = Date.now().toString();

			// Check if job status exists
			const exists = await this.redisCommand('EXISTS', [statusKey]);

			if (!exists) {
				// Job status doesn't exist in Redis yet
				if (updates.status) {
					// Create new status entry
					const newStatus: JobStatusInfo = {
						jobId,
						dispatchId,
						queue: queueName,
						status: updates.status,
						error: updates.error,
						retries: updates.retries || 0,
						createdAt: updates.createdAt || new Date().toISOString(),
						startedAt: updates.startedAt,
						completedAt: updates.completedAt,
						updatedAt: timestamp,
						messageId: updates.messageId
					};
					await this.storeJobStatus(newStatus);

					// Also send notifications if this is a final status
					if (
						updates.status === JobStatus.COMPLETED ||
						updates.status === JobStatus.FAILED ||
						updates.status === JobStatus.CANCELLED
					) {
						// Forward the status update to any message handlers as a job:result event
						for (const handler of this.messageHandlers) {
							try {
								handler({
									type: 'job:result',
									jobId,
									dispatchId,
									queue: queueName,
									status: updates.status,
									error: updates.error,
									completedAt: updates.completedAt ?? new Date().toISOString()
								});
							} catch (handlerError) {
								this.error(`Error in message handler: ${handlerError}`);
							}
						}
					} else {
						// For non-terminal statuses, just send a regular status update
						for (const handler of this.messageHandlers) {
							try {
								handler({
									type: 'job:status',
									jobId,
									dispatchId,
									queue: queueName,
									status: updates.status,
									error: updates.error,
									updatedAt: updates.updatedAt ?? new Date().toISOString()
								});
							} catch (handlerError) {
								this.error(`Error in message handler: ${handlerError}`);
							}
						}
					}
				}
				return;
			}

			// Build update fields for existing entry
			const updateFields: string[] = [];
			const notifyFields: TransportJobStatusMessage = {} as TransportJobStatusMessage;

			// Add all update fields
			if (updates.status) {
				updateFields.push('status', updates.status);
				notifyFields.status = updates.status;
			}

			if (updates.error !== undefined) {
				updateFields.push('error', updates.error || '');
				notifyFields.error = updates.error || '';
			}

			if (updates.retries !== undefined) {
				updateFields.push('retries', updates.retries.toString());
				notifyFields.retries = updates.retries;
			}

			if (updates.startedAt) {
				updateFields.push('startedAt', updates.startedAt);
				notifyFields.startedAt = updates.startedAt;
			}

			if (updates.completedAt) {
				updateFields.push('completedAt', updates.completedAt);
				notifyFields.completedAt = updates.completedAt;
			}

			// Always include updatedAt timestamp
			updateFields.push('updatedAt', timestamp);
			notifyFields.updatedAt = timestamp;

			// Update Redis hash
			if (updateFields.length > 0) {
				await this.redisCommand('HSET', [statusKey, ...updateFields]);

				// Reset expiration time
				await this.redisCommand('EXPIRE', [statusKey, this.options.statusTTL]);

				this.debug(`Updated job ${jobId} status: ${updates.status ?? 'fields updated'}`);

				// If this is a terminal status, track it for cleanup
				if (
					updates.status === JobStatus.COMPLETED ||
					updates.status === JobStatus.FAILED ||
					updates.status === JobStatus.CANCELLED
				) {
					// Get the message ID associated with this job
					const currentStatus = await this.getJobStatus(jobId, dispatchId, queueName);
					if (currentStatus.messageId) {
						this.trackCompletedMessage(currentStatus.messageId, this.getStreamKey(queueName));

						// Also notify handlers of job completion
						for (const handler of this.messageHandlers) {
							try {
								handler({
									type: 'job:result',
									jobId,
									dispatchId,
									queue: queueName,
									status: updates.status,
									error: updates.error,
									completedAt: updates.completedAt || timestamp,
									retries: parseInt(currentStatus.retries.toString(), 10)
								});
							} catch (handlerError) {
								this.error(`Error in message handler: ${handlerError}`);
							}
						}
					}
				} else {
					// For non-terminal statuses, just send a regular status update
					for (const handler of this.messageHandlers) {
						try {
							handler({
								...notifyFields,
								type: 'job:status',
								jobId,
								queue: queueName
							});
						} catch (handlerError) {
							this.error(`Error in message handler: ${handlerError}`);
						}
					}
				}
			}
		} catch (error) {
			this.error(`Failed to update job status: ${error}`);
			throw new Error(`Failed to update job status: ${error}`);
		}
	}

	/**
	 * Register a worker with this transport
	 */
	async registerWorker(workerId: string, queues: string[]): Promise<void> {
		try {
			for (const queue of queues) {
				const streamName = this.getStreamKey(queue);

				// Ensure stream exists
				await this.ensureStreamExists(streamName);

				// Ensure consumer group exists
				await this.ensureConsumerGroupExists(streamName);

				// Register worker in Redis using raw command
				const workerKey = this.getWorkerKey(workerId);
				await this.redisCommand('HSET', [
					workerKey,
					'id',
					workerId,
					'status',
					'active',
					'lastSeen',
					new Date().toISOString(),
					'queues',
					JSON.stringify(queues)
				]);

				// Set TTL to auto-expire if heartbeat stops
				await this.redisCommand('EXPIRE', [workerKey, '60']);

				this.debug(`Registered worker ${workerId} for queue ${queue}`);
			}

			// Send worker registration message
			await this.send({
				type: 'worker:register',
				workerId,
				queues
			});
		} catch (error) {
			this.error(`Failed to register worker: ${error}`);
			throw new Error(`Failed to register worker: ${error}`);
		}
	}

	/**
	 * Unregister a worker from this transport
	 */
	async unregisterWorker(workerId: string): Promise<void> {
		try {
			// Remove worker from Redis using raw command
			const workerKey = this.getWorkerKey(workerId);
			await this.redisCommand('DEL', [workerKey]);

			// Send worker unregistration message
			await this.send({
				type: 'worker:unregister',
				workerId
			});

			this.debug(`Unregistered worker ${workerId}`);
		} catch (error) {
			this.error(`Failed to unregister worker: ${error}`);
			throw new Error(`Failed to unregister worker: ${error}`);
		}
	}

	/**
	 * Start polling Redis for messages
	 */
	private startPolling(): void {
		this.pollTimer = setInterval(() => {
			this.pollMessages().catch((error) => {
				this.error(`Error polling messages: ${error}`);
			});
		}, this.options.pollInterval);
	}

	/**
	 * Poll for new messages
	 */
	private async pollMessages(): Promise<void> {
		if (this.mode !== 'consumer') {
			return;
		}

		// Poll each queue stream
		const queues = await this.getRegisteredQueues();

		for (const queue of queues) {
			const streamName = this.getStreamKey(queue);

			try {
				// Ensure consumer group exists
				await this.ensureConsumerGroupExists(streamName);

				let messages: { [stream: string]: Array<[string, string[]]> };

				if (this.checkLogs.get(queue) ?? true) {
					// Read pending messages first using raw command
					messages =
						(await this.redisCommand('XREADGROUP', [
							'GROUP',
							this.options.consumerGroup,
							this.consumerId,
							'COUNT',
							this.options.batchSize,
							'STREAMS',
							streamName,
							0
						])) ?? {};
				} else {
					// Then read new messages using raw command
					messages =
						(await this.redisCommand('XREADGROUP', [
							'GROUP',
							this.options.consumerGroup,
							this.consumerId,
							'COUNT',
							this.options.batchSize,
							'STREAMS',
							streamName,
							'>'
						])) ?? {};
				}

				await this.processMessages(messages[streamName], queue);
			} catch (error) {
				console.error(error);
				if (!String(error).includes('timeout')) {
					this.error(`Error reading from stream ${streamName}: ${error}`);
				}
			}
		}
	}

	/**
	 * Process messages from Redis stream
	 */
	private async processMessages(messages: Array<[string, string[]]>, queue: string): Promise<void> {
		if (!messages || messages.length === 0) {
			this.checkLogs.set(queue, !(this.checkLogs.get(queue) ?? true));
			return;
		}

		const streamName = this.getStreamKey(queue);

		for (const [messageId, fields] of messages) {
			try {
				// Convert Redis hash format back to message object
				const message = this.deserializeMessage(fields, queue);

				// Update last processed ID
				this.lastIds.set(streamName, messageId);

				// For job:process messages, first check if this is a duplicate
				if (message.type === 'job:process') {
					// Check if we already have status for this job
					const statusKey = this.getJobStatusKey(message.jobId, message.dispatchId, queue);
					const exists = await this.redisCommand('EXISTS', [statusKey]);

					if (exists) {
						const statusInfo = await this.getJobStatus(message.jobId, message.dispatchId, queue);
						if (statusInfo.status !== JobStatus.PENDING) {
							// Job already exists, skip processing
							this.debug(`Skipping duplicate job message for ${message.jobId}`);
							await this.redisCommand('XACK', [streamName, this.options.consumerGroup, messageId]);
							continue;
						}
					}
				}

				// Trigger message handlers
				for (const handler of this.messageHandlers) {
					try {
						await handler(message);
					} catch (error) {
						this.error(`Error in message handler: ${error}`);
					}
				}

				// Track completed or failed job messages for cleanup
				if (
					(message.type === 'job:result' || message.type === 'job:status') &&
					(message.status === JobStatus.COMPLETED ||
						message.status === JobStatus.FAILED ||
						message.status === JobStatus.CANCELLED)
				) {
					this.trackCompletedMessage(messageId, streamName);
				}

				// Acknowledge message
				await this.redisCommand('XACK', [streamName, this.options.consumerGroup, messageId]);
			} catch (error) {
				this.error(`Error processing message ${messageId}: ${error}`);
			}
		}
	}

	/**
	 * Get all registered queues
	 */
	private async getRegisteredQueues(): Promise<string[]> {
		try {
			const pattern = `${this.options.keyPrefix}:stream:*`;
			const keys = await this.redisCommand('KEYS', [pattern]);

			// Ensure keys is an array
			if (!Array.isArray(keys)) {
				return ['default'];
			}

			return keys
				.map((key) => key.replace(`${this.options.keyPrefix}:stream:`, ''))
				.filter(Boolean);
		} catch (error) {
			this.error(`Failed to get registered queues: ${error}`);
			return ['default']; // Return default queue on error
		}
	}

	/**
	 * Ensure a stream exists
	 */
	private async ensureStreamExists(streamName: string): Promise<void> {
		try {
			// Check if stream exists by trying to get info using raw command
			const streamInfo = await this.redisCommand('XINFO', ['STREAM', streamName]).catch(() => null);

			if (!streamInfo) {
				// Create stream with a dummy message that we'll remove
				const messageId = await this.redisCommand('XADD', [streamName, '*', 'init', 'true']);
				await this.redisCommand('XDEL', [streamName, messageId]);
				this.debug(`Created stream ${streamName}`);
			}
		} catch (error) {
			this.error(`Failed to ensure stream ${streamName} exists: ${error}`);
			// Don't throw - just log the error and continue
		}
	}

	/**
	 * Ensure a consumer group exists for a stream
	 */
	private async ensureConsumerGroupExists(streamName: string): Promise<void> {
		// Skip if already created
		if (this.consumerGroupCreated.has(streamName)) {
			return;
		}

		try {
			// Check if consumer group exists using raw command
			const groups = await this.redisCommand('XINFO', ['GROUPS', streamName]).catch(() => []);

			const groupExists =
				Array.isArray(groups) && groups.some((group) => group[1] === this.options.consumerGroup);

			if (!groupExists) {
				// Create consumer group from the beginning of the stream using raw command
				await this.redisCommand('XGROUP', [
					'CREATE',
					streamName,
					this.options.consumerGroup,
					'0',
					'MKSTREAM'
				]);
				this.debug(`Created consumer group ${this.options.consumerGroup} for stream ${streamName}`);
			}

			// Mark as created
			this.consumerGroupCreated.add(streamName);
		} catch (error: any) {
			// Check if this is a BUSYGROUP error
			if (error.toString().includes('BUSYGROUP')) {
				// Group already exists, which is fine
				this.debug(
					`Consumer group ${this.options.consumerGroup} already exists for stream ${streamName}`
				);

				// Mark as created since it exists
				this.consumerGroupCreated.add(streamName);
			} else {
				// This is a different error, log and rethrow
				this.error(`Failed to ensure consumer group exists: ${error}`);
				throw error;
			}
		}
	}

	/**
	 * Store job status in Redis
	 */
	private async storeJobStatus(status: JobStatusInfo): Promise<void> {
		try {
			const statusKey = this.getJobStatusKey(status.jobId, status.dispatchId, status.queue);

			// Store in Redis hash using raw command
			// Build array of hash field-value pairs
			const hashFields: string[] = [
				'jobId',
				status.jobId,
				'queue',
				status.queue,
				'status',
				status.status,
				'retries',
				status.retries.toString(),
				'createdAt',
				status.createdAt
			];

			// Add optional fields if present
			if (status.startedAt) {
				hashFields.push('startedAt', status.startedAt);
			}
			if (status.completedAt) {
				hashFields.push('completedAt', status.completedAt);
			}
			if (status.error) {
				hashFields.push('error', status.error);
			}
			if (status.messageId) {
				hashFields.push('messageId', status.messageId);
			}

			// Ensure updatedAt is set
			const updatedAt = status.updatedAt || Date.now().toString();
			hashFields.push('updatedAt', updatedAt);

			await this.redisCommand('HSET', [statusKey, ...hashFields]);

			// Set TTL using raw command
			await this.redisCommand('EXPIRE', [statusKey, this.options.statusTTL]);

			// If this is a new job with an initial status, notify any handlers
			if (status.status === JobStatus.PENDING || status.status === JobStatus.SCHEDULED_FOR_RETRY) {
				for (const handler of this.messageHandlers) {
					try {
						handler({
							type: 'job:status',
							jobId: status.jobId,
							dispatchId: status.dispatchId,
							queue: status.queue,
							status: status.status,
							createdAt: status.createdAt,
							updatedAt
						});
					} catch (error) {
						this.error(`Error in message handler: ${error}`);
					}
				}
			}

			// If this job is completed, failed, or cancelled, mark for stream cleanup
			if (
				status.status === JobStatus.COMPLETED ||
				status.status === JobStatus.FAILED ||
				status.status === JobStatus.CANCELLED
			) {
				// Try to find a message ID if we don't already have one
				let messageId: string | null = status.messageId ?? null;
				if (!messageId) {
					messageId = await this.findJobMessageId(status.jobId, status.dispatchId, status.queue);
				}

				if (messageId) {
					const streamKey = this.getStreamKey(status.queue);
					this.trackCompletedMessage(messageId, streamKey);

					// Notify handlers of job completion
					for (const handler of this.messageHandlers) {
						try {
							handler({
								type: 'job:result',
								jobId: status.jobId,
								dispatchId: status.dispatchId,
								queue: status.queue,
								status: status.status,
								error: status.error,
								completedAt: status.completedAt || new Date().toISOString(),
								retries: status.retries
							});
						} catch (error) {
							this.error(`Error in message handler: ${error}`);
						}
					}
				}
			}
		} catch (error) {
			this.error(`Failed to store job status: ${error}`);
			throw new Error(`Failed to store job status: ${error}`);
		}
	}

	/**
	 * Serialize a message for Redis
	 */
	private serializeMessage(message: TransportEvent): string[] {
		const fields: string[] = ['type', message.type, 'timestamp', Date.now().toString()];

		// Add queue if present in message type
		if ('queue' in message && typeof message.queue === 'string') {
			fields.push('queue', message.queue);
		}

		// Add message-specific fields
		switch (message.type) {
			case 'job:process':
				fields.push(
					'job',
					message.job,
					'args',
					JSON.stringify(message.args || []),
					'jobId',
					message.jobId,
					'dispatchId',
					message.dispatchId
				);

				// Add options if present
				if (message.options) {
					fields.push('options', JSON.stringify(message.options));
				}
				break;

			case 'job:cancel':
			case 'job:status':
			case 'job:result':
				fields.push('jobId', message.jobId);
				fields.push('dispatchId', message.dispatchId);
				if (message.type !== 'job:cancel' && message.status) {
					fields.push('status', message.status);
				}
				if (message.type !== 'job:cancel' && message.error) {
					fields.push('error', message.error);
				}
				if ((message as any).retries !== undefined) {
					fields.push('retries', (message as any).retries);
				}
				if ((message as any).startedAt) {
					fields.push('startedAt', (message as any).startedAt);
				}
				if ((message as any).completedAt) {
					fields.push('completedAt', (message as any).completedAt);
				}
				break;

			case 'job:cancelAll':
				// No additional fields needed
				break;

			case 'worker:register':
				fields.push('workerId', message.workerId, 'queues', JSON.stringify(message.queues ?? []));
				break;

			case 'worker:unregister':
				fields.push('workerId', message.workerId);
				break;

			case 'worker:status':
				fields.push(
					'workerId',
					message.workerId,
					'status',
					message.status,
					'queues',
					JSON.stringify(message.queues),
					'processing',
					message.processing.toString(),
					'waiting',
					message.waiting.toString()
				);
				break;

			case 'worker:ready':
				fields.push('id', message.id, 'queues', JSON.stringify(message.queues));
				if (message.status) {
					fields.push('status', message.status);
				}
				if (message.timestamp) {
					fields.push('timestamp', message.timestamp.toString());
				}
				break;
		}

		return fields;
	}

	/**
	 * Deserialize a message from Redis
	 */
	private deserializeMessage(fields: any[], queue: string): TransportEvent {
		// Convert array of field/value pairs to object
		const data: Record<string, string> = {};
		for (let i = 0; i < fields.length; i += 2) {
			data[fields[i]] = fields[i + 1];
		}

		const type = data.type as any;
		const baseMessage = { type, queue: data.queue || queue };

		switch (type) {
			case 'job:process':
				return {
					...baseMessage,
					type: 'job:process',
					job: data.job,
					args: JSON.parse(data.args || '[]'),
					options: data.options ? JSON.parse(data.options) : undefined,
					jobId: data.jobId,
					dispatchId: data.dispatchId
				};

			case 'job:cancel':
				return {
					...baseMessage,
					type: 'job:cancel',
					jobId: data.jobId,
					dispatchId: data.dispatchId
				};

			case 'job:cancelAll':
				return {
					...baseMessage,
					type: 'job:cancelAll'
				};

			case 'job:status':
				return {
					...baseMessage,
					type: 'job:status',
					jobId: data.jobId,
					dispatchId: data.dispatchId,
					status: data.status,
					error: data.error,
					retries: data.retries ? parseInt(data.retries, 10) : 0,
					startedAt: data.startedAt,
					completedAt: data.completedAt
				};

			case 'job:result':
				return {
					...baseMessage,
					type: 'job:result',
					jobId: data.jobId,
					dispatchId: data.dispatchId,
					status: data.status,
					error: data.error,
					completedAt: data.completedAt || new Date().toISOString()
				};

			case 'worker:register':
				return {
					...baseMessage,
					type: 'worker:register',
					workerId: data.workerId,
					queues: data.queues ? JSON.parse(data.queues) : []
				};

			case 'worker:unregister':
				return {
					...baseMessage,
					type: 'worker:unregister',
					workerId: data.workerId
				};

			case 'worker:status':
				return {
					...baseMessage,
					type: 'worker:status',
					workerId: data.workerId,
					queues: data.queues ? JSON.parse(data.queues) : [],
					status: data.status as any,
					processing: parseInt(data.processing || '0', 10),
					waiting: parseInt(data.waiting || '0', 10)
				};

			case 'worker:ready':
				return {
					...baseMessage,
					type: 'worker:ready',
					id: data.id,
					queues: data.queues ? JSON.parse(data.queues) : [],
					status: data.status,
					timestamp: data.timestamp ? parseInt(data.timestamp, 10) : undefined
				};

			default:
				// Unknown message type
				return baseMessage as any;
		}
	}

	/**
	 * Get Redis key for a stream
	 */
	private getStreamKey(queue: string): string {
		return `${this.options.keyPrefix}:stream:${queue || 'default'}`;
	}

	/**
	 * Get Redis key for job status
	 */
	private getJobStatusKey(jobId: string, dispatchId: string, queue: string): string {
		return `${this.options.keyPrefix}:status:${queue}:${jobId}:${dispatchId}`;
	}

	/**
	 * Get Redis key for worker status
	 */
	private getWorkerKey(workerId: string): string {
		return `${this.options.keyPrefix}:worker:${workerId}`;
	}

	/**
	 * Track completed message for later cleanup
	 */
	private trackCompletedMessage(messageId: string, streamKey: string): void {
		// Only track if cleanup is enabled
		if (this.options.cleanupCompletedJobs) {
			this.completedMessageIds.set(messageId, {
				streamKey,
				timestamp: Date.now()
			});
			this.debug(`Marked message ${messageId} for future cleanup`);
		}
	}

	/**
	 * Schedule periodic stream cleanup
	 */
	private scheduleStreamCleanup(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
		}

		// Run cleanup every 5 minutes
		const cleanupInterval = 5 * 60 * 1000;

		this.cleanupTimer = setInterval(() => {
			this.cleanupStreams().catch((error) => {
				this.error(`Error during stream cleanup: ${error}`);
			});
		}, cleanupInterval);

		this.debug(`Scheduled stream cleanup every ${cleanupInterval / 1000} seconds`);
	}

	/**
	 * Find expired message IDs for cleanup
	 */
	private async cleanupStreams(): Promise<void> {
		if (!this.options.cleanupCompletedJobs) {
			return;
		}

		this.debug('Starting stream cleanup for completed jobs');

		const now = Date.now();
		const retentionMs = this.options.completedJobRetention * 1000;
		const expiredIds = new Map<string, string[]>(); // streamKey -> message IDs
		const expiredStatusKeys: string[] = []; // status keys to delete

		// Find all queues
		const queues = await this.getRegisteredQueues();

		// For each queue, find completed jobs older than retention period
		for (const queueName of queues) {
			const streamKey = this.getStreamKey(queueName);

			try {
				// Get all status keys for this queue
				const statusPattern = `${this.options.keyPrefix}:status:${queueName}:*`;
				const statusKeys: string[] = await this.redisCommand('KEYS', [statusPattern]);

				for (const statusKey of statusKeys) {
					// Get job status
					const statusData = await this.redisCommand('HGETALL', [statusKey]);
					if (!statusData || statusData.length === 0) continue;

					// Convert to object
					const status: Record<string, string> = {};
					for (let i = 0; i < statusData.length; i += 2) {
						status[statusData[i]] = statusData[i + 1];
					}

					// Check if job is completed and older than retention period
					if (
						(status.status === JobStatus.COMPLETED ||
							status.status === JobStatus.FAILED ||
							status.status === JobStatus.CANCELLED) &&
						status.updatedAt &&
						now - parseInt(status.updatedAt) > retentionMs
					) {
						// Extract job ID from status key
						const parts = statusKey.split(':');
						const dispatchId = parts.pop()!;
						const jobId = parts.pop()!;

						// Add status key to list for deletion
						expiredStatusKeys.push(statusKey);

						// If we have the message ID stored, use it directly
						if (status.messageId) {
							if (!expiredIds.has(streamKey)) {
								expiredIds.set(streamKey, []);
							}
							expiredIds.get(streamKey)!.push(status.messageId);
						} else {
							// Otherwise try to find the message ID
							const messageId = await this.findJobMessageId(jobId, dispatchId, queueName);

							if (messageId) {
								if (!expiredIds.has(streamKey)) {
									expiredIds.set(streamKey, []);
								}
								expiredIds.get(streamKey)!.push(messageId);
							}
						}
					}
				}
			} catch (error) {
				this.error(`Error finding completed jobs for queue ${queueName}: ${error}`);
			}
		}

		// Delete expired messages from each stream
		for (const [streamKey, messageIds] of expiredIds.entries()) {
			if (messageIds.length > 0) {
				try {
					// Delete messages in batches of 100
					for (let i = 0; i < messageIds.length; i += 100) {
						const batch = messageIds.slice(i, i + 100);
						await this.redisCommand('XDEL', [streamKey, ...batch]);
					}

					this.debug(`Cleaned up ${messageIds.length} completed messages from stream ${streamKey}`);

					// Remove from tracking map
					for (const messageId of messageIds) {
						this.completedMessageIds.delete(messageId);
					}
				} catch (error) {
					this.error(`Error deleting completed messages from stream ${streamKey}: ${error}`);
				}
			}
		}

		// Delete expired status keys
		if (expiredStatusKeys.length > 0) {
			try {
				// Delete in batches of 100
				for (let i = 0; i < expiredStatusKeys.length; i += 100) {
					const batch = expiredStatusKeys.slice(i, i + 100);
					await this.redisCommand('DEL', batch);
				}

				this.debug(`Cleaned up ${expiredStatusKeys.length} job status records`);
			} catch (error) {
				this.error(`Error deleting expired status keys: ${error}`);
			}
		}

		// Trim all streams to max size if configured
		if (this.options.maxStreamSize > 0) {
			await this.trimStreamsToMaxSize();
		}
	}

	/**
	 * Trim all streams to the maximum configured size
	 */
	private async trimStreamsToMaxSize(): Promise<void> {
		try {
			const queues = await this.getRegisteredQueues();

			for (const queue of queues) {
				const streamKey = this.getStreamKey(queue);

				// Get stream length
				const streamLength = await this.redisCommand('XLEN', [streamKey]);

				if (streamLength > this.options.maxStreamSize) {
					// Trim the stream to maxStreamSize entries
					await this.redisCommand('XTRIM', [
						streamKey,
						'MAXLEN',
						'~', // Approximate trimming for better performance
						this.options.maxStreamSize.toString()
					]);

					this.debug(
						`Trimmed stream ${streamKey} from ${streamLength} to ~${this.options.maxStreamSize} entries`
					);
				}
			}
		} catch (error) {
			this.error(`Error trimming streams to max size: ${error}`);
		}
	}

	/**
	 * Check if a job with the same ID is currently locked
	 * @param jobId The job ID to check
	 * @param queue The queue name
	 * @returns True if the job is locked, false otherwise
	 */
	public async isJobLocked(jobId: string, queue: string): Promise<boolean> {
		// First check local cache
		const localLock = this.jobLocks.get(jobId);
		if (localLock && localLock.lockedUntil > Date.now()) {
			return true;
		}

		// Check Redis for distributed lock
		const lockKey = `${this.options.keyPrefix}:lock:${queue}:${jobId}`;
		const lockExists = await this.redisCommand('EXISTS', [lockKey]);

		return !!lockExists;
	}

	/**
	 * Acquire a lock for a job ID
	 * @param jobId The job ID to lock
	 * @param queue The queue name
	 * @param duration Duration in milliseconds to lock the job
	 * @returns True if lock was acquired, false otherwise
	 */
	public async acquireJobLock(
		jobId: string,
		queue: string,
		duration: number = 60000
	): Promise<boolean> {
		const lockKey = `${this.options.keyPrefix}:lock:${queue}:${jobId}`;

		// Try to set lock in Redis with NX (only if not exists)
		const result = await this.redisCommand('SET', [
			lockKey,
			Date.now().toString(),
			'PX',
			duration.toString(),
			'NX'
		]);

		if (result === 'OK') {
			// Also store in local cache
			this.jobLocks.set(jobId, { lockedUntil: Date.now() + duration, queue });
			return true;
		}

		return false;
	}

	/**
	 * Release a lock for a job ID
	 * @param jobId The job ID to unlock
	 * @param queue The queue name
	 */
	public async releaseJobLock(jobId: string, queue: string): Promise<void> {
		const lockKey = `${this.options.keyPrefix}:lock:${queue}:${jobId}`;

		// Remove from Redis
		await this.redisCommand('DEL', [lockKey]);

		// Remove from local cache
		this.jobLocks.delete(jobId);
	}
}
