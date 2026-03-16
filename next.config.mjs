import withPWAInit from "next-pwa";
import path from "node:path";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development"
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: path.join(process.cwd())
};

export default withPWA(nextConfig);
