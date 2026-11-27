"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Briefcase,
  Camera,
  CheckCircle2,
  Clock,
  FileEdit,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Mail,
  Send,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";

import InstallAppButton from "@/components/InstallAppButton";
import { useAuthStore } from "@/store/useAuthStore";

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/quick-apply", label: "Quick Apply", icon: Camera },
  { href: "/pending", label: "Pending Vacancies", icon: Clock },
  { href: "/vacancies", label: "All Vacancies", icon: Briefcase },
  { href: "/drafts", label: "Email Drafts", icon: FileEdit },
  { href: "/queue", label: "Sending Queue", icon: Send },
  { href: "/sent", label: "Sent Applications", icon: CheckCircle2 },
  { href: "/failed", label: "Failed Applications", icon: AlertTriangle },
  { href: "/imports", label: "Import History", icon: History },
  { href: "/resumes", label: "Resume Profiles", icon: FileText },
  { href: "/settings/email", label: "Email Settings", icon: Mail },
  { href: "/settings/ai", label: "AI Settings", icon: SlidersHorizontal },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const authRequired = useAuthStore((s) => s.authRequired);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-zinc-800 bg-zinc-950 px-3 py-5 md:flex">
      <div className="flex items-center gap-2.5 px-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">ApplyFlow</p>
          <p className="truncate text-xs text-zinc-400">Personal job automation</p>
        </div>
      </div>

      <nav className="mt-5 flex flex-1 flex-col gap-0.5 overflow-y-auto pr-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-3 flex flex-col gap-2 border-t border-zinc-800 pt-3">
        <div className="grid grid-cols-2 gap-1.5">
          <Link
            href="/profile"
            className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
              pathname === "/profile"
                ? "border-indigo-500 bg-zinc-800 text-white"
                : "border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-white"
            }`}
          >
            <UserRound className="h-3.5 w-3.5" />
            Profile
          </Link>
          <Link
            href="/analytics"
            className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
              pathname === "/analytics"
                ? "border-indigo-500 bg-zinc-800 text-white"
                : "border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-white"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Analytics
          </Link>
        </div>

        <InstallAppButton />

        <div className="flex items-center justify-between gap-2 rounded-lg bg-zinc-900 px-2.5 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-zinc-200">{user?.name || "Owner"}</p>
            <p className="truncate text-[11px] text-zinc-500">{user?.email || "Personal Workspace"}</p>
          </div>
          {authRequired ? (
            <button
              type="button"
              onClick={handleLogout}
              title="Sign out"
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
