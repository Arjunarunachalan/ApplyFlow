"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  RefreshCw,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { useJobStore } from "@/store/useJobStore";

const formatDate = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default function ResumesPage() {
  const fileInputRef = useRef(null);

  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [makeDefault, setMakeDefault] = useState(false);
  const [previewId, setPreviewId] = useState(null);

  const resumes = useJobStore((state) => state.resumes);
  const loading = useJobStore((state) => state.resumesLoading);
  const uploading = useJobStore((state) => state.uploading);
  const parsingResumeId = useJobStore((state) => state.parsingResumeId);
  const error = useJobStore((state) => state.resumeError);
  const fetchResumes = useJobStore((state) => state.fetchResumes);
  const uploadResume = useJobStore((state) => state.uploadResume);
  const reparseResume = useJobStore((state) => state.reparseResume);
  const setDefaultResume = useJobStore((state) => state.setDefaultResume);
  const deleteResume = useJobStore((state) => state.deleteResume);

  useEffect(() => {
    fetchResumes();
  }, [fetchResumes]);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!file) return;

    const uploaded = await uploadResume(file, { title, isDefault: makeDefault });
    if (uploaded) {
      setFile(null);
      setTitle("");
      setMakeDefault(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onParse = async (resume) => {
    const parsed = await reparseResume(resume._id);
    if (parsed?.extractedText) setPreviewId(parsed._id);
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Resumes</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Keep PDF resumes ready to attach. The default resume is used for new
          applications, and the extracted text is what the AI writes from.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:grid-cols-[1fr_auto] sm:items-end"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-600">Title (optional)</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Backend resume 2026"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-600">PDF file</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 shadow-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-700"
            />
          </label>
        </div>

        <div className="flex items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={makeDefault}
              onChange={(event) => setMakeDefault(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-200"
            />
            Set as default
          </label>

          <button
            type="submit"
            disabled={!file || uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>

        {error ? (
          <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </form>

      {/* Desktop view: table */}
      <section className="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3">Resume</th>
                <th className="px-5 py-3">File</th>
                <th className="px-5 py-3">Uploaded</th>
                <th className="px-5 py-3">AI Text</th>
                <th className="px-5 py-3">Default</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading && resumes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-zinc-500">
                    Loading resumes…
                  </td>
                </tr>
              ) : null}

              {!loading && resumes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-sm text-zinc-500">
                    No resumes uploaded yet. Add a PDF above.
                  </td>
                </tr>
              ) : null}

              {resumes.map((resume) => {
                const charCount = (resume.extractedText || "").length;
                const parsed = charCount > 0;
                const parsing = parsingResumeId === resume._id;
                const expanded = previewId === resume._id && parsed;

                return (
                  <Fragment key={resume._id}>
                    <tr className="align-top hover:bg-zinc-50/70">
                      <td className="px-5 py-3">
                        <p className="flex items-center gap-2 font-medium text-zinc-900">
                          <FileText className="h-4 w-4 text-indigo-500" />
                          {resume.title}
                        </p>
                      </td>
                      <td className="max-w-xs px-5 py-3 text-zinc-600">
                        <span className="break-all">{resume.fileName}</span>
                      </td>
                      <td className="px-5 py-3 text-zinc-500">{formatDate(resume.uploadedAt)}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col items-start gap-1.5">
                          {parsed ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                              <CheckCircle2 className="h-3 w-3" />
                              Text Parsed ({charCount.toLocaleString()} chars)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                              <AlertCircle className="h-3 w-3" />
                              Not Parsed
                            </span>
                          )}

                          {parsed ? (
                            <button
                              type="button"
                              onClick={() => setPreviewId(expanded ? null : resume._id)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                            >
                              {expanded ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                              {expanded ? "Hide Extracted Text" : "Preview Extracted Text"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onParse(resume)}
                              disabled={parsing}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {parsing ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                              {parsing ? "Parsing…" : "Parse Now"}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {resume.isDefault ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                            <Star className="h-3 w-3" />
                            Default
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setDefaultResume(resume._id)}
                            disabled={resume.isDefault}
                            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Make default
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteResume(resume._id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>

                    {expanded ? (
                      <tr className="bg-zinc-50/70">
                        <td colSpan={6} className="px-5 py-4">
                          <p className="mb-2 text-xs font-medium text-zinc-500">
                            Exactly what the AI generator reads
                            {resume.parsedAt ? ` · parsed ${formatDate(resume.parsedAt)}` : ""}:
                          </p>
                          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-zinc-700">
                            {resume.extractedText}
                          </pre>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Mobile / Responsive view: Resume cards */}
      <section className="flex flex-col gap-4 md:hidden">
        {loading && resumes.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
            Loading resumes…
          </div>
        ) : null}

        {!loading && resumes.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
            No resumes uploaded yet. Add a PDF above.
          </div>
        ) : null}

        {resumes.map((resume) => {
          const charCount = (resume.extractedText || "").length;
          const parsed = charCount > 0;
          const parsing = parsingResumeId === resume._id;
          const expanded = previewId === resume._id && parsed;

          return (
            <div
              key={resume._id}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
                  <div>
                    <h3 className="font-medium text-zinc-900">{resume.title}</h3>
                    <p className="mt-0.5 break-all text-xs text-zinc-500">{resume.fileName}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      Uploaded {formatDate(resume.uploadedAt)}
                    </p>
                  </div>
                </div>
                {resume.isDefault ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                    <Star className="h-3 w-3" />
                    Default
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-zinc-100 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col items-start gap-1">
                    {parsed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        <CheckCircle2 className="h-3 w-3" />
                        Text Parsed ({charCount.toLocaleString()} chars)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                        <AlertCircle className="h-3 w-3" />
                        Not Parsed
                      </span>
                    )}

                    {parsed ? (
                      <button
                        type="button"
                        onClick={() => setPreviewId(expanded ? null : resume._id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        {expanded ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                        {expanded ? "Hide Extracted Text" : "Preview Extracted Text"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onParse(resume)}
                        disabled={parsing}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {parsing ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        {parsing ? "Parsing…" : "Parse Now"}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {!resume.isDefault ? (
                      <button
                        type="button"
                        onClick={() => setDefaultResume(resume._id)}
                        className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
                      >
                        Make default
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => deleteResume(resume._id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>

                {expanded ? (
                  <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                    <p className="mb-2 text-xs font-medium text-zinc-500">
                      Exactly what the AI generator reads
                      {resume.parsedAt ? ` · parsed ${formatDate(resume.parsedAt)}` : ""}:
                    </p>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-700">
                      {resume.extractedText}
                    </pre>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
