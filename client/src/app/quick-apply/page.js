"use client";

import Link from "next/link";
import { ArrowRight, Camera, ClipboardPaste, FileEdit, Sparkles, Upload } from "lucide-react";

export default function QuickApplyPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
            <Sparkles className="h-3.5 w-3.5" />
            Phase 2 Feature Preview
          </span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
            Quick Apply / Screenshot Import
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Capture one or multiple screenshots of a job posting, paste or upload them, and let Vision
            AI extract a unified structured vacancy.
          </p>
        </div>

        <Link
          href="/import"
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
        >
          <FileEdit className="h-4 w-4" />
          Use Manual / CSV Import Now
        </Link>
      </header>

      <section className="rounded-xl border-2 border-dashed border-zinc-300 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <Camera className="h-6 w-6" />
          </span>
          <p className="text-base font-semibold text-zinc-900">
            Drop screenshots here, click to upload, or press Ctrl + V to paste.
          </p>
          <p className="text-xs leading-relaxed text-zinc-500">
            Multi-image Vision AI extraction, clipboard pasting (`image/png`, `image/jpeg`,
            `image/webp`), confidence scoring, cross-screenshot conflict flags, and confirmation review
            are scheduled for <strong>Phase 2</strong> right after you sign off on Phase 1.
          </p>

          <div className="mt-3 flex flex-wrap justify-center gap-2.5">
            <Link
              href="/import"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              <Upload className="h-4 w-4" />
              Go to Manual Entry / CSV Upload
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: ClipboardPaste,
            title: "1. Paste or Drop Screenshots",
            desc: "Mix Windows Snipping Tool pastes (Ctrl + V) and uploaded images for multi-screen job descriptions.",
          },
          {
            icon: Sparkles,
            title: "2. Vision Extraction & Review",
            desc: "AI combines all images into one vacancy record, tracks field confidence, and flags any conflicts.",
          },
          {
            icon: FileEdit,
            title: "3. Discovery & Grounded Draft",
            desc: "Public recruitment contact discovery finds legitimate HR emails before drafting with your selected resume.",
          },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <Icon className="h-5 w-5 text-indigo-600" />
            <h2 className="mt-3 text-sm font-semibold text-zinc-900">{title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">{desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
