/**
 * Authentication context for managing user authentication state.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { User, LoginRequest } from "@/services/authTypes";
import {
  getStoredUser,
  isAuthenticated as checkAuth,
  login as authLogin,
  logout as authLogout,
  clearAuth,
} from "@/services/authService";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (request: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state from localStorage
  useEffect(() => {
    const initAuth = () => {
      if (checkAuth()) {
        const storedUser = getStoredUser();
        setUser(storedUser);
      } else {
        clearAuth();
        setUser(null);
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = useCallback(async (request: LoginRequest) => {
    const response = await authLogin(request);
    setUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    setUser(null);
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context.
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Re-export types for convenience
export type { LoginRequest } from "@/services/authTypes";
