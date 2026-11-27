"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import MobileNav from "@/components/MobileNav";
import Sidebar from "@/components/Sidebar";
import { setUnauthorizedHandler } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";

export default function AuthGate({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  const authenticated = useAuthStore((s) => s.authenticated);
  const loading = useAuthStore((s) => s.loading);
  const checkStatus = useAuthStore((s) => s.checkStatus);
  const markUnauthenticated = useAuthStore((s) => s.markUnauthenticated);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      markUnauthenticated();
      router.replace("/login");
    });
    checkStatus();
  }, [checkStatus, markUnauthenticated, router]);

  useEffect(() => {
    if (loading) return;
    if (!authenticated && pathname !== "/login") {
      router.replace("/login");
    } else if (authenticated && pathname === "/login") {
      router.replace("/");
    }
  }, [authenticated, loading, pathname, router]);

  if (pathname === "/login") {
    return <main className="min-h-screen bg-zinc-50">{children}</main>;
  }

  if (loading || !authenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-50 text-zinc-500">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-600">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
          Loading workspace…
        </div>
      </div>
    );
  }

  return (
    <>
      <MobileNav />
      <Sidebar />
      <div className="md:pl-64">
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </>
  );
}
