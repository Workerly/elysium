import { Job, job } from './core/job';

@job({ queue: 'email', name: 'send-email' })
export class EmailJob extends Job {
	constructor(
		private readonly recipient: string,
		private readonly message: string
	) {
		super();
	}

	protected async execute(): Promise<void> {
		this.info(`Sending email to ${this.recipient}`);
		await Bun.sleep(5000);
		this.success('Email sent successfully with message: ' + this.message);
	}
}
