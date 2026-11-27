"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  LogOut,
  Menu,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import InstallAppButton from "@/components/InstallAppButton";
import { NAV_ITEMS } from "@/components/Sidebar";
import { useAuthStore } from "@/store/useAuthStore";

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 md:hidden">
      <Link href="/" className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-white">ApplyFlow</span>
      </Link>

      <div className="flex items-center gap-2">
        <InstallAppButton variant="compact" />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white"
          aria-label="Toggle navigation menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="fixed inset-x-0 top-14 bottom-0 z-50 flex flex-col overflow-y-auto bg-zinc-950/95 p-4 backdrop-blur-md">
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-800 pt-4">
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-900"
            >
              <UserRound className="h-4 w-4" />
              Profile
            </Link>
            <Link
              href="/analytics"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-900"
            >
              <BarChart3 className="h-4 w-4" />
              Analytics
            </Link>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-zinc-800 px-3 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-900 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      )}
    </header>
  );
}
