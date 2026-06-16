/**
 * Centralised backend API base URL.
 * - In development: reads from .env.local → NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
 * - In production (Vercel): set NEXT_PUBLIC_API_URL to your deployed Django backend URL
 *   e.g. https://biodose-api.onrender.com
 */
// In production (Vercel deployed domain), always use the live Railway backend.
// In local development (localhost), use the local Django backend.
let baseUrl = "https://biodose-intelligent-food-quality-consumer-safe-production.up.railway.app";

if (typeof window !== "undefined") {
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";
  }
}

export const API_BASE_URL = baseUrl;
