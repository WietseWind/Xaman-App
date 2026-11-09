const { setDefaultTimeout } = require('@cucumber/cucumber');

// A stuck step fails after 2 minutes and the app is restarted for the next scenario (init.js).
// The slowest passing steps take under a minute; steps that wait longer set their own timeout.
setDefaultTimeout(120 * 1000);
