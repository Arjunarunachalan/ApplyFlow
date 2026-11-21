import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

// REDIS_URL wins when set: managed providers (e.g. Upstash) hand you a single
// rediss:// URL that already carries the host, port, password and TLS flag.
export const redisConnection = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, redisOptions)
  : new Redis({
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: Number(process.env.REDIS_PORT) || 6379,
      ...redisOptions,
    });

redisConnection.on("connect", () => console.log("Redis Connected"));
redisConnection.on("error", (err) => console.error("Redis Error:", err.message));