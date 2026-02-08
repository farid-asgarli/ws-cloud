/**
 * Authentication types for the frontend.
 */

/**
 * User information from the server.
 */
export interface User {
  id: string;
  email: string;
  displayName?: string;
  createdAt: string;
}

/**
 * Authentication response from login/register.
 */
export interface AuthResponse {
  token: string;
  expiresAt: string;
  user: User;
}

/**
 * Login request payload.
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Auth error response from the server.
 */
export interface AuthErrorResponse {
  message: string;
  errors?: string[];
}
