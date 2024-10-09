import { run as basic } from './basic.js';
import { run as fork } from './fork.js';

// If this doesn't crash I'm chill with it
(async () => {
    await basic();
    await fork();
})();
