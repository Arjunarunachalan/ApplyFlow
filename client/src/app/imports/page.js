"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Camera,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  History,
  PlusCircle,
  RefreshCw,
} from "lucide-react";
import { errorMessage, importsApi } from "@/lib/api";

const formatDate = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export default function ImportHistoryPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await importsApi.list({ page, limit: 20, importType: typeFilter });
      setItems(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter]);

  useEffect(() => {
    let active = true;
    importsApi
      .list({ page, limit: 20, importType: typeFilter })
      .then((data) => {
        if (!active) return;
        setItems(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setError(null);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, typeFilter]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Import History</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Audit trail of screenshot imports, CSV/XLSX bulk uploads, and manual vacancy entries.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/quick-apply"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            <Camera className="h-3.5 w-3.5 text-indigo-600" />
            Quick Apply
          </Link>
          <Link
            href="/import"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Add / Import CSV &amp; Manual
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-1 shadow-sm">
          {[
            { value: "all", label: "All Sources" },
            { value: "screenshot", label: "Screenshots" },
            { value: "csv", label: "CSV" },
            { value: "xlsx", label: "Excel" },
            { value: "manual", label: "Manual" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setPage(1);
                setTypeFilter(opt.value);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                typeFilter === opt.value
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <p className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Source Type</th>
                <th className="px-4 py-3">File / Label</th>
                <th className="px-4 py-3">Records</th>
                <th className="px-4 py-3">Imported</th>
                <th className="px-4 py-3">Duplicates</th>
                <th className="px-4 py-3">Errors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <History className="h-6 w-6 text-zinc-400" />
                      <p className="text-sm font-medium text-zinc-700">No import batches recorded yet</p>
                      <p className="text-xs text-zinc-500">
                        Future screenshot, CSV, XLSX, and manual vacancy imports appear here automatically.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : null}

              {items.map((batch) => (
                <tr key={batch._id} className="hover:bg-zinc-50/70">
                  <td className="px-4 py-3 text-xs text-zinc-600">{formatDate(batch.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium uppercase text-zinc-700">
                      <FileSpreadsheet className="h-3 w-3 text-indigo-500" />
                      {batch.importType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-zinc-900">
                    {batch.fileName || batch.sourceLabel || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-zinc-700">
                    {batch.totalRecords}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium tabular-nums text-emerald-700">
                    {batch.importedCount}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-zinc-500">
                    {batch.skippedDuplicates}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {batch.failedCount > 0 ? (
                      <span className="font-medium text-rose-700">
                        {batch.failedCount} error(s)
                      </span>
                    ) : (
                      <span className="text-zinc-400">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > 20 ? (
          <footer className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
            <span>
              Page {page} of {totalPages} ({total} total)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2.5 py-1 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2.5 py-1 disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
