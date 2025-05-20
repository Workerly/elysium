# Heracles Usage Guide

This document provides a practical guide to using the Heracles job processing framework in your Elysium.js application.

## Installation

```bash
bun add @elysiumjs/heracles
```

## Basic Concepts

- **Jobs**: Background tasks defined as classes
- **Queues**: Lists of jobs waiting to be processed
- **Workers**: Processes that execute jobs from queues
- **Transports**: Communication channels between queues and workers
- **Worker Pool**: Efficiently distributes jobs to workers

## Creating Jobs

Jobs are defined as classes that extend the `Job` base class:

```typescript
import { Job } from '@elysiumjs/heracles';

@Job.register({
	queue: 'emails', // Queue to process this job
	maxRetries: 3, // Max retry attempts
	retryDelay: 5000 // Delay between retries (ms)
})
export class SendEmailJob extends Job {
	constructor(
		private readonly to: string,
		private readonly subject: string,
		private readonly body: string
	) {
		super(); // Required
	}

	protected async execute(): Promise<void> {
		// Your job implementation here
		console.log(`Sending email to ${this.to}: ${this.subject}`);

		// Use this.debug(), this.info(), this.warning(), this.error() for logging
		this.info(`Email sent successfully to ${this.to}`);
	}
}
```

## Dispatching Jobs

```typescript
import { Queue, RedisTransport } from '@elysiumjs/heracles';

import { SendEmailJob } from './jobs/send-email.job';

// Get the queue with Redis transport
const emailQueue = Queue.get('emails', {
	transport: RedisTransport,
	transportOptions: {
		connection: 'default' // Redis connection name
	}
});

// Dispatch a job
await emailQueue.dispatch(SendEmailJob, [
	'user@example.com',
	'Welcome!',
	'Welcome to our service!'
]);

// With additional options
await emailQueue.dispatch(
	SendEmailJob,
	['user@example.com', 'Welcome!', 'Welcome to our service!'],
	{
		priority: 5, // Higher priority (lower number)
		scheduledFor: new Date(Date.now() + 3600000), // Run in 1 hour
		maxRetries: 5, // Override max retries
		retryDelay: 10000 // Override retry delay
	}
);
```

## Queue Management

```typescript
// Create a custom queue with Redis transport
const queue = Queue.get('emails', {
	concurrency: 5, // Process 5 jobs simultaneously
	maxRetries: 3, // Default retries for failed jobs
	retryDelay: 5000, // Default delay between retries
	pauseOnError: false, // Don't pause on error
	transport: RedisTransport, // Redis transport
	transportOptions: {
		// Transport-specific options
		connection: 'default',
		keyPrefix: 'myapp:jobs'
	}
});

// Queue operations
await queue.pause(); // Pause processing
await queue.resume(); // Resume processing
await queue.drain(); // Complete current jobs, don't accept new ones
await queue.clear(); // Clear all jobs from queue
await queue.cancelJob('job_id'); // Cancel specific job
await queue.cancelAllJobs(); // Cancel all jobs
```

## Starting Workers

### Using the CLI

```bash
# Start a Redis worker for one queue
bun heracles work --id worker-1 --queues=emails --concurrency=3 --redis=default

# Start a Redis worker for multiple queues
bun heracles work --id worker-2 --queues=emails,notifications --redis=default --concurrency=4
```

CLI options:

- `--id`: Unique identifier for this worker (required)
- `--queues`: Comma-separated list of queues (default: "default")
- `--concurrency`: Number of concurrent jobs per worker (default: 1)
- `--redis`: Redis connection name (default: "default")
- `--max-retries`: Maximum retries for failed jobs (default: 3)
- `--retry-delay`: Delay between retries in milliseconds (default: 5000)
- `--pause-on-error`: Pause queue when error occurs (default: false)
- `--config`: Path to configuration file for more complex setups

### Programmatically

```typescript
import { RedisWorker } from '@elysiumjs/heracles';

// Create a Redis worker with a unique ID
const worker = new RedisWorker('default', { id: 'worker-1' });

// Add queues to the worker
await worker.createQueue({
	name: 'emails',
	concurrency: 3,
	maxRetries: 5,
	retryDelay: 5000
});

// Start the worker
await worker.start();
```

## Redis Setup

Heracles uses Redis Streams as its transport layer, enabling distributed job processing across multiple servers, applications, or processes. This section explains how to set up and configure Redis for Heracles.

### 1. Configure Redis Connection

First, register a Redis connection in your application:

```typescript
import { Redis } from '@elysiumjs/core';

// Register a Redis connection
Redis.registerConnection('default', {
	url: 'redis://localhost:6379'
	// Other Redis options like password, tls, etc.
});
```

### 2. Configure Queue with Redis

Configure your queues to use Redis:

```typescript
import { Queue, RedisTransport } from '@elysiumjs/heracles';

const queue = Queue.get('emails', {
	transport: RedisTransport,
	transportOptions: {
		connection: 'default', // Redis connection name
		keyPrefix: 'myapp:jobs', // Prefix for Redis keys (default: 'elysium:heracles')
		consumerGroup: 'workers', // Redis consumer group name (default: 'workers')

		// Stream cleanup options
		cleanupCompletedJobs: true, // Auto-cleanup completed jobs (default: true)
		completedJobRetention: 3600, // Seconds to keep completed jobs (default: 3600 - 1 hour)
		maxStreamSize: 1000, // Maximum stream size to maintain (default: 1000)

		// Advanced options
		pollInterval: 1000, // Polling interval in milliseconds (default: 1000)
		batchSize: 10, // Batch size for reading messages (default: 10)
		statusTTL: 86400, // Time to live for job status in seconds (default: 86400 - 24 hours)
		consumerName: 'consumer-xyz' // Unique consumer name (optional, auto-generated if not provided)
	}
});
```

### 3. Understanding Heracles Architecture

Heracles uses Redis Streams as the message broker for job coordination:

- **Producer Mode**: The application that dispatches jobs operates as a producer
- **Consumer Mode**: Worker processes operate as consumers that process jobs
- **Job Status Storage**: Each job's status is stored in a Redis hash for quick updates
- **Streams**: One stream per queue for reliable, ordered message delivery
- **Consumer Groups**: Ensures each job is processed by only one worker

### 4. Efficient Storage Architecture

Heracles implements an efficient Redis storage strategy:

- **Status Hashes**: Job status is tracked in dedicated Redis hashes for quick updates
- **Minimal Storage**: Single entry per job in the Redis stream to minimize storage usage
- **In-place Updates**: Status updates modify the existing job status hash instead of creating new entries
- **Automatic Cleanup**: Background process runs every 5 minutes, removing completed job entries older than the retention period
- **Stream Trimming**: Streams are automatically trimmed to the maximum size to prevent unbounded growth
- **Job Locking**: Support for job locking to prevent concurrent execution of jobs with the same ID

## Job Status Lifecycle

1. **PENDING**: Job is queued but not yet started
2. **RUNNING**: Job is currently executing
3. **COMPLETED**: Job completed successfully
4. **FAILED**: Job failed (may be retried if retries available)
5. **CANCELLED**: Job was cancelled
6. **SCHEDULED_FOR_RETRY**: Job failed and scheduled for retry

## Deployment Strategies

### Distributed Deployment

Heracles is designed for distributed deployment across multiple servers, processes, or applications:

#### 1. Configure Redis in Applications

In all applications that dispatch or process jobs:

```typescript
import { Redis } from '@elysiumjs/core';

// Register the same Redis connection across all applications
Redis.registerConnection('default', {
	url: 'redis://your-redis-server:6379'
});
```

#### 2. Configure Job Dispatch in Producer Applications

