import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  experimental: {
    agentUpgrade: "security",
  },
};

export default nextConfig;
