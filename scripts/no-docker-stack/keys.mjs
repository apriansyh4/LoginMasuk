// HS256 anon / service_role keys for the local stack (dev-only secret).
import { createHmac } from 'node:crypto';
const secret = process.env.JWT_SECRET;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (p) => { const h = b64({ alg: 'HS256', typ: 'JWT' }); const b = b64(p); return `${h}.${b}.${createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url')}`; };
const now = Math.floor(Date.now() / 1000), exp = now + 10 * 365 * 86400;
console.log(`ANON_KEY=${sign({ iss: 'supabase', role: 'anon', iat: now, exp })}`);
console.log(`SERVICE_ROLE_KEY=${sign({ iss: 'supabase', role: 'service_role', iat: now, exp })}`);
