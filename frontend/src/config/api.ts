/**
 * Application API Gateway Configuration
 * Supports environment variables (VITE_API_BASE_URL) for production deployment
 * and dynamic relative paths for Vite LAN proxying during Wi-Fi field tests.
 */

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const ENDPOINTS = {
  TELEMETRY_STREAM: `${API_BASE_URL}/telemetry/stream`,
  TELEMETRY_PING: `${API_BASE_URL}/telemetry/ping`,
  TELEMETRY_BATCH_DRAIN: `${API_BASE_URL}/telemetry/batch-drain`,
} as const;

export type ApiEndpoints = typeof ENDPOINTS;
