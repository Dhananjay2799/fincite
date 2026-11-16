// Per-client request limits for the hosted chat API.
//
// Counters live in this function instance's memory. They are not shared across
// instances or regions and reset on a cold start, so this bounds casual scripted
// use of the public demo; it is not a distributed or abuse-proof rate limit.

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export function createRateLimiter({ perMinute = 20, perDay = 300, maxClients = 5000, now = Date.now } = {}) {
  const clients = new Map();

  function prune(time) {
    for (const [key, entry] of clients) {
      if (time - entry.dayStart >= DAY_MS) clients.delete(key);
    }
    // Still full of active clients: drop the oldest entries first.
    for (const key of clients.keys()) {
      if (clients.size < maxClients) break;
      clients.delete(key);
    }
  }

  return {
    check(key) {
      const time = now();
      let entry = clients.get(key);
      if (!entry) {
        if (clients.size >= maxClients) prune(time);
        entry = { minuteStart: time, minuteCount: 0, dayStart: time, dayCount: 0 };
        clients.set(key, entry);
      }
      if (time - entry.minuteStart >= MINUTE_MS) { entry.minuteStart = time; entry.minuteCount = 0; }
      if (time - entry.dayStart >= DAY_MS) { entry.dayStart = time; entry.dayCount = 0; }
      if (entry.dayCount >= perDay) {
        return { allowed: false, scope: "day", retryAfterSeconds: Math.ceil((entry.dayStart + DAY_MS - time) / 1000) };
      }
      if (entry.minuteCount >= perMinute) {
        return { allowed: false, scope: "minute", retryAfterSeconds: Math.ceil((entry.minuteStart + MINUTE_MS - time) / 1000) };
      }
      entry.minuteCount += 1;
      entry.dayCount += 1;
      return { allowed: true };
    },
    get size() { return clients.size; }
  };
}

// Vercel sets x-forwarded-for itself, so its first entry is the connecting client.
// Requests without it share one bucket rather than bypassing the limit.
export function clientKey(headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

export const hostedRateLimiter = createRateLimiter({
  perMinute: positiveInteger(process.env.FINCITE_RATE_LIMIT_PER_MINUTE, 20),
  perDay: positiveInteger(process.env.FINCITE_RATE_LIMIT_PER_DAY, 300)
});
