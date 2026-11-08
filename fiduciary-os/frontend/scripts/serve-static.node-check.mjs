import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.STATIC_SERVER_TEST = "1";
const { server } = await import("./serve-static.mjs");
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
after(
  () =>
    new Promise((r) => {
      server.closeAllConnections();
      server.close(r);
    }),
);
test("static host root, security policy, HEAD, SPA and invalid methods/files", async () => {
  const root = await fetch(base);
  assert.equal(root.status, 200);
  assert.match(
    root.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.equal(root.headers.get("cache-control"), "no-store");
  assert.equal((await fetch(base, { method: "HEAD" })).status, 200);
  assert.equal(
    (await (await fetch(base, { method: "HEAD" })).text()).length,
    0,
  );
  assert.equal(
    (
      await fetch(base + "/tools/retirement", {
        headers: { Accept: "text/html" },
      })
    ).status,
    200,
  );
  for (const path of ["/missing.js", "/.env", "/%2eenv", "/tools/retirement"])
    assert.equal((await fetch(base + path)).status, 404);
  assert.equal(
    (await fetch(base, { method: "POST", body: "not accepted" })).status,
    405,
  );
});
test("bounded LOCAL-only burst: 50 reads, concurrency 5, no customer records", async () => {
  const started = Date.now();
  for (let i = 0; i < 10; i++) {
    const rows = await Promise.all(
      Array.from({ length: 5 }, () => fetch(base)),
    );
    assert(rows.every((r) => r.status === 200));
    await Promise.all(rows.map((r) => r.arrayBuffer()));
  }
  console.log(
    JSON.stringify({
      scope: "LOCAL-only static-host smoke, not production capacity",
      requests: 50,
      concurrency: 5,
      elapsedMs: Date.now() - started,
    }),
  );
});
