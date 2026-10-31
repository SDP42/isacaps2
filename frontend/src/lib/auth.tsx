import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, post, setToken } from "./api";
import type { Persona } from "./types";

interface AuthState {
  persona: Persona | null;
  loading: boolean;
  login: (personaId: string) => Promise<Persona>;
  logout: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [persona, setPersona] = useState<Persona | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    api<Persona>("/v1/auth/me")
      .then(setPersona)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      setToken(null);
      setPersona(null);
    };
    window.addEventListener("mirage:unauthorized", onUnauthorized);
    return () => window.removeEventListener("mirage:unauthorized", onUnauthorized);
  }, []);

  const login = useCallback(async (personaId: string) => {
    const r = await post<{ token: string; persona: Persona }>("/v1/auth/login", { persona_id: personaId });
    setToken(r.token);
    setPersona(r.persona);
    return r.persona;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setPersona(null);
  }, []);

  return <Ctx.Provider value={{ persona, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
