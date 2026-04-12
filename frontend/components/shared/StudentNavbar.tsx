"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { LogOut, BookOpen, TrendingUp, MessageSquare } from "lucide-react";

const NAV_ITEMS = [
  { label: "My Courses", href: "/student/courses", icon: BookOpen },
  { label: "My Progress", href: "/student/progress", icon: TrendingUp },
  { label: "AI Feedback", href: "/student/feedback", icon: MessageSquare },
];

export default function StudentNavbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <nav style={{
      height: 56, background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)",
      display: "flex", alignItems: "center", padding: "0 24px", position: "sticky", top: 0, zIndex: 100,
      backdropFilter: "blur(12px)",
    }}>
      <Link href="/student/courses" style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, marginRight: 32, display: "flex", alignItems: "center", gap: 2 }}>
        <span style={{ color: "var(--text-heading)" }}>case</span>
        <span style={{ color: "var(--accent)" }}>-forge</span>
      </Link>

      <div style={{ display: "flex", gap: 4, flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8,
                fontSize: 13, fontWeight: active ? 600 : 400, transition: "all 0.15s",
                color: active ? "var(--accent)" : "var(--text-secondary)",
                background: active ? "var(--accent-subtle)" : "transparent",
              }}
            >
              <Icon size={15} />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
          {user?.name || "Student"}
        </span>
        <span className="badge badge-neutral" style={{ fontSize: 10, padding: "2px 8px" }}>STUDENT</span>
        <button
          onClick={logout}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex", alignItems: "center", padding: 4 }}
          title="Logout"
        >
          <LogOut size={16} />
        </button>
      </div>
    </nav>
  );
}
