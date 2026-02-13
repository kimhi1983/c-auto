import type { NextConfig } from "next";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      // API v1 endpoints
      { source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` },
      // Legacy backend endpoints
      { source: '/check-emails', destination: `${BACKEND_URL}/check-emails` },
      { source: '/search-files', destination: `${BACKEND_URL}/search-files` },
      { source: '/save-to-ai-folder', destination: `${BACKEND_URL}/save-to-ai-folder` },
      { source: '/ai-folder-contents', destination: `${BACKEND_URL}/ai-folder-contents` },
      { source: '/work-log', destination: `${BACKEND_URL}/work-log` },
      { source: '/ai-chat', destination: `${BACKEND_URL}/ai-chat` },
      { source: '/inventory-status', destination: `${BACKEND_URL}/inventory-status` },
      { source: '/run-integration', destination: `${BACKEND_URL}/run-integration` },
    ];
  },
};

export default nextConfig;
