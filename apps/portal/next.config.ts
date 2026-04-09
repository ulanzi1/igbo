import path from "path";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  // Trace from monorepo root so workspace packages (@igbo/config, @igbo/db, @igbo/auth)
  // are included in the standalone bundle — same pattern as apps/community.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@igbo/config", "@igbo/db", "@igbo/auth"],
};

export default withNextIntl(nextConfig);
