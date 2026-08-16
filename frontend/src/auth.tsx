import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiFetch, getToken, setToken, clearToken } from "@/src/api";

export type User = {
  id: string;
  role: "elder" | "child";
  name: string;
  phone?: string;
  email?: string;
  family_code?: string;
  elder_id?: string;
  elder_name?: string;
  location?: string;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signInElder: (phone: string, pin: string) => Promise<void>;
  signUpElder: (name: string, phone: string, pin: string) => Promise<void>;
  signInChild: (email: string, password: string) => Promise<void>;
  signUpChild: (name: string, email: string, password: string, family_code: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      const t = await getToken();
      if (!t) {
        setUser(null);
        return;
      }
      const me = await apiFetch<User>("/auth/me");
      setUser(me);
    } catch {
      await clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const afterAuth = async (res: { access_token: string; user: User }) => {
    await setToken(res.access_token);
    setUser(res.user);
  };

  const signInElder = async (phone: string, pin: string) => {
    const res = await apiFetch<any>("/auth/elder/login", { method: "POST", auth: false, body: { phone, pin } });
    await afterAuth(res);
  };
  const signUpElder = async (name: string, phone: string, pin: string) => {
    const res = await apiFetch<any>("/auth/elder/signup", { method: "POST", auth: false, body: { name, phone, pin } });
    await afterAuth(res);
  };
  const signInChild = async (email: string, password: string) => {
    const res = await apiFetch<any>("/auth/child/login", { method: "POST", auth: false, body: { email, password } });
    await afterAuth(res);
  };
  const signUpChild = async (name: string, email: string, password: string, family_code: string) => {
    const res = await apiFetch<any>("/auth/child/signup", { method: "POST", auth: false, body: { name, email, password, family_code } });
    await afterAuth(res);
  };
  const signOut = async () => {
    await clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInElder, signUpElder, signInChild, signUpChild, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
