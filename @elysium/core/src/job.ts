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

import 'reflect-metadata';

import type { Class } from 'type-fest';

import { assign, uid } from 'radash';

import { InteractsWithConsole } from './console';
import { Service } from './service';
import { Symbols } from './utils';

/**
 * Properties required when declaring a job using the `@job()` decorator.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export type JobProps = {
	/**
	 * The name of the job.
	 */
	name?: string;

	/**
	 * The queue on which the job should be processed.
	 */
	queue?: string;
};

/**
 * Base class for background jobs.
 *
 * Jobs are classes that can be executed in the background. They provide
 * an abstract execute method that serves as the entry point for the job.
 *
 * @author Axel Nana <axel.nana@workbud.com>
 */
export abstract class Job extends InteractsWithConsole {
	#startedAt?: Date;
	#completedAt?: Date;
	#status: JobStatus = JobStatus.PENDING;
	#err?: Error;

	/**
	 * Marks a class as a job.
	 * @author Axel Nana <axel.nana@workbud.com>
	 * @param options The decorator options.
	 */
	public static register(options: JobProps = {}) {
		return function (target: Class<Job>) {
			options = assign({ name: target.name, queue: 'default' }, options);

			const name = `job.${options.name}`;

			Service.instance(name, target);

			Reflect.defineMetadata(Symbols.job, { name, queue: options.queue }, target);
		};
	}

	/**
	 * Unique identifier for the job.
	 */
	public readonly id: string;

	/**
	 * The timestamp when the job was created.
	 */
	public readonly createdAt: Date;

	/**
	 * The timestamp when the job started execution.
	 */
	public get startedAt(): Date | undefined {
		return this.#startedAt;
	}

	/**
	 * The timestamp when the job completed execution.
	 */
	public get completedAt(): Date | undefined {
		return this.#completedAt;
	}

	/**
	 * The current status of the job.
	 */
	public get status(): JobStatus {
		return this.#status;
	}

	/**
	 * Creates a new job instance.
	 *
	 * @param id Optional job ID. If not provided, a random ID will be generated.
	 */
	constructor(id?: string) {
		super();
		this.id = id || this.generateJobId();
		this.createdAt = new Date();
	}

	/**
	 * Run the job.
	 * This method handles the job lifecycle and calls the execute method.
	 */
	public async run(): Promise<void> {
		try {
			this.#status = JobStatus.RUNNING;
			this.#startedAt = new Date();

			this.debug(`Job ${this.id} started at ${this.#startedAt.toISOString()}`);

			// Execute the job implementation
			await this.execute();

			this.#status = JobStatus.COMPLETED;
			this.#completedAt = new Date();

			this.debug(`Job ${this.id} completed at ${this.#completedAt.toISOString()}`);
		} catch (err) {
			this.#err = err instanceof Error ? err : new Error(String(err));

			if (this.#status !== JobStatus.CANCELLED) {
				this.#status = JobStatus.FAILED;
			}

			this.#completedAt = new Date();

			this.trace(this.#err);
		}
	}

	/**
	 * Cancels the job.
	 */
	public cancel(): void {
		this.#status = JobStatus.CANCELLED;
	}

	/**
	 * The main execution method for the job.
	 * This must be implemented by all job classes.
	 */
	protected abstract execute(): Promise<void>;

	/**
	 * Generate a random job ID.
	 * @returns A random job ID.
	 */
	private generateJobId(): string {
		return `job_${Date.now()}_${uid(8)}`;
	}
}

/**
 * Possible statuses for a job.
 * @author Axel Nana <axel.nana@workbud.com>
 */
export enum JobStatus {
	/**
	 * The job is in pending state, meaning it has been added to the queue but has not yet been processed.
	 */
	PENDING = 'pending',

	/**
	 * The job is in running state, meaning it is currently being processed.
	 */
	RUNNING = 'running',

	/**
	 * The job has completed successfully.
	 */
	COMPLETED = 'completed',

	/**
	 * The job has failed to complete successfully. If there are enough retries left, the job will be restarted.
	 */
	FAILED = 'failed',

	/**
	 * The job has been cancelled by the user or another job.
	 */
	CANCELLED = 'cancelled'
}
