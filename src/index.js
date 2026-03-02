import 'dotenv/config';
import { runPipeline } from './pipeline.js';

// --- Parse CLI args ---
const args = process.argv.slice(2);
const countIdx = args.indexOf('--count');
const count = countIdx !== -1 && args[countIdx + 1] ? parseInt(args[countIdx + 1], 10) : 5;

if (isNaN(count) || count < 1) {
  console.error('Usage: node src/index.js [--count N]');
  process.exit(1);
}

await runPipeline(count, (msg) => process.stdout.write(msg));
