import 'reflect-metadata';

import type { EventData } from '@elysiumjs/core';

import { Event } from '@elysiumjs/core';

import { App } from './src/app';

Event.on('elysium:error', (e: EventData<Error>) => {
	console.error('Fuck', JSON.stringify(e));
});

Event.on('elysium:app:stop', () => {
	console.log('Stopping Elysium');
});

new App();
