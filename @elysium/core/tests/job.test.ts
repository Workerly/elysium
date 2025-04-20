import 'reflect-metadata';

import type { JobProps } from '../src/job';

import { afterAll, afterEach, describe, expect, it, jest, mock, spyOn } from 'bun:test';

import { InteractsWithConsole } from '../src/console';
import { Job, JobStatus } from '../src/job';
import { Service } from '../src/service';
import { Symbols } from '../src/utils';

describe('Job class', () => {
	afterEach(() => {
		process.stdout.write = mock();
		jest.clearAllMocks();
	});

	afterAll(() => {
		mock.restore();
	});

	describe('@Job.register decorator', () => {
		it('should register a job class with default options', () => {
			// Create a test job class
			@Job.register()
			class TestJob extends Job {
				protected async execute(): Promise<void> {
					// Implementation not needed for this test
				}
			}

			// Check if metadata was set correctly
			const metadata = Reflect.getMetadata(Symbols.job, TestJob);
			expect(metadata).toBeDefined();
			expect(metadata.name).toBe('job.TestJob');
			expect(metadata.queue).toBe('default');

			// Check if the job was registered with the service container
			expect(Service.instance).toHaveBeenCalledWith('job.TestJob', TestJob);
		});

		it('should register a job class with custom options', () => {
			// Create a test job class with custom options
			const jobProps: JobProps = {
				name: 'custom-job',
				queue: 'custom-queue'
			};

			@Job.register(jobProps)
			class TestJob extends Job {
				protected async execute(): Promise<void> {
					// Implementation not needed for this test
				}
			}

			// Check if metadata was set correctly
			const metadata = Reflect.getMetadata(Symbols.job, TestJob);
			expect(metadata).toBeDefined();
			expect(metadata.name).toBe('job.custom-job');
			expect(metadata.queue).toBe('custom-queue');

			// Check if the job was registered with the service container
			expect(Service.instance).toHaveBeenCalledWith('job.custom-job', TestJob);
		});
	});

	describe('constructor', () => {
		it('should create a job with a provided ID', () => {
			// Create a test job class
			class TestJob extends Job {
				protected async execute(): Promise<void> {
					// Implementation not needed for this test
				}
			}

			// Create a job instance with a custom ID
			const job = new TestJob('custom-id');

			// Check if the ID was set correctly
			expect(job.id).toBe('custom-id');
			expect(job.createdAt).toBeInstanceOf(Date);
			expect(job.status).toBe(JobStatus.PENDING);
		});

		it('should create a job with a generated ID if not provided', () => {
			// Create a test job class
			class TestJob extends Job {
				protected async execute(): Promise<void> {
					// Implementation not needed for this test
				}
			}

			// Create a job instance without an ID
			const job = new TestJob();

			// Check if an ID was generated
			expect(job.id).toBeDefined();
			expect(job.id).toBeString();
			expect(job.id).toStartWith('job_');
			expect(job.createdAt).toBeInstanceOf(Date);
			expect(job.status).toBe(JobStatus.PENDING);
		});
	});

	describe('run', () => {
		it('should execute the job and update its status to COMPLETED', async () => {
			// Create a test job class with a spy on the execute method
			class TestJob extends Job {
				protected async execute(): Promise<void> {
					// Implementation not needed for this test
				}
			}

			// Create a job instance
			const job = new TestJob();
			const executeSpy = spyOn(job, 'execute' as any);

			// Run the job
			await job.run();

			// Check if execute was called
			expect(executeSpy).toHaveBeenCalled();

			// Check if the job status was updated correctly
			expect(job.status).toBe(JobStatus.COMPLETED);
			expect(job.startedAt).toBeInstanceOf(Date);
			expect(job.completedAt).toBeInstanceOf(Date);
		});

		it('should handle errors during execution and update status to FAILED', async () => {
			// Create a test job class that throws an error
			class TestJob extends Job {
				protected async execute(): Promise<void> {
					throw new Error('Test error');
				}
			}

			const traceSpy = spyOn(InteractsWithConsole.prototype, 'trace');

			// Create a job instance
			const job = new TestJob();

			// Run the job
			await job.run();

			// Check if the job status was updated correctly
			expect(job.status).toBe(JobStatus.FAILED);
			expect(job.startedAt).toBeInstanceOf(Date);
			expect(job.completedAt).toBeInstanceOf(Date);

			// Check if the error was traced
			expect(traceSpy).toHaveBeenCalled();
		});

		it('should not update status to FAILED if the job was cancelled', async () => {
			// Create a test job class that throws an error
			class TestJob extends Job {
				protected async execute(): Promise<void> {
					// Cancel the job before throwing an error
					this.cancel();
					throw new Error('Test error');
				}
			}

			const traceSpy = spyOn(InteractsWithConsole.prototype, 'trace');

			// Create a job instance
			const job = new TestJob();

			// Run the job
			await job.run();

			// Check if the job status was updated correctly
			expect(job.status).toBe(JobStatus.CANCELLED);
			expect(job.startedAt).toBeInstanceOf(Date);
			expect(job.completedAt).toBeInstanceOf(Date);

			// Check if the error was traced
			expect(traceSpy).toHaveBeenCalled();
		});
	});

	describe('cancel', () => {
		it('should update the job status to CANCELLED', () => {
			// Create a test job class
			class TestJob extends Job {
				protected async execute(): Promise<void> {
					// Implementation not needed for this test
				}
			}

			// Create a job instance
			const job = new TestJob();

			// Cancel the job
			job.cancel();

			// Check if the job status was updated correctly
			expect(job.status).toBe(JobStatus.CANCELLED);
		});
	});
});
