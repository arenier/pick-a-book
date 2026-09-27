import { runJob } from './lib/run-job.js';

// Entry point of the Cloud Run Job (ADR 0006, issue #22): one run, one snapshot, one exit code.
process.exitCode = await runJob(process.env, new Date(), (line) => {
  process.stdout.write(`${line}\n`);
});
