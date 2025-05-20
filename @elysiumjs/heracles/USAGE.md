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
  maxRetries: 3,    // Max retry attempts
  retryDelay: 5000  // Delay between retries (ms)
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
import { Queue } from '@elysiumjs/heracles';
import { SendEmailJob } from './jobs/send-email.job';

// Get the queue
const emailQueue = Queue.get('emails');

// Dispatch a job
await emailQueue.dispatch(
  SendEmailJob,
  ['user@example.com', 'Welcome!', 'Welcome to our service!']
);

// With additional options
await emailQueue.dispatch(
  SendEmailJob,
  ['user@example.com', 'Welcome!', 'Welcome to our service!'],
  {
    priority: 5,                               // Higher priority (lower number)
    scheduledFor: new Date(Date.now() + 3600000), // Run in 1 hour
    maxRetries: 5,                             // Override max retries
    retryDelay: 10000                          // Override retry delay
  }
);
```

## Queue Management

```typescript
// Create a custom queue
const queue = Queue.get('emails', {
  concurrency: 5,                     // Process 5 jobs simultaneously
  maxRetries: 3,                      // Default retries for failed jobs
  retryDelay: 5000,                   // Default delay between retries
  pauseOnError: false,                // Don't pause on error
  transport: RedisTransport,          // Use Redis for communication
  transportOptions: {                 // Transport-specific options
    connection: 'default',
    keyPrefix: 'myapp:jobs'
  }
});

// Queue operations
await queue.pause();            // Pause processing
await queue.resume();           // Resume processing
await queue.drain();            // Complete current jobs, don't accept new ones
await queue.clear();            // Clear all jobs from queue
await queue.cancelJob('job_id'); // Cancel specific job
await queue.cancelAllJobs();     // Cancel all jobs
```

## Starting Workers

### Using the CLI

```bash
# Start thread workers
bun heracles worker:start --queues=emails,notifications --workers=2 --concurrency=3

# Start Redis workers
bun heracles worker:start --queues=emails --transport=redis --redis=default --workers=4
```

CLI options:
- `--queues`: Comma-separated list of queues (default: "default")
- `--transport`: Transport type (thread|redis) (default: "thread")
- `--concurrency`: Number of concurrent jobs per worker (default: 1)
- `--workers`: Number of workers to start (default: 1)
- `--redis`: Redis connection name for Redis transport (default: "default")
- `--max-retries`: Maximum retries for failed jobs (default: 3)
- `--retry-delay`: Delay between retries in milliseconds (default: 5000)
- `--pause-on-error`: Pause queue when error occurs (default: false)
- `--config`: Path to configuration file for more complex setups

### Programmatically

```typescript
import { ThreadWorker, RedisWorker } from '@elysiumjs/heracles';

// Thread workers
const threadWorker = new ThreadWorker(['emails', 'notifications']);
await threadWorker.start();

// Redis workers
const redisWorker = new RedisWorker('default');
await redisWorker.start();
```

## Redis Setup

For Redis transport, first configure a Redis connection:

```typescript
import { Redis } from '@elysiumjs/core';

// Register a Redis connection
Redis.registerConnection('default', {
  url: 'redis://localhost:6379',
  // Other Redis options
});
```

### Redis Transport Options

When using the Redis transport, you can configure these options:

```typescript
const queue = Queue.get('emails', {
  transport: RedisTransport,
  transportOptions: {
    connection: 'default',        // Redis connection name
    keyPrefix: 'myapp:jobs',      // Prefix for Redis keys
    consumerGroup: 'workers',     // Redis consumer group name
    
    // Stream cleanup options
    cleanupCompletedJobs: true,   // Auto-cleanup completed jobs
    completedJobRetention: 3600,  // Seconds to keep completed jobs (1 hour)
    maxStreamSize: 1000,          // Maximum stream size to maintain
    
    // Advanced options
    pollInterval: 1000,           // Polling interval in milliseconds
    batchSize: 10,                // Batch size for reading messages
    statusTTL: 86400              // Time to live for job status (seconds)
  }
});
```

Heracles maintains an efficient Redis stream approach:
- Job status is tracked in dedicated Redis hashes for quick updates
- Single entry per job in the Redis stream to minimize storage
- Status updates modify the existing job status instead of creating new entries
- Automatic cleanup runs every 5 minutes, removing completed job entries older than the retention period
- Streams are trimmed to the maximum size to prevent unbounded growth

## Job Status Lifecycle

1. **PENDING**: Job is queued but not yet started
2. **RUNNING**: Job is currently executing
3. **COMPLETED**: Job completed successfully
4. **FAILED**: Job failed (may be retried if retries available)
5. **CANCELLED**: Job was cancelled
6. **SCHEDULED_FOR_RETRY**: Job failed and scheduled for retry

## Deployment Strategies

### Single-Server Deployment

For a single-server setup, thread-based workers are most efficient:

```bash
# Start thread workers in a persistent process
bun heracles worker:start --queues=emails,notifications,downloads --workers=4
```

### Distributed Deployment

For distributed deployment, use Redis transport:

1. Configure Redis in your application
2. Start Redis workers on multiple servers:

```bash
# Server 1 (handles email jobs)
bun heracles worker:start --queues=emails --transport=redis --workers=4

# Server 2 (handles notification jobs)
bun heracles worker:start --queues=notifications --transport=redis --workers=4

# Server 3 (handles heavy processing jobs)
bun heracles worker:start --queues=processing --transport=redis --workers=2 --concurrency=1
```

## Monitoring and Maintenance

### Worker Status
To check worker status:

```bash
bun heracles status
```

### Redis Stream Cleanup
To clean up Redis streams and remove completed jobs:

```bash
# Basic cleanup with default settings
bun heracles cleanup --redis=default

# Advanced cleanup options
bun heracles cleanup --redis=default --queues=emails,notifications \
  --keyprefix=myapp:jobs --retention=3600 --max=1000

# Only clean up job status keys, preserve stream entries
bun heracles cleanup --status-only

# Preview what would be removed without making changes
bun heracles cleanup --dry-run

# Remove all entries from streams (use with caution!)
bun heracles cleanup --all
```

Cleanup command options:
- `--redis`: Redis connection name (default: "default")
- `--queues`: Comma-separated list of queues to clean up (all if not specified)
- `--keyprefix`: Redis key prefix (default: "elysium:heracles")
- `--retention`: Seconds to retain completed jobs before removal (default: 3600)
- `--max`: Maximum stream size to trim to (default: 1000)
- `--status-only`: Only clean up job status keys, not stream entries (default: false)
- `--dry-run`: Show what would be removed without actually removing anything
- `--all`: Remove all entries, not just completed ones (use with caution!)
```

## Advanced: Worker Pool Configuration

The worker pool manages worker selection and job distribution:

```typescript
import { WorkerPool } from '@elysiumjs/heracles';

// Get the worker pool instance
const pool = WorkerPool.instance;

// Add a worker to the pool
await pool.addWorker(worker.getInfo(), ['emails', 'notifications']);

// Run a job directly through the pool
await pool.runJob(job, 'emails');
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
  maxRetries: 5,           // Max retry attempts
  retryDelay: 10000        // 10 seconds between retries
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

## Configuration File

For complex setups, create a configuration file:

```json
{
  "queues": "emails,notifications,processing",
  "transport": "redis",
  "redis": "default",
  "workers": 4,
  "concurrency": 3,
  "maxRetries": 5,
  "retryDelay": 10000,
  "pauseOnError": false
}
```

Then use it with the CLI:

```bash
bun heracles worker:start --config=heracles.json
```