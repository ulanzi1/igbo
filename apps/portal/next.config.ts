import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@igbo/config", "@igbo/db", "@igbo/auth"],
};

export default nextConfig;
