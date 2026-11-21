import mongoose from "mongoose";
import dns from "node:dns";

// Node's resolver (c-ares) picks the DNS servers for mongodb+srv:// lookups
// itself, and on some Windows setups it ends up with a loopback server that
// nothing listens on (querySrv ECONNREFUSED). DNS_SERVERS lets us point it at
// resolvers that actually answer, e.g. DNS_SERVERS=8.8.8.8,1.1.1.1
export const applyDnsOverride = () => {
  const servers = (process.env.DNS_SERVERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (servers.length) {
    dns.setServers(servers);
    console.log(`DNS resolvers overridden: ${servers.join(", ")}`);
  }
};

export const connectDB = async () => {
  applyDnsOverride();

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
};