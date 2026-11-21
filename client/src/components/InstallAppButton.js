"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Download,
  PlusSquare,
  Share,
  Smartphone,
  X,
} from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";

export function IOSInstallModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Smartphone className="h-4 w-4" />
            </span>
            <h3 className="font-semibold text-zinc-100">Install ApplyFlow on iOS</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-xs text-zinc-400 leading-relaxed">
          Install ApplyFlow to your home screen for full-screen standalone access, faster load times, and offline capabilities.
        </p>

        <div className="mt-5 space-y-3.5">
          <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-xs font-semibold text-zinc-300">
              1
            </span>
            <div className="text-xs text-zinc-300">
              Tap the <strong className="text-indigo-400">Share</strong> button{" "}
              <Share className="inline-block h-3.5 w-3.5 text-indigo-400 align-text-bottom" /> in Safari's bottom toolbar.
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-xs font-semibold text-zinc-300">
              2
            </span>
            <div className="text-xs text-zinc-300">
              Scroll down the menu and tap{" "}
              <strong className="text-indigo-400">Add to Home Screen</strong>{" "}
              <PlusSquare className="inline-block h-3.5 w-3.5 text-indigo-400 align-text-bottom" />.
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-xs font-semibold text-zinc-300">
              3
            </span>
            <div className="text-xs text-zinc-300">
              Tap <strong className="text-indigo-400">Add</strong> in the top-right corner to complete installation.
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-lg bg-indigo-600 py-2.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

export default function InstallAppButton({ className = "", variant = "sidebar" }) {
  const {
    isInstallable,
    isInstalled,
    showIOSModal,
    setShowIOSModal,
    promptInstall,
  } = usePwaInstall();

  // If already installed, hide the install button
  if (isInstalled) {
    if (variant === "badge") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="h-3.5 w-3.5" />
          App Installed
        </span>
      );
    }
    return null;
  }

  // If not installable and not iOS, don't show prompt
  if (!isInstallable) {
    return null;
  }

  if (variant === "compact") {
    return (
      <>
        <button
          onClick={promptInstall}
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 active:scale-95 ${className}`}
        >
          <Download className="h-3.5 w-3.5" />
          Install App
        </button>
        <IOSInstallModal
          isOpen={showIOSModal}
          onClose={() => setShowIOSModal(false)}
        />
      </>
    );
  }

  return (
    <>
      <button
        onClick={promptInstall}
        type="button"
        className={`group flex w-full items-center justify-between gap-3 rounded-lg border border-indigo-500/30 bg-gradient-to-r from-indigo-950/80 to-zinc-900 px-3 py-2.5 text-left text-xs font-medium text-zinc-200 transition-all hover:border-indigo-500/60 hover:text-white ${className}`}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white shadow-sm group-hover:scale-105 transition-transform">
            <Download className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="font-semibold text-zinc-100">Install ApplyFlow</p>
            <p className="text-[11px] text-zinc-400">Desktop &amp; Mobile App</p>
          </div>
        </div>
      </button>

      <IOSInstallModal
        isOpen={showIOSModal}
        onClose={() => setShowIOSModal(false)}
      />
    </>
  );
}
