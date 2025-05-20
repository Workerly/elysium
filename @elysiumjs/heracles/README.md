# Heracles

> Robust background job processing for Elysium.js applications

Heracles is a powerful background job processing system for Elysium.js applications. It provides a flexible and scalable solution for running tasks in the background, managing queues, and distributing workloads across multiple workers.

## Features

- **Job queues**: Organize jobs into different queues with custom settings
- **Transports**: Choose between thread-based or Redis-based job distribution
- **Worker pool**: Efficiently distribute jobs across multiple workers
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
  constructor(private readonly email: string, private readonly subject: string, private readonly body: string) {
    super();
  }

  protected async execute(): Promise<void> {
    // Implementation for sending an email
    console.log(`Sending email to ${this.email}: ${this.subject}`);
    
    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`Email sent successfully to ${this.email}`);
  }
}
```

### 2. Dispatch a Job

```typescript
import { Queue } from '@elysiumjs/heracles';
import { SendEmailJob } from './jobs/send-email.job';

// Get or create a queue
const emailQueue = Queue.get('emails');

// Dispatch a job
await emailQueue.dispatch(SendEmailJob, ['user@example.com', 'Welcome!', 'Welcome to our platform!']);

// Dispatch with options
await emailQueue.dispatch(
  SendEmailJob, 
  ['user@example.com', 'Welcome!', 'Welcome to our platform!'],
  {
    priority: 5,  // Higher priority (lower number)
    scheduledFor: new Date(Date.now() + 60000),  // Run after 1 minute
    maxRetries: 5  // Override max retries
  }
);
```

### 3. Start Workers

Using the CLI:

```bash
# Start 2 thread workers for the 'emails' queue with concurrency of 3 jobs per worker
bun heracles worker:start --queues=emails --workers=2 --concurrency=3 --transport=thread

# Start Redis workers
bun heracles worker:start --queues=emails,notifications --workers=4 --transport=redis --redis=default
```

Or programmatically:

```typescript
import { ThreadWorker, RedisWorker } from '@elysiumjs/heracles';

// Create and start a thread worker
const worker = new ThreadWorker(['emails', 'notifications']);
await worker.start();

// Create and start a Redis worker
const redisWorker = new RedisWorker('default');
await redisWorker.start();
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
  
  // Transport for this queue (defaults to ThreadTransport)
  transport: RedisTransport,
  
  // Transport-specific options
  transportOptions: {
    connection: 'default'
  }
});
```

### Redis Transport

To use the Redis transport, first configure a Redis connection in your Elysium.js application:

```typescript
import { Redis } from '@elysiumjs/core';

// Register a Redis connection
Redis.registerConnection('default', {
  url: 'redis://localhost:6379',
  // Other Redis options
});
```

Then use the Redis transport in your queues:

```typescript
import { Queue, RedisTransport } from '@elysiumjs/heracles';

const queue = Queue.get('emails', {
  transport: RedisTransport,
  transportOptions: {
    connection: 'default',
    keyPrefix: 'myapp:jobs',
    statusTTL: 86400  // 24 hours
  }
});
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
import { WorkerPool, ThreadWorker } from '@elysiumjs/heracles';

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

Heracles includes a CLI tool for managing workers:

```
Usage: heracles [options] [command]

Options:
  -V, --version                         output the version number
  -h, --help                            display help for command

Commands:
  worker:start [options]                Start workers for specific queues
  status                                Show worker pool status
  help [command]                        display help for command
```

### Start Workers

```
Usage: heracles worker:start [options]

Start workers for specific queues

Options:
  -q, --queues <queues>       Comma-separated list of queues (default: "default")
  -t, --transport <transport>  Transport type (thread|redis) (default: "thread")
  -c, --concurrency <count>   Number of concurrent jobs per worker (default: "1")
  -w, --workers <count>       Number of workers to start (default: "1")
  -r, --redis <n>             Redis connection name for Redis transport (default: "default")
  --config <path>             Path to configuration file (default: "")
  --max-retries <count>       Maximum retries for failed jobs (default: "3")
  --retry-delay <ms>          Delay between retries in milliseconds (default: "5000")
  --pause-on-error            Pause queue when error occurs (default: false)
  -h, --help                  display help for command
```

## License

Apache-2.0