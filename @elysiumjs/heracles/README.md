# Heracles

> Robust background job processing for Elysium.js applications

Heracles is a powerful background job processing system for Elysium.js applications. It provides a flexible and scalable solution for running tasks in the background, managing queues, and distributing workloads across multiple workers using Redis as the transport.

## Features

- **Job queues**: Organize jobs into different queues with custom settings
- **Transports**: Abstract communication layer between queues and workers
- **Worker pool**: Efficiently coordinate workers across multiple processes or servers
- **Scheduling**: Schedule jobs to run at specific times
- **Retries**: Automatically retry failed jobs with configurable backoff
- **Prioritization**: Assign priorities to jobs within a queue
- **CLI tool**: Manage workers through a simple command-line interface

## Installation

```bash
bun add @elysiumjs/heracles
```

## Quick Start

### 1. Create a Job

```typescript
import { Job } from '@elysiumjs/heracles';

@Job.register({
	queue: 'emails',
	maxRetries: 3,
	retryDelay: 5000
})
export class SendEmailJob extends Job {
	constructor(
		private readonly email: string,
		private readonly subject: string,
		private readonly body: string
	) {
		super();
	}

	protected async execute(): Promise<void> {
		// Implementation for sending an email
		console.log(`Sending email to ${this.email}: ${this.subject}`);

		// Simulate email sending
		await new Promise((resolve) => setTimeout(resolve, 1000));

		console.log(`Email sent successfully to ${this.email}`);
	}
}
```

### 2. Dispatch a Job

```typescript
import { Queue, RedisTransport } from '@elysiumjs/heracles';

import { SendEmailJob } from './jobs/send-email.job';

// Configure the queue with Redis transport
const emailQueue = Queue.get('emails', {
	transport: RedisTransport,
	transportOptions: {
		connection: 'default'
	}
});

// Dispatch a job
await emailQueue.dispatch(SendEmailJob, [
	'user@example.com',
	'Welcome!',
	'Welcome to our platform!'
]);

// Dispatch with options
await emailQueue.dispatch(
	SendEmailJob,
	['user@example.com', 'Welcome!', 'Welcome to our platform!'],
	{
		priority: 5, // Higher priority (lower number)
		scheduledFor: new Date(Date.now() + 60000), // Run after 1 minute
		maxRetries: 5 // Override max retries
	}
);
```

### 3. Start Workers

Using the CLI:

```bash
# Start a Redis worker for the 'emails' queue with concurrency of 3 jobs
bun heracles work --id worker-1 --queues=emails --concurrency=3 --redis=default

# Start workers for multiple queues
bun heracles work --id worker-2 --queues=emails,notifications --redis=default
```

Or programmatically:

```typescript
import { RedisWorker } from '@elysiumjs/heracles';

// Create and start a Redis worker
const worker = new RedisWorker('default', { id: 'worker-1' });
await worker.createQueue({ name: 'emails', concurrency: 3 });
await worker.start();
```

## Configuration

### Queue Options

```typescript
const queue = Queue.get('emails', {
	// Maximum number of concurrent jobs to process in this queue
	concurrency: 5,

	// Maximum number of retries for failed jobs
	maxRetries: 3,

	// Delay in milliseconds between retries
	retryDelay: 5000,

	// Whether to pause processing when an error occurs
	pauseOnError: false,

	// Redis transport configuration
	transport: RedisTransport,

	// Transport-specific options
	transportOptions: {
		connection: 'default'
	}
});
```

### Redis Transport Configuration

Heracles uses Redis as its transport layer for job distribution, enabling distributed processing across multiple servers or processes. It uses Redis Streams for reliable message delivery and job coordination.

#### 1. Configure Redis Connection

First, configure a Redis connection in your Elysium.js application:

```typescript
import { Redis } from '@elysiumjs/core';

// Register a Redis connection
Redis.registerConnection('default', {
	url: 'redis://localhost:6379'
	// Other Redis options
});
```

#### 2. Configure Queues with Redis Transport

```typescript
import { Queue, RedisTransport } from '@elysiumjs/heracles';

const queue = Queue.get('emails', {
	transport: RedisTransport,
	transportOptions: {
		connection: 'default', // Redis connection name
		keyPrefix: 'myapp:jobs', // Prefix for Redis keys (default: 'elysium:heracles')
		consumerGroup: 'workers', // Redis consumer group name (default: 'workers')
		pollInterval: 1000, // Poll interval in ms (default: 1000)
		statusTTL: 86400, // Job status TTL in seconds (default: 86400 - 24 hours)
		cleanupCompletedJobs: true, // Auto-cleanup completed jobs (default: true)
		completedJobRetention: 3600, // Time to retain completed jobs in seconds (default: 3600 - 1 hour)
		maxStreamSize: 1000 // Maximum stream size (default: 1000)
	}
});
```

