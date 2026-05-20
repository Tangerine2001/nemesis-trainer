import type {NextConfig} from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["pokemon-showdown"],
  turbopack: {
    root: path.resolve(process.cwd(), "..")
  }
};

export default nextConfig;
