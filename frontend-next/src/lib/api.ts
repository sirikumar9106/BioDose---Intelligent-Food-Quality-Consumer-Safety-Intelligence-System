/**
 * Centralised backend API base URL.
 * - In development: reads from .env.local → NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
 * - In production (Vercel): set NEXT_PUBLIC_API_URL to your deployed Django backend URL
 *   e.g. https://biodose-api.onrender.com
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";
