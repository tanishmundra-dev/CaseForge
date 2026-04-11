"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  // Hide navbar in sandbox (full-screen dark mode)
  if (pathname.includes("/sandbox")) return null;

  const tabs = [
    { label: "Courses", href: "/trainee/courses" },
    { label: "My Progress", href: "/trainee/progress" },
    { label: "Instructor", href: "/instructor/mission-control" },
  ];

  return (
    <nav
      style={{
        borderBottom: "1px solid var(--border)",
        padding: "0 48px",
        position: "sticky",
        top: 0,
        zIndex: 100,
        backdropFilter: "blur(12px)",
        backgroundColor: "rgba(250, 250, 247, 0.9)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          height: 56,
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <Link
          href="/trainee/courses"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            textDecoration: "none",
          }}
        >
          <span style={{ color: "var(--text-heading)" }}>case</span>
          <span style={{ color: "var(--accent)" }}>-forge</span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          {tabs.map((tab) => {
            const isActive =
              pathname === tab.href ||
              (tab.href.startsWith("/instructor") && pathname.startsWith("/instructor")) ||
              (tab.href === "/trainee/courses" && pathname.startsWith("/trainee/courses"));

            return (
              <Link
                key={tab.href}
                href={tab.href}
                style={{
                  fontSize: 15,
                  fontWeight: 500,
                  textDecoration: "none",
                  fontFamily: "var(--font-body)",
                  color: isActive ? "var(--accent)" : "var(--text-secondary)",
                  transition: "color 0.2s ease",
                }}
              >
                {tab.label}
              </Link>
            );
          })}

          <div style={{ width: 1, height: 20, background: "var(--border)" }} />

          <span
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              fontFamily: "var(--font-body)",
            }}
          >
            demo
          </span>
        </div>
      </div>
    </nav>
  );
}