#### 3. Worker Configuration

Configure workers to process jobs from Redis queues:

```typescript
import { RedisWorker } from '@elysiumjs/heracles';

// Create a Redis worker with a unique ID
const worker = new RedisWorker('default', {
	id: 'worker-1', // Unique worker ID
	consumerName: 'worker-1', // Unique consumer name (optional)
	keyPrefix: 'myapp:jobs' // Use same prefix as queue configuration
});

// Configure queue settings
await worker.createQueue({
	name: 'emails',
	concurrency: 5, // Process 5 jobs concurrently
	maxRetries: 3, // Retry failed jobs up to 3 times
	retryDelay: 5000, // Wait 5 seconds between retries
	pauseOnError: false // Don't pause queue on error
});

// Start the worker
await worker.start();
```

## Job Lifecycle

Jobs in Heracles go through several statuses:

1. **PENDING**: Job is queued but not yet started
2. **RUNNING**: Job is currently being processed
3. **COMPLETED**: Job has successfully completed
4. **FAILED**: Job has failed (may be retried if retries are available)
5. **CANCELLED**: Job was cancelled and won't be processed
6. **SCHEDULED_FOR_RETRY**: Job has failed and is scheduled for retry

## Advanced Usage

### Job Cancellation

```typescript
// Cancel a specific job
const cancelled = await queue.cancelJob('job_123456789');

// Cancel all jobs in a queue
const cancelledCount = await queue.cancelAllJobs();
```

### Queue Management

```typescript
// Pause a queue (stop processing new jobs)
await queue.pause();

// Resume a paused queue
await queue.resume();

// Drain a queue (complete current jobs but don't accept new ones)
await queue.drain();

// Clear all jobs from a queue
await queue.clear();
```

### Worker Pool

The worker pool manages worker availability and distributes jobs using a round-robin algorithm:

```typescript
import { ThreadWorker, WorkerPool } from '@elysiumjs/heracles';

// Get the worker pool instance
const pool = WorkerPool.instance;

// Add a worker to the pool
const worker = new ThreadWorker(['emails']);
await worker.start();
await pool.addWorker(worker.getInfo(), ['emails']);

// Get workers for a specific queue
const emailWorkers = pool.getWorkersForQueue('emails');
```

## CLI Reference

Heracles includes a CLI tool for managing workers and Redis maintenance:

```
Usage: heracles [options] [command]

Options:
  -V, --version                         output the version number
  -h, --help                            display help for command

Commands:
  work [options]                        Start a Redis worker for specific queues
  cleanup [options]                     Clean up Redis streams
  help [command]                        display help for command
```

### Start Workers

```
Usage: heracles work [options]

Start a Redis worker for specific queues

Options:
  --id <ID>                   Unique identifier for this worker (required)
  -q, --queues <queues>       Comma-separated list of queues (default: "default")
  -c, --concurrency <count>   Number of concurrent jobs per worker (default: "1")
  -r, --redis <n>             Redis connection name (default: "default")
  --config <path>             Path to configuration file (default: "")
  --max-retries <count>       Maximum retries for failed jobs (default: "3")
  --retry-delay <ms>          Delay between retries in milliseconds (default: "5000")
  --pause-on-error            Pause queue when error occurs (default: false)
  -h, --help                  display help for command
```

### Clean Up Redis Streams

```
Usage: heracles cleanup [options]

Clean up Redis streams by removing completed and failed jobs

Options:
  -r, --redis <name>          Redis connection name (default: "default")
  -q, --queues <queues>       Comma-separated list of queues (all if not specified)
  -a, --all                   Remove all entries, not just completed ones (default: false)
  -k, --keyprefix <prefix>    Redis key prefix (default: "elysium:heracles")
  -t, --retention <seconds>   Time to retain completed jobs in seconds (default: "3600")
  -m, --max <count>           Maximum stream size to trim to (default: "1000")
  -s, --status-only           Only clean up job status keys, not stream entries (default: false)
  --dry-run                   Show what would be removed without actually removing (default: false)
  -h, --help                  display help for command
```

## License

Apache-2.0
