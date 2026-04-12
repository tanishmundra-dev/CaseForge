"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";

const API = "http://localhost:8000/api";

interface User {
  id: string;
  name: string;
  email: string;
  role: "instructor" | "student";
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  signup: (name: string, email: string, password: string) => Promise<{ error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null, token: null, loading: true,
  login: async () => ({}), signup: async () => ({}), logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Check stored token on mount
  useEffect(() => {
    const stored = localStorage.getItem("caseforge_token");
    if (stored) {
      fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${stored}` } })
        .then((r) => r.json())
        .then((data) => {
          if (data.user) {
            setUser(data.user);
            setToken(stored);
          } else {
            localStorage.removeItem("caseforge_token");
          }
        })
        .catch(() => localStorage.removeItem("caseforge_token"))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Route protection
  useEffect(() => {
    if (loading) return;

    const isAuthPage = pathname === "/login" || pathname === "/signup";

    if (!user && !isAuthPage) {
      router.replace("/login");
      return;
    }

    if (user && isAuthPage) {
      router.replace(user.role === "instructor" ? "/instructor/case-studies" : "/student/courses");
      return;
    }

    // Students can't access /instructor/*
    if (user?.role === "student" && pathname.startsWith("/instructor")) {
      router.replace("/student/courses");
      return;
    }

    // Instructors going to /student/* is allowed (admin access)
  }, [user, loading, pathname, router]);

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || "Login failed" };

      localStorage.setItem("caseforge_token", data.token);
      setToken(data.token);
      setUser(data.user);

      // Redirect by role
      if (data.user.role === "instructor") router.push("/instructor/case-studies");
      else router.push("/student/courses");

      return {};
    } catch {
      return { error: "Network error" };
    }
  };

  const signup = async (name: string, email: string, password: string) => {
    try {
      const res = await fetch(`${API}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || "Signup failed" };

      localStorage.setItem("caseforge_token", data.token);
      setToken(data.token);
      setUser(data.user);
      router.push("/student/courses");
      return {};
    } catch {
      return { error: "Network error" };
    }
  };

  const logout = () => {
    localStorage.removeItem("caseforge_token");
    localStorage.removeItem("caseforge_draft");
    setUser(null);
    setToken(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
