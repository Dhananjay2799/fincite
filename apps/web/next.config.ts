import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['luther-dialogue-february-clause.trycloudflare.com'],
  outputFileTracingRoot: resolve(__dirname, "../.."),
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  // CPU-only Linux x64 deployment: retain its native binding and core library.
  ...(process.env.VERCEL ? {
    outputFileTracingIncludes: {
      "/api/chat": [
        "node_modules/onnxruntime-node/package.json",
        "node_modules/onnxruntime-node/dist/**/*.js",
        "node_modules/onnxruntime-node/bin/napi-v*/linux/x64/*.node",
        "node_modules/onnxruntime-node/bin/napi-v*/linux/x64/libonnxruntime.so*",
        "node_modules/onnxruntime-common/package.json",
        "node_modules/onnxruntime-common/dist/cjs/**/*.js",
      ],
    },
    outputFileTracingExcludes: {
      "/api/chat": [
        "node_modules/onnxruntime-node/bin/napi-v*/darwin/**/*",
        "node_modules/onnxruntime-node/bin/napi-v*/win32/**/*",
        "node_modules/onnxruntime-node/bin/napi-v*/linux/arm64/**/*",
        "node_modules/onnxruntime-node/bin/napi-v*/linux/x64/*cuda*",
        "node_modules/onnxruntime-node/bin/napi-v*/linux/x64/*tensorrt*",
        "node_modules/@huggingface/transformers/dist/*web*",
        "node_modules/onnxruntime-web/**/*",
      ],
    },
  } : {}),
};

export default nextConfig;

