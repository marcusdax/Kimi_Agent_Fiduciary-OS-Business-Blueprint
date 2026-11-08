// Synthetic-only sandbox smoke test. No secrets, tokens or login details printed.
import { randomBytes } from 'node:crypto';
const base = process.env.API_BASE_URL;
if (!base || (!base.includes('localhost') && !base.includes('127.0.0.1') && !base.includes('fiduciary-api-sandbox.up.railway.app'))) throw new Error('Explicit isolated sandbox API_BASE_URL required');
async function call(path, body, token, method = body ? 'POST' : 'GET') {
  const r = await fetch(base + path, { method, headers: { 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}) }, ...(body ? { body:JSON.stringify(body) } : {}) });
  return { status:r.status, body:await r.json() };
}
const assert = (v, msg) => { if (!v) throw new Error(msg); };
async function account() { const email = `synthetic-${randomBytes(10).toString('hex')}@example.test`; const password=randomBytes(24).toString('base64url'); const r=await call('/auth/register',{email,password,name:'Synthetic sandbox verification'}); assert(r.status===201,'Registration failed'); return {email,password,token:r.body.accessToken}; }
const a = await account(); const b = await account();
const inputs = {name:'Synthetic smoke plan',asOf:'2026-11-08',source:'Automated synthetic sandbox smoke test; no financial accounts',balances:{cash:1000000,bonds:0,equities:0,other:0},monthlyIncomeCents:100000,monthlySpendingCents:50000,annualReturnBps:0,annualFeeBps:0,annualInflationBps:0,years:2};
assert((await call('/financial-plan')).status===401,'Unauthenticated access accepted');
const saved=await call('/financial-plan',{version:0,inputs},a.token,'PUT'); assert(saved.status===200 && saved.body.version===1,'Save failed'); assert(saved.body.projection.rows[2].nominalCents===2200000,'Projection mismatch');
assert((await call('/financial-plan',undefined,b.token)).body===null,'Cross-account data exposed');
assert((await call('/financial-plan',{version:0,inputs},a.token,'PUT')).status===409,'Stale write accepted');
const session=await call('/auth/login',{email:a.email,password:a.password}); assert(session.status===200,'Re-login failed');
assert((await call('/financial-plan',undefined,session.body.accessToken)).body.version===1,'Persistence/re-login failed');
console.log('PASS: registration, authentication, persisted projection, re-login, owner isolation, stale-write rejection (synthetic accounts only).');
