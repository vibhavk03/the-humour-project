import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/samples/*": ["./memes/**/*"],
    "/api/trial": ["./memes/**/*"],
    "/try/preview": ["./memes/**/*"],
  },
};

export default nextConfig;
