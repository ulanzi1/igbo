import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  transpilePackages: ["@igbo/config", "@igbo/db", "@igbo/auth"],
};

export default withNextIntl(nextConfig);
