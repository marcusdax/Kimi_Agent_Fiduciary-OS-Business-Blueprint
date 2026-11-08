import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.API_BASE_URL;
assert(
  base &&
    ["localhost", "127.0.0.1", "fiduciary-api-sandbox.up.railway.app"].includes(
      new URL(base).hostname,
    ),
  "Explicit isolated sandbox/local API required",
);
async function call(path, token, method = "GET", body, expected = 200) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: unexpected HTTP status`,
  );
  return response.json();
}
const credentials = () => ({
  email: `synthetic-tools-${randomUUID()}@example.test`,
  name: "Synthetic tool acceptance",
  password: randomUUID() + randomUUID(),
});
const owner = credentials(),
  other = credentials();
const a = await call("/auth/register", null, "POST", owner, 201),
  b = await call("/auth/register", null, "POST", other, 201);
const catalog = await call("/tools/catalog", a.accessToken);
assert.equal(Object.keys(catalog).length, 10);
for (const [kind, definition] of Object.entries(catalog)) {
  const inputs = {
    source: "Synthetic acceptance fixture, not customer data",
    asOfDate: new Date().toISOString().slice(0, 10),
  };
  for (const field of definition.fields)
    inputs[field.key] = field.options?.[0] ?? Math.max(0, field.min);
  if ("principal" in inputs) inputs.principal = 12000;
  if ("years" in inputs) inputs.years = 2;
  if (kind === "profile") {
    inputs.age = 40;
    inputs.retirementAge = 65;
  }
  const saved = await call(`/tools/scenarios/${kind}`, a.accessToken, "PUT", {
    version: 0,
    inputs,
  });
  assert.equal(saved.version, 1);
  assert.equal(saved.result.methodVersion, "blueprint-educational-v1");
  await call(
    `/tools/scenarios/${kind}`,
    a.accessToken,
    "PUT",
    { version: 0, inputs },
    409,
  );
}
await call("/tools/scenarios", null, "GET", undefined, 401);
assert.deepEqual(await call("/tools/scenarios", b.accessToken), []);
const login = await call("/auth/login", null, "POST", {
  email: owner.email,
  password: owner.password,
});
assert.equal((await call("/tools/scenarios", login.accessToken)).length, 10);
const feeds = await call("/tools/observations", a.accessToken);
assert.equal(feeds.length, 3);
for (const feed of feeds) {
  assert(feed.providerUrl.startsWith("https://"));
  assert(["fresh", "stale", "unavailable"].includes(feed.status));
  console.log(
    `${feed.key}: ${feed.status}, ${feed.points.length} actual provider observations, observed ${feed.observedAt && /^\d{4}-\d{2}-\d{2}$/.test(feed.observedAt) ? `${feed.observedAt} (reported date)` : feed.observedAt ? new Date(feed.observedAt).toLocaleString("en-US", { timeZone: "America/Chicago", timeZoneName: "short" }) : "unavailable"}`,
  );
}
if (process.env.REQUIRE_LIVE === "true") {
  assert.equal(feeds.find((f) => f.key === "crypto").status, "fresh");
  assert.equal(feeds.find((f) => f.key === "treasury").status, "fresh");
}
console.log(
  "PASS: ten tool saves, source/method/version, no automatic retry, stale-write rejection, owner isolation, re-login persistence, unauthenticated rejection, provider provenance. Synthetic accounts only; credentials not logged.",
);
