import { createContext } from "react";
import type { User } from "@/lib/api-types";

// The context lives here rather than beside AuthProvider so that file exports
// only its component: React Fast Refresh degrades to a full reload for any
// module that mixes component and non-component exports.

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface RegisterInput {
  email: string;
  password: string;
  full_name: string;
  branch_id: string;
}

export interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
