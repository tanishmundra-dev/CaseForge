"use client";
import { usePathname } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth";
import InstructorNavbar from "@/components/shared/InstructorNavbar";
import StudentNavbar from "@/components/shared/StudentNavbar";
import { Loader2 } from "lucide-react";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  // No navbar on auth pages
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  // No navbar in sandbox (dark theme code editor)
  const isSandbox = pathname.includes("/sandbox") || pathname.includes("/assignments/");

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-primary)" }}>
        <Loader2 size={32} className="animate-pulse-slow" color="var(--accent)" />
      </div>
    );
  }

  if (isAuthPage || !user) {
    return <>{children}</>;
  }

  if (isSandbox) {
    return <>{children}</>;
  }

  return (
    <>
      {pathname.startsWith("/instructor") ? <InstructorNavbar /> : <StudentNavbar />}
      {children}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ShellInner>{children}</ShellInner>
    </AuthProvider>
  );
}
