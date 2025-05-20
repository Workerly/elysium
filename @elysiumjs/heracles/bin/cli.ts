#!/usr/bin/env bun

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
import type { Worker } from '../src';

import path from 'node:path';

import { Redis } from '@elysiumjs/core';
import { JobStatus, RedisWorker } from '@elysiumjs/heracles';
import { Command } from 'commander';

/**
 * Initialize Heracles CLI
 */
const program = new Command();

program
	.name('heracles')
	.description('CLI for managing Heracles workers and job queues')
	.version('1.0.0');

/**
 * Load configuration from a file
 * @author Axel Nana <axel.nana@workbud.com>
 */
async function loadConfig(configPath: string): Promise<Record<string, any>> {
	try {
		const configFile = Bun.file(path.resolve(process.cwd(), configPath));
		if (!(await configFile.exists())) {
			console.error(`Configuration file not found: ${configFile}`);
			process.exit(1);
		}

		return await configFile.json();
	} catch (error: any) {
		console.error(`Error loading configuration: ${error.message}`);
		process.exit(1);
	}
}

/**
 * Command to start workers
 */
program
	.command('work')
	.description('Start a worker for specific queues')
	.requiredOption('--id <ID>', 'Unique identifier for this worker')
	.option('-q, --queues <queues>', 'Comma-separated list of queues', 'default')
	.option('-c, --concurrency <count>', 'Number of concurrent jobs per worker', '1')
	.option('-r, --redis <name>', 'Redis connection name for Redis transport', 'default')
	.option('--config <path>', 'Path to configuration file', '')
	.option('--max-retries <count>', 'Maximum retries for failed jobs', '3')
	.option('--retry-delay <ms>', 'Delay between retries in milliseconds', '5000')
	.option('--pause-on-error', 'Pause queue when error occurs', false)
	.action(
		async (options: {
			id: string;
			queues: string;
			concurrency: string;
			redis: string;
			config: string;
			maxRetries: string;
			retryDelay: string;
			pauseOnError: boolean;
		}) => {
			// Load configuration from file if provided
			let config = {};
			if (options.config) {
				config = loadConfig(options.config);
				// Override config with command line options
				options = { ...config, ...options };
			}

			const queues = options.queues.split(',').map((q) => q.trim());
			const concurrency = parseInt(options.concurrency, 10);
			const maxRetries = parseInt(options.maxRetries, 10);
			const retryDelay = parseInt(options.retryDelay, 10);
			const pauseOnError = Boolean(options.pauseOnError);

			console.log(`Starting worker for queues: ${queues.join(', ')}`);
			console.log(`Concurrency: ${concurrency} jobs per worker`);

			// Create workers based on transport type
			const workers: Worker[] = [];

			try {
				// Ensure Redis connection exists
				if (!Redis.connectionExists(options.redis)) {
					console.error(`Redis connection '${options.redis}' does not exist`);
					console.error('Please register the Redis connection before starting workers');
					process.exit(1);
				}

				const worker = new RedisWorker(options.redis, { id: options.id });

				// Configure queues
				for (const queueName of queues) {
					await worker.createQueue({
						name: queueName,
						concurrency,
						maxRetries,
						retryDelay,
						pauseOnError
					});
				}

				// Start worker
				await worker.start();
				workers.push(worker);

				console.log(`Worker started successfully ID: ${worker.id}`);

				// Handle process termination
				const cleanup = async () => {
					console.log('\nStopping worker gracefully...');

					for (const worker of workers) {
						await worker.stop(false);
						console.log(`Worker ${worker.id} stopped`);
					}

					console.log('All workers stopped');
					process.exit(0);
				};

				process.on('SIGINT', cleanup);
				process.on('SIGTERM', cleanup);

				// Keep process running
				console.log('Press Ctrl+C to stop workers');
			} catch (error: any) {
				console.error(`Error starting workers: ${error.message}`);
				console.error(error.stack);
				process.exit(1);
			}
		}
	);

/**
 * Command to clean up Redis streams
 */
