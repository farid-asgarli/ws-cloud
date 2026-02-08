/**
 * Authentication service for login, register, and logout.
 */

import { API_BASE_URL, ApiError } from "./api";
import type { AuthResponse, LoginRequest, User, AuthErrorResponse } from "./authTypes";

const AUTH_API = "/api/auth";
const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
const EXPIRES_KEY = "auth_expires";

/**
 * Get the stored auth token.
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Get the stored user.
 */
export function getStoredUser(): User | null {
  const userJson = localStorage.getItem(USER_KEY);
  if (!userJson) return null;
  try {
    return JSON.parse(userJson) as User;
  } catch {
    return null;
  }
}

/**
 * Check if the token is expired.
 */
export function isTokenExpired(): boolean {
  const expires = localStorage.getItem(EXPIRES_KEY);
  if (!expires) return true;
  return new Date(expires) <= new Date();
}

/**
 * Check if the user is authenticated.
 */
export function isAuthenticated(): boolean {
  const token = getToken();
  return !!token && !isTokenExpired();
}

/**
 * Store authentication data.
 */
function storeAuth(response: AuthResponse): void {
  localStorage.setItem(TOKEN_KEY, response.token);
  localStorage.setItem(USER_KEY, JSON.stringify(response.user));
  localStorage.setItem(EXPIRES_KEY, response.expiresAt);
}

/**
 * Clear authentication data.
 */
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}

/**
 * Login with email and password.
 */
export async function login(request: LoginRequest): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}${AUTH_API}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = (await response.json()) as AuthErrorResponse;
    throw new ApiError(response.status, error.message, error.errors);
  }

  const authResponse = (await response.json()) as AuthResponse;
  storeAuth(authResponse);
  return authResponse;
}

/**
 * Logout the current user.
 */
export async function logout(): Promise<void> {
  const token = getToken();
  if (token) {
    try {
      await fetch(`${API_BASE_URL}${AUTH_API}/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      // Ignore errors during logout
    }
  }
  clearAuth();
}

/**
 * Get current user info from the server.
 */
export async function getCurrentUser(): Promise<User> {
  const token = getToken();
  if (!token) {
    throw new ApiError(401, "Not authenticated");
  }

  const response = await fetch(`${API_BASE_URL}${AUTH_API}/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearAuth();
    }
    throw new ApiError(response.status, "Failed to get user info");
  }

  return (await response.json()) as User;
}

/**
 * Get authorization headers for API requests.
 */
export function getAuthHeaders(): HeadersInit {
  const token = getToken();
  if (!token) {
    return {};
  }
  return {
    Authorization: `Bearer ${token}`,
  };
}
