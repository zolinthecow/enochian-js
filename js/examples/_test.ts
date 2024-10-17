import { run as backendSwapping } from './backendSwapping.js';
import { run as basic } from './basic.js';
import { run as choices } from './choices.js';
import { run as fork } from './fork.js';
import { run as openai } from './openai.js';

// If this doesn't crash I'm chill with it
(async () => {
    await basic();
    await fork();
    await openai();
    await backendSwapping();
    await choices();
})();
