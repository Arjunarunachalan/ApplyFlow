import mongoose from "mongoose";
import dns from "node:dns";

// Configure reliable DNS servers (Google 8.8.8.8, Cloudflare 1.1.1.1)
// to prevent c-ares SRV lookup failures on serverless or Windows environments.
export const applyDnsOverride = () => {
  const envServers = (process.env.DNS_SERVERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => Boolean(s) && !s.startsWith("103.")); // Discard stale/unreachable ISP IPs

  const servers = envServers.length > 0 ? envServers : ["8.8.8.8", "1.1.1.1"];

  try {
    dns.setServers(servers);
    console.log(`DNS resolvers configured: ${servers.join(", ")}`);
  } catch (err) {
    console.warn("Could not set custom DNS servers:", err.message);
  }
};

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export const connectDB = async () => {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    applyDnsOverride();

    const opts = {
      bufferCommands: false, // In serverless, do not buffer queries when disconnected
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    };

    cached.promise = mongoose
      .connect(process.env.MONGO_URI, opts)
      .then((m) => {
        console.log(`MongoDB Connected: ${m.connection.host}`);
        cached.conn = m.connection;
        return cached.conn;
      })
      .catch((err) => {
        cached.promise = null;
        cached.conn = null;
        console.error("MongoDB connection error:", err.message);
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    cached.promise = null;
    cached.conn = null;
    throw err;
  }
};
