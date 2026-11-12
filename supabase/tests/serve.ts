// Dev helper: boot embedded Postgres with migrations and keep it running.
import { startDb } from './db';
const db = await startDb();
const opts = (db.pool as unknown as { options: { port: number } }).options;
console.log(`READY postgresql://postgres:postgres@localhost:${opts.port}/arlokal`);
process.on('SIGTERM', async () => { await db.stop(); process.exit(0); });
setInterval(() => {}, 1 << 30);
