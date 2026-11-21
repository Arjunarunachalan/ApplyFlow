"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  FileText,
  Menu,
  Send,
  Sparkles,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import InstallAppButton from "@/components/InstallAppButton";

const NAV_ITEMS = [
  { href: "/", label: "Jobs", icon: Briefcase },
  { href: "/applications", label: "Applications", icon: Send },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/import", label: "Add / Import Jobs", icon: Upload },
  { href: "/resumes", label: "Resumes", icon: FileText },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 md:hidden">
      <Link href="/" className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="font-semibold text-white text-sm">ApplyFlow</span>
      </Link>

      <div className="flex items-center gap-2">
        <InstallAppButton variant="compact" />
        <button
          onClick={() => setOpen(!open)}
          className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white"
          aria-label="Toggle navigation menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="fixed inset-x-0 top-14 bottom-0 z-50 flex flex-col bg-zinc-950/95 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <nav className="flex flex-col gap-1.5">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
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

          <div className="mt-auto pb-6">
            <InstallAppButton />
          </div>
        </div>
      )}
    </header>
  );
}
