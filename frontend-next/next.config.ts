import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // API v1 endpoints
      { source: '/api/:path*', destination: 'http://localhost:8001/api/:path*' },
      // Legacy backend endpoints
      { source: '/check-emails', destination: 'http://localhost:8001/check-emails' },
      { source: '/search-files', destination: 'http://localhost:8001/search-files' },
      { source: '/save-to-ai-folder', destination: 'http://localhost:8001/save-to-ai-folder' },
      { source: '/ai-folder-contents', destination: 'http://localhost:8001/ai-folder-contents' },
      { source: '/work-log', destination: 'http://localhost:8001/work-log' },
      { source: '/ai-chat', destination: 'http://localhost:8001/ai-chat' },
      { source: '/inventory-status', destination: 'http://localhost:8001/inventory-status' },
      { source: '/run-integration', destination: 'http://localhost:8001/run-integration' },
    ];
  },
};

export default nextConfig;
