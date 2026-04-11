"use client";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role === "instructor") router.replace("/instructor/case-studies");
    else router.replace("/student/courses");
  }, [user, loading, router]);

  return null;
}
