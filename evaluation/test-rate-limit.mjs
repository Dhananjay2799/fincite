import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, clientKey } from "../apps/web/src/lib/server/rate-limit.mjs";

function clock(start = 1_000_000) {
  let time = start;
  return { now: () => time, advance: ms => { time += ms; } };
}

test("requests within the per-minute limit are allowed and the next one is refused", () => {
  const { now } = clock();
  const limiter = createRateLimiter({ perMinute: 3, perDay: 100, now });
  for (let i = 0; i < 3; i += 1) assert.deepEqual(limiter.check("a"), { allowed: true });
  const refused = limiter.check("a");
  assert.equal(refused.allowed, false);
  assert.equal(refused.scope, "minute");
  assert.equal(refused.retryAfterSeconds, 60);
});

test("the minute window resets and reports the remaining wait", () => {
  const time = clock();
  const limiter = createRateLimiter({ perMinute: 1, perDay: 100, now: time.now });
  assert.equal(limiter.check("a").allowed, true);
  time.advance(45_000);
  assert.equal(limiter.check("a").retryAfterSeconds, 15);
  time.advance(15_000);
  assert.equal(limiter.check("a").allowed, true);
});

test("clients are counted separately", () => {
  const { now } = clock();
  const limiter = createRateLimiter({ perMinute: 1, perDay: 100, now });
  assert.equal(limiter.check("a").allowed, true);
  assert.equal(limiter.check("b").allowed, true);
  assert.equal(limiter.check("a").allowed, false);
});

test("the daily limit holds across minute windows and refused requests are not counted", () => {
  const time = clock();
  const limiter = createRateLimiter({ perMinute: 2, perDay: 3, now: time.now });
  assert.equal(limiter.check("a").allowed, true);
  assert.equal(limiter.check("a").allowed, true);
  assert.equal(limiter.check("a").scope, "minute");
  time.advance(60_000);
  assert.equal(limiter.check("a").allowed, true);
  const refused = limiter.check("a");
  assert.equal(refused.scope, "day");
  assert.equal(refused.retryAfterSeconds, 86_340);
  time.advance(86_340_000);
  assert.equal(limiter.check("a").allowed, true);
});

test("the client table stays bounded", () => {
  const time = clock();
  const limiter = createRateLimiter({ perMinute: 1, perDay: 1, maxClients: 3, now: time.now });
  for (const key of ["a", "b", "c", "d", "e"]) assert.equal(limiter.check(key).allowed, true);
  assert.ok(limiter.size <= 3);
  time.advance(86_400_000);
  assert.equal(limiter.check("f").allowed, true);
  assert.equal(limiter.size, 1);
});

test("the client key uses the first forwarded address and never bypasses the limit", () => {
  assert.equal(clientKey(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(clientKey(new Headers({ "x-real-ip": "203.0.113.9" })), "203.0.113.9");
  assert.equal(clientKey(new Headers()), "unknown");
});
