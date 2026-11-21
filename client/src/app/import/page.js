"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Upload,
} from "lucide-react";
import { useJobStore } from "@/store/useJobStore";

export default function ImportPage() {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);

  const importing = useJobStore((state) => state.importing);
  const error = useJobStore((state) => state.error);
  const lastImport = useJobStore((state) => state.lastImport);
  const importCsv = useJobStore((state) => state.importCsv);

  const chooseFile = (selected) => {
    if (!selected) return;
    setFile(selected);
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!file) return;
    await importCsv(file);
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Import jobs</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload a CSV of job leads. Columns are matched case-insensitively and duplicates are skipped.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
            dragging
              ? "border-indigo-400 bg-indigo-50/60"
              : "border-zinc-200 bg-zinc-50/60"
          }`}
        >
          <span className="rounded-full bg-white p-3 text-indigo-600 shadow-sm">
            <Upload className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-800">
              Drag and drop your .csv here
            </p>
            <p className="mt-1 text-xs text-zinc-500">or pick a file from your computer (max 5 MB)</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            Choose file
          </button>

          {file ? (
            <p className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs text-zinc-600 shadow-sm">
              <FileText className="h-3.5 w-3.5 text-indigo-500" />
              {file.name}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <a
            href="/sample-jobs.csv"
            download="sample-jobs.csv"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <Download className="h-4 w-4" />
            Download Sample CSV
          </a>

          <button
            type="submit"
            disabled={!file || importing}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {importing ? "Importing…" : "Import jobs"}
          </button>
        </div>

        {error ? (
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </form>

      {lastImport ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-6">
          <div className="flex items-center gap-2 text-emerald-800">
            <CheckCircle2 className="h-5 w-5" />
            <h2 className="text-sm font-semibold">Import finished</h2>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-4">
            {[
              ["Imported", lastImport.imported],
              ["Skipped duplicates", lastImport.skippedDuplicates],
              ["Invalid rows", lastImport.invalidRows],
              ["Total processed", lastImport.totalProcessed],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-white px-4 py-3 shadow-sm">
                <dt className="text-xs font-medium text-zinc-500">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold text-zinc-900">{value}</dd>
              </div>
            ))}
          </dl>

          <Link
            href="/"
            className="mt-4 inline-flex text-sm font-medium text-emerald-800 hover:underline"
          >
            View imported jobs →
          </Link>
        </section>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Expected columns</h2>
        <p className="mt-2 leading-relaxed">
          <code className="rounded bg-zinc-100 px-1">Company Name</code>,{" "}
          <code className="rounded bg-zinc-100 px-1">Job Role</code>,{" "}
          <code className="rounded bg-zinc-100 px-1">HR Email</code>,{" "}
          <code className="rounded bg-zinc-100 px-1">Apply URL</code>,{" "}
          <code className="rounded bg-zinc-100 px-1">Job Description</code>,{" "}
          <code className="rounded bg-zinc-100 px-1">Location</code>,{" "}
          <code className="rounded bg-zinc-100 px-1">Company Website</code>,{" "}
          <code className="rounded bg-zinc-100 px-1">Salary</code>,{" "}
          <code className="rounded bg-zinc-100 px-1">Email Source</code>
        </p>
        <p className="mt-3 text-xs text-zinc-500">
          Rows with a valid HR email become email applications. Rows without one need an apply URL
          to become portal applications; rows with neither are counted as invalid.
        </p>
      </section>
    </div>
  );
}
