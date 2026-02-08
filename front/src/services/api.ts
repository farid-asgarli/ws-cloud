/**
 * API configuration and base utilities.
 */

import { getAuthHeaders, clearAuth } from "./authService";

// Base API URL - can be configured via environment variables
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
export const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || "ws://localhost:5000";

/**
 * API error class with status code and message.
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Base fetch wrapper with error handling and automatic auth.
 */
export async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options?.headers,
    },
  });

  // Handle 401 Unauthorized - clear auth and redirect
  if (response.status === 401) {
    clearAuth();
    // Trigger page reload to redirect to login
    window.location.href = "/login";
    throw new ApiError(401, "Session expired. Please log in again.");
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || response.statusText);
  }

  // Handle empty responses
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}
