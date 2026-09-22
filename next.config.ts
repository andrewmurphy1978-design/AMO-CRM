import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  experimental: {
    // The default 1MB cap on a Server Action's request body is too small
    // for the compose dialog's attach-on-send — attachments are base64-
    // encoded client-side and sent as part of sendEmailAction's own
    // payload, which needs room for a real (if modest) file.
    serverActions: { bodySizeLimit: "10mb" },
  },
  // Next's output file tracing only follows the "default" export condition,
  // so it misses pg-cloudflare's dist/index.js (only reachable via the
  // "workerd" export condition that pg uses when running on Cloudflare
  // Workers) and OpenNext's build fails trying to bundle it. Force it in.
  outputFileTracingIncludes: {
    "*": ["./node_modules/pg-cloudflare/dist/**/*", "./node_modules/pg-cloudflare/esm/**/*"],
  },
};

export default nextConfig;
