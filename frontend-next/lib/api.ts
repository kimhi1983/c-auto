/**
 * C-Auto API Client
 * Centralized API configuration for Workers API integration
 */

/** Base URL for the Workers API. Empty string = same-origin (Cloudflare Pages + Workers on same domain) */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

/** Build full API URL from path */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/** Get Authorization header with stored JWT token */
export function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Get Authorization + Content-Type: application/json headers */
export function authJsonHeaders(): Record<string, string> {
  return { ...authHeaders(), 'Content-Type': 'application/json' };
}