program
	.command('cleanup')
	.description('Clean up Redis streams by removing completed and failed jobs')
	.option('-r, --redis <name>', 'Redis connection name', 'default')
	.option('-q, --queues <queues>', 'Comma-separated list of queues (all if not specified)')
	.option('-a, --all', 'Remove all entries, not just completed ones', false)
	.option('-k, --keyprefix <prefix>', 'Redis key prefix', 'elysium:heracles')
	.option('-t, --retention <seconds>', 'Time to retain completed jobs in seconds', '3600')
	.option('-m, --max <count>', 'Maximum stream size to trim to', '1000')
	.option('-s, --status-only', 'Only clean up job status keys, not stream entries', false)
	.option('--dry-run', 'Show what would be removed without actually removing', false)
	.action(
		async (options: {
			redis: string;
			queues?: string;
			all: boolean;
			keyprefix: string;
			retention: string;
			max: string;
			dryRun: boolean;
			statusOnly: boolean;
		}) => {
			try {
				// Ensure Redis connection exists
				if (!Redis.connectionExists(options.redis)) {
					console.error(`Redis connection '${options.redis}' does not exist`);
					process.exit(1);
				}

				const redisClient = Redis.getConnection(options.redis);
				const keyPrefix = options.keyprefix;
				const retention = parseInt(options.retention);
				const maxStreamSize = parseInt(options.max);

				// Get queues to process
				let queues: string[];
				if (options.queues) {
					queues = options.queues.split(',').map((q) => q.trim());
				} else {
					// Find all streams with the given prefix
					const keys = await redisClient.send('KEYS', [`${keyPrefix}:stream:*`]);
					queues = keys.map((key: string) => key.replace(`${keyPrefix}:stream:`, ''));
				}

				console.log(`=== Redis Stream Cleanup ===`);
				console.log(`Redis connection: ${options.redis}`);
				console.log(`Key prefix: ${keyPrefix}`);
				console.log(`Queues to clean: ${queues.join(', ') || 'none found'}`);
				console.log(`Retention period: ${retention} seconds`);
				console.log(`Maximum stream size: ${maxStreamSize}`);
				console.log(`Status only mode: ${options.statusOnly ? 'Yes' : 'No'}`);
				console.log(`Dry run mode: ${options.dryRun ? 'Yes' : 'No'}`);

				if (queues.length === 0) {
					console.log('No streams found to clean up');
					return;
				}

				let totalRemoved = 0;
				let totalTrimmed = 0;
				let totalStatusRemoved = 0;

				for (const queue of queues) {
					const streamKey = `${keyPrefix}:stream:${queue}`;

					// Get stream info
					let streamLength;
					try {
						streamLength = await redisClient.send('XLEN', [streamKey]);
						console.log(`\nQueue: ${queue}`);
						console.log(`- Current stream length: ${streamLength}`);
					} catch (e) {
						console.log(`\nQueue: ${queue} - stream not found or empty`);
						continue;
					}

					if (options.all) {
						// Delete all entries in the stream
						if (!options.dryRun) {
							await redisClient.send('DEL', [streamKey]);
							console.log(`- Deleted entire stream (${streamLength} entries)`);
							totalRemoved += streamLength;
						} else {
							console.log(`- Would delete entire stream (${streamLength} entries)`);
						}
					} else {
						// Find completed jobs
						if (retention > 0) {
							// Find status entries for completed/failed jobs
							const statusKeys = await redisClient.send('KEYS', [`${keyPrefix}:status:${queue}:*`]);
							const completedIds = [];

							for (const statusKey of statusKeys) {
								const status = await redisClient.send('HGET', [statusKey, 'status']);
								const updatedAt = await redisClient.send('HGET', [statusKey, 'updatedAt']);

								if (
									(status === JobStatus.COMPLETED ||
										status === JobStatus.FAILED ||
										status === JobStatus.CANCELLED) &&
									updatedAt &&
									parseInt(updatedAt) < Date.now() - retention * 1000
								) {
									// Extract job ID from status key
									const jobId = statusKey.split(':').pop();

									// Check if the status has a messageId field (direct link to stream entry)
									const messageId = await redisClient.send('HGET', [statusKey, 'messageId']);

									if (messageId) {
										// We have a direct reference to the message ID
										completedIds.push(messageId);
									} else {
										// Fall back to searching the stream
										const messages = await redisClient.send('XRANGE', [
											streamKey,
											'-',
											'+',
											'COUNT',
											'1000'
										]);

										for (const [msgId, fields] of messages) {
											// Check if this message is for the completed job
											const fieldsObj: Record<string, string> = {};
											for (let i = 0; i < fields.length; i += 2) {
												fieldsObj[fields[i]] = fields[i + 1];
											}

											if (
												(fieldsObj.jobId === jobId || msgId.includes(jobId)) &&
												(fieldsObj.type === 'job:result' ||
													fieldsObj.type === 'job:status' ||
													fieldsObj.type === 'job:process')
											) {
												completedIds.push(msgId);
											}
										}
									}

									// Add status key to a list for deletion
									if (!options.dryRun) {
										await redisClient.send('DEL', [statusKey]);
										totalStatusRemoved++;
									}
								}
							}

							if (completedIds.length > 0) {
								console.log(`- Found ${completedIds.length} expired completed job entries`);

								if (!options.dryRun && !options.statusOnly) {
									// Delete in batches of 100
									for (let i = 0; i < completedIds.length; i += 100) {
										const batch = completedIds.slice(i, i + 100);
										await redisClient.send('XDEL', [streamKey, ...batch]);
									}
									console.log(
										`- Removed ${completedIds.length} expired completed job entries from stream`
									);
									totalRemoved += completedIds.length;
								} else if (options.dryRun) {
									console.log(
										`- Would remove ${completedIds.length} expired completed job entries from stream`
									);
								} else {
									console.log(
										`- Skipped removing ${completedIds.length} stream entries (status-only mode)`
									);
								}
							} else {
								console.log(`- No expired completed job entries found`);
							}
						}

						// Trim stream to max size if specified
						if (maxStreamSize > 0 && streamLength > maxStreamSize) {
							if (!options.dryRun && !options.statusOnly) {
								await redisClient.send('XTRIM', [
									streamKey,
									'MAXLEN',
									'~', // Approximate trimming for better performance
									maxStreamSize.toString()
								]);
								console.log(`- Trimmed stream from ${streamLength} to ~${maxStreamSize} entries`);
								totalTrimmed += streamLength - maxStreamSize;
							} else if (options.dryRun) {
								console.log(
									`- Would trim stream from ${streamLength} to ~${maxStreamSize} entries`
								);
							} else {
								console.log(`- Skipped trimming stream (status-only mode)`);
							}
						}
					}
				}

				console.log(`\n=== Cleanup Summary ===`);
				if (options.dryRun) {
					console.log(`This was a dry run. No changes were made.`);
					console.log(
						`Would have removed ${totalRemoved} stream entries, ${totalStatusRemoved} status records, and trimmed ~${totalTrimmed} entries`
					);
				} else {
					console.log(
						`Removed ${totalRemoved} stream entries, ${totalStatusRemoved} status records, and trimmed ~${totalTrimmed} entries`
					);
				}
			} catch (error: any) {
				console.error(`Error cleaning up Redis streams: ${error.message}`);
				console.error(error.stack);
				process.exit(1);
			}
		}
	);

// Run the CLI
program.parse();
