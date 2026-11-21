"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  FileText,
  Send,
  Sparkles,
  Upload,
  UserRound,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Jobs", icon: Briefcase },
  { href: "/applications", label: "Applications", icon: Send },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/import", label: "Import CSV", icon: Upload },
  { href: "/resumes", label: "Resumes", icon: FileText },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-zinc-800 bg-zinc-950 px-4 py-6 md:flex">
      <div className="flex items-center gap-2 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500 text-white">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-white">Auto-Apply</p>
          <p className="text-xs text-zinc-400">Job application manager</p>
        </div>
      </div>

      <nav className="mt-8 flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <p className="text-xs font-medium text-zinc-300">Phase 5</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          Gmail IMAP reply &amp; bounce detection, single-job quick add, interview
          tracking, PDF export, and daily digest.
        </p>
      </div>
    </aside>
  );
}
