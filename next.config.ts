import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // Next's output file tracing only follows the "default" export condition,
  // so it misses pg-cloudflare's dist/index.js (only reachable via the
  // "workerd" export condition that pg uses when running on Cloudflare
  // Workers) and OpenNext's build fails trying to bundle it. Force it in.
  outputFileTracingIncludes: {
    "*": ["./node_modules/pg-cloudflare/dist/**/*", "./node_modules/pg-cloudflare/esm/**/*"],
  },
};

export default nextConfig;