```typescript
import { Queue, RedisTransport } from '@elysiumjs/heracles';

// Create queues with Redis transport
const emailQueue = Queue.get('emails', {
	transport: RedisTransport,
	transportOptions: {
		connection: 'default',
		keyPrefix: 'myapp:jobs' // Use consistent prefix across all applications
	}
});

// Dispatch jobs as usual
await emailQueue.dispatch(SendEmailJob, [
	'user@example.com',
	'Welcome!',
	'Welcome to our service!'
]);
```

#### 3. Start Workers on Multiple Servers

```bash
# Server 1 (handles email jobs)
bun heracles work --id worker-emails-1 --queues=emails --redis=default --concurrency=4

# Server 2 (handles notification jobs)
bun heracles work --id worker-notifications-1 --queues=notifications --redis=default --concurrency=4

# Server 3 (handles heavy processing jobs)
bun heracles work --id worker-processing-1 --queues=processing --redis=default --concurrency=1
```

#### 4. Start Workers Programmatically

For more control, you can start workers programmatically:

```typescript
import { RedisWorker } from '@elysiumjs/heracles';

// Create worker for specific queues
const worker = new RedisWorker('default', {
	id: 'worker-emails-1', // Unique worker ID
	keyPrefix: 'myapp:jobs' // Match queue prefix
});

// Configure queues with specific settings
await worker.createQueue({
	name: 'emails',
	concurrency: 4,
	maxRetries: 5,
	retryDelay: 10000
});

// Start the worker
await worker.start();

// Graceful shutdown
process.on('SIGTERM', async () => {
	await worker.stop(false); // false = finish processing current jobs
});
```

## Monitoring and Maintenance

When running Heracles in production, proper monitoring and maintenance is essential.

### Automatic Maintenance

Heracles automatically manages Redis streams:

1. **Auto Cleanup**: Every 5 minutes, completed jobs older than the retention period are removed
2. **Stream Trimming**: Streams are trimmed to the maximum size to prevent unbounded growth
3. **Status TTL**: Job status records have a configurable TTL (default: 24 hours)

### Manual Cleanup with CLI

For manual maintenance or scheduled cleanup, use the CLI:

```bash
# Basic cleanup with default settings
bun heracles cleanup --redis=default

# Targeted cleanup for specific queues
bun heracles cleanup --redis=default --queues=emails,notifications \
  --keyprefix=myapp:jobs --retention=3600 --max=1000

# Only clean up job status keys, preserve stream entries
bun heracles cleanup --status-only

# Preview what would be removed without making changes
bun heracles cleanup --dry-run

# Remove all entries from streams (use with caution!)
bun heracles cleanup --all
```

#### Cleanup Command Options

| Option          | Description                                          | Default            |
| --------------- | ---------------------------------------------------- | ------------------ |
| `--redis`       | Redis connection name                                | "default"          |
| `--queues`      | Comma-separated list of queues to clean up           | All queues         |
| `--keyprefix`   | Redis key prefix                                     | "elysium:heracles" |
| `--retention`   | Seconds to retain completed jobs before removal      | 3600 (1 hour)      |
| `--max`         | Maximum stream size to trim to                       | 1000               |
| `--status-only` | Only clean up job status keys, not stream entries    | false              |
| `--dry-run`     | Show what would be removed without actually removing | false              |
| `--all`         | Remove all entries, not just completed ones          | false              |

### Monitoring Redis Keys

Heracles uses the following Redis key patterns:

- `{keyPrefix}:stream:{queueName}` - Redis streams for each queue
- `{keyPrefix}:status:{queueName}:{jobId}:{dispatchId}` - Job status hashes
- `{keyPrefix}:lock:{queueName}:{jobId}` - Locks for NO_OVERLAP jobs
- `{keyPrefix}:worker:{workerId}` - Worker registration information

You can monitor these using Redis CLI or monitoring tools:

```bash
# Count stream entries
redis-cli XLEN elysium:heracles:stream:emails

# View active workers
redis-cli KEYS elysium:heracles:worker:*

# Count job status records
redis-cli KEYS elysium:heracles:status:emails:* | wc -l
```

## Advanced Features

### Job Overlap Behavior Control

You can control how multiple instances of the same job are handled using the `JobOverlapBehavior` setting:

