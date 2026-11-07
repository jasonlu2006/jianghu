import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

// Read the single .env at the repo root, so CLI and web share one key.
loadEnvConfig(fileURLToPath(new URL("../..", import.meta.url)));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship TypeScript source; let Next compile them.
  transpilePackages: ["@murim/engine", "@murim/narrator", "@murim/worlds"],
  webpack: (config) => {
    // Packages import "./x.js" that is really "./x.ts".
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};

export default nextConfig;
