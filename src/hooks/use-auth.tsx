import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { clearSupabaseAuthStorage, supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const RECOVERABLE_AUTH_ERROR = /invalid jwt|jwt expired|invalid refresh token|refresh token|session/i;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const applySession = (nextSession: Session | null, nextUser?: User | null) => {
      if (!isMounted) return;
      setSession(nextSession);
      setUser(nextUser ?? nextSession?.user ?? null);
      setLoading(false);
    };

    const isRecoverableAuthError = (message?: string) => RECOVERABLE_AUTH_ERROR.test(message ?? "");

    const clearInvalidSession = async () => {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      clearSupabaseAuthStorage();
      applySession(null);
    };

    const validateInitialSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        if (isRecoverableAuthError(error.message)) {
          await clearInvalidSession();
        } else {
          applySession(null);
        }
        return;
      }

      const initialSession = data.session;
      if (!initialSession) {
        applySession(null);
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser(initialSession.access_token);
      if (userError) {
        if (isRecoverableAuthError(userError.message)) {
          await clearInvalidSession();
        } else {
          applySession(initialSession);
        }
        return;
      }

      applySession(initialSession, userData.user ?? initialSession.user ?? null);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });

    void validateInitialSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, displayName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    let { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error && RECOVERABLE_AUTH_ERROR.test(error.message || "")) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      clearSupabaseAuthStorage();
      ({ error } = await supabase.auth.signInWithPassword({ email, password }));
    }
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      if (RECOVERABLE_AUTH_ERROR.test(error.message || "")) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        clearSupabaseAuthStorage();
        return;
      }
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    // Return safe defaults when outside provider (e.g. during HMR)
    return {
      user: null,
      session: null,
      loading: true,
      signUp: async () => {},
      signIn: async () => {},
      signOut: async () => {},
      resetPassword: async () => {},
    } as AuthContextType;
  }
  return context;
}