```typescript
import { Job, JobOverlapBehavior } from '@elysiumjs/heracles';

@Job.register({
	queue: 'emails',
	overlapBehavior: JobOverlapBehavior.NO_OVERLAP, // Prevent parallel execution of same job ID
	overlapDelay: 5000 // Wait 5 seconds after job completion before starting next one
})
export class SendEmailJob extends Job {
	// Job implementation...
}
```

This ensures that even across multiple workers on different servers, only one instance of a job with the same ID runs at a time.

### Advanced Redis Configuration

For advanced Redis setups like Redis Cluster or Sentinel, configure the Redis connection appropriately:

```typescript
import { Redis } from '@elysiumjs/core';

// Example with Redis Sentinel
Redis.registerConnection('sentinel', {
	sentinel: {
		sentinels: [
			{ host: '192.168.1.1', port: 26379 },
			{ host: '192.168.1.2', port: 26379 }
		],
		name: 'mymaster'
	},
	password: 'your-password'
});

// Use in queue configuration
const queue = Queue.get('emails', {
	transport: RedisTransport,
	transportOptions: {
		connection: 'sentinel'
		// Other options...
	}
});
```

### Worker Pool Management

When running multiple workers, they efficiently distribute workload through Redis:

```typescript
import { RedisWorker } from '@elysiumjs/heracles';

// Create multiple workers for the same queues
const worker1 = new RedisWorker('default', { id: 'worker-1' });
const worker2 = new RedisWorker('default', { id: 'worker-2' });

// Register both for the same queues
await worker1.createQueue({ name: 'emails', concurrency: 3 });
await worker2.createQueue({ name: 'emails', concurrency: 3 });

// Start both workers
await worker1.start();
await worker2.start();

// Jobs dispatched to the 'emails' queue will be automatically
// distributed between worker1 and worker2 by Redis consumer groups
```

## Best Practices

1. **Job Design**: Keep jobs small and focused on a single task
2. **Queue Organization**: Group similar jobs in the same queue
3. **Error Handling**: Implement proper error handling in your execute method
4. **Idempotent Jobs**: Design jobs to be safely retried
5. **Monitoring**: Regularly check worker status and queue sizes
6. **Resource Management**: Adjust concurrency based on the job's resource requirements

## Error Handling and Retries

Heracles automatically handles retries for failed jobs:

```typescript
@Job.register({
	queue: 'emails',
	maxRetries: 5, // Max retry attempts
	retryDelay: 10000 // 10 seconds between retries
})
export class SendEmailJob extends Job {
	protected async execute(): Promise<void> {
		try {
			// Your job logic
		} catch (error) {
			// Log error details
			this.error(`Failed to send email: ${error.message}`);

			// Throwing the error will mark the job as failed
			// and trigger retry if retries are available
			throw error;
		}
	}
}
```

## Configuration File for Workers

For consistent worker configuration in production environments, create a JSON configuration file:

```json
{
	"id": "worker-email-prod-1",
	"queues": "emails,notifications,processing",
	"redis": "default",
	"concurrency": 3,
	"maxRetries": 5,
	"retryDelay": 10000,
	"pauseOnError": false,
	"keyPrefix": "myapp:jobs"
}
```

Then use it with the CLI:

```bash
bun heracles work --config=heracles.json
```

This approach ensures consistent configuration across all worker instances and simplifies deployment scripts.

### Performance Considerations

When running Heracles in production:

1. **Redis Connection Pool**: Configure appropriate connection pool size in your Redis client
2. **Key Expiration**: Set appropriate retention periods to avoid memory growth
3. **Stream Size**: Monitor stream sizes and adjust `maxStreamSize` accordingly
4. **Cleanup Schedule**: Run regular cleanup jobs during off-peak hours
5. **Concurrency Settings**: Balance worker concurrency based on job complexity and server resources
6. **Worker Distribution**: Distribute workers across multiple servers for high availability

By following these practices, you can build a robust, scalable job processing system with Heracles.
