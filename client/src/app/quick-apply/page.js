/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  ClipboardPaste,
  FileSpreadsheet,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { screenshotImportApi } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const MAX_SCREENSHOTS = 10;

const EMPTY_FORM = {
  companyName: "",
  jobRole: "",
  department: "",
  location: "",
  workArrangement: "unspecified",
  employmentType: "",
  experienceRequired: "",
  salary: "",
  hrEmail: "",
  applyUrl: "",
  companyWebsite: "",
  requiredSkillsText: "",
  jobDescription: "",
  applicationDeadline: "",
};

function ConfidenceBadge({ score }) {
  const num = Number(score);
  if (!Number.isFinite(num) || num <= 0) {
    return (
      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
        Not detected
      </span>
    );
  }
  if (num >= 0.8) {
    return (
      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
        {Math.round(num * 100)}% confident
      </span>
    );
  }
  if (num >= 0.5) {
    return (
      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
        {Math.round(num * 100)}% check
      </span>
    );
  }
  return (
    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
      {Math.round(num * 100)}% low
    </span>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function QuickApplyPage() {
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [sessionId, setSessionId] = useState("");
  const [screenshots, setScreenshots] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [extractionError, setExtractionError] = useState("");
  const [saving, setSaving] = useState(false);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [extractionConfidence, setExtractionConfidence] = useState({});
  const [extractionConflicts, setExtractionConflicts] = useState([]);
  const [extractionNotes, setExtractionNotes] = useState("");
  const [userEditedFields, setUserEditedFields] = useState([]);
  const [savedJob, setSavedJob] = useState(null);

  const uploadImageFiles = useCallback(
    async (rawFiles, source = "upload") => {
      const incoming = Array.from(rawFiles || []).filter(Boolean);
      if (incoming.length === 0) return;

      const validImages = incoming.filter((file) => {
        if (ACCEPTED_TYPES.has(file.type)) return true;
        return /\.(png|jpe?g|webp)$/i.test(file.name || "");
      });

      if (validImages.length === 0) {
        toast.error("Only PNG, JPG, JPEG, and WEBP image screenshots are supported.");
        return;
      }

      if (screenshots.length + validImages.length > MAX_SCREENSHOTS) {
        toast.error(`You can attach up to ${MAX_SCREENSHOTS} screenshots per vacancy.`);
        return;
      }

      setUploading(true);
      setExtractionError("");
      setSavedJob(null);

      try {
        const normalizedFiles = validImages.map((file, idx) => {
          if (file.name) return file;
          const ext = (file.type || "image/png").split("/")[1] || "png";
          return new File([file], `pasted-screenshot-${Date.now()}-${idx + 1}.${ext}`, {
            type: file.type || "image/png",
          });
        });

        const res = await screenshotImportApi.upload(normalizedFiles, {
          sessionId: sessionId || undefined,
          source,
          sources: normalizedFiles.map(() => source),
        });

        setSessionId(res.sessionId);
        setScreenshots(res.screenshots || []);
        toast.success(
          `${res.addedCount} ${source === "paste" ? "pasted" : "uploaded"} screenshot${
            res.addedCount === 1 ? "" : "s"
          } ready.`
        );
      } catch (err) {
        toast.error(err.message || "Failed to upload screenshot.");
      } finally {
        setUploading(false);
      }
    },
    [screenshots.length, sessionId, toast]
  );

  const extractImagesFromDataTransfer = useCallback((clipboardData) => {
    if (!clipboardData) return [];
    const files = [];

    if (clipboardData.items && clipboardData.items.length > 0) {
      for (const item of Array.from(clipboardData.items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            const ext = (blob.type || "image/png").split("/")[1] || "png";
            files.push(
              new File([blob], `pasted-screenshot-${Date.now()}-${files.length + 1}.${ext}`, {
                type: blob.type || "image/png",
              })
            );
          }
        }
      }
    }

    if (files.length === 0 && clipboardData.files && clipboardData.files.length > 0) {
      for (const file of Array.from(clipboardData.files)) {
        if (file.type.startsWith("image/")) {
          files.push(file);
        }
      }
    }

    return files;
  }, []);

  // Global Ctrl+V / Cmd+V listener so pasting works anywhere on the page
  useEffect(() => {
    const handleWindowPaste = (event) => {
      const target = event.target;
      const isEditableTarget =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      const imageFiles = extractImagesFromDataTransfer(event.clipboardData);
      if (imageFiles.length > 0) {
        event.preventDefault();
        uploadImageFiles(imageFiles, "paste");
        return;
      }

      if (!isEditableTarget) {
        toast.info("No image found in clipboard. Copy a screenshot (Win + Shift + S) and press Ctrl + V.");
      }
    };

    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, [extractImagesFromDataTransfer, toast, uploadImageFiles]);

  const handlePasteButtonClick = async () => {
    if (!navigator.clipboard || typeof navigator.clipboard.read !== "function") {
      toast.info("Browser clipboard button is unavailable here — press Ctrl + V directly on the page.");
      return;
    }

    try {
      const items = await navigator.clipboard.read();
      const imageFiles = [];
      for (const item of items) {
        const imageType = item.types.find((t) => ACCEPTED_TYPES.has(t) || t.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        const ext = (imageType.split("/")[1] || "png").replace("jpeg", "jpg");
        imageFiles.push(
          new File([blob], `clipboard-${Date.now()}-${imageFiles.length + 1}.${ext}`, {
            type: imageType,
          })
        );
      }

      if (imageFiles.length === 0) {
        toast.error("Clipboard does not contain a PNG, JPG, or WEBP image.");
        return;
      }

      await uploadImageFiles(imageFiles, "paste");
    } catch (err) {
      toast.error(
        err?.name === "NotAllowedError"
          ? "Clipboard permission was denied. Press Ctrl + V directly on the page instead."
          : "Could not read clipboard image. Try pressing Ctrl + V directly on the page."
      );
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      uploadImageFiles(files, "upload");
    }
  };

  const handleRemoveScreenshot = async (id) => {
    try {
      const res = await screenshotImportApi.remove(id);
      setScreenshots(res.screenshots || []);
      if ((res.screenshots || []).length === 0) {
        setReviewOpen(false);
      }
    } catch (err) {
      toast.error(err.message || "Failed to remove screenshot.");
    }
  };

  const handleMoveScreenshot = async (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= screenshots.length) return;

    const next = [...screenshots];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    setScreenshots(next);

    try {
      const res = await screenshotImportApi.reorder(
        sessionId,
        next.map((s) => s._id)
      );
      setScreenshots(res.screenshots || next);
    } catch (err) {
      toast.error(err.message || "Failed to reorder screenshots.");
    }
  };

  const handleClearSession = async () => {
    if (sessionId) {
      try {
        await screenshotImportApi.cancelSession(sessionId);
      } catch {
        // Ignore cleanup errors
      }
    }
    setSessionId("");
    setScreenshots([]);
    setReviewOpen(false);
    setForm(EMPTY_FORM);
    setExtractionConfidence({});
    setExtractionConflicts([]);
    setExtractionNotes("");
    setUserEditedFields([]);
    setExtractionError("");
  };

  const handleExtract = async () => {
    if (!sessionId || screenshots.length === 0) {
      toast.error("Add or paste at least one screenshot first.");
      return;
    }

    setExtracting(true);
    setExtractionError("");
    setExtractionProgress(20);

    const progressTimer = setInterval(() => {
      setExtractionProgress((prev) => (prev < 88 ? prev + 12 : prev));
    }, 550);

    try {
      const res = await screenshotImportApi.extract(sessionId);
      const data = res.extracted || {};

      setExtractionProgress(100);
      setForm({
        companyName: data.companyName || "",
        jobRole: data.jobRole || "",
        department: data.department || "",
        location: data.location || "",
        workArrangement: data.workArrangement || "unspecified",
        employmentType: data.employmentType || "",
        experienceRequired: data.experienceRequired || "",
        salary: data.salary || "",
        hrEmail: data.hrEmail || "",
        applyUrl: data.applyUrl || "",
        companyWebsite: data.companyWebsite || "",
        requiredSkillsText: Array.isArray(data.requiredSkills) ? data.requiredSkills.join(", ") : "",
        jobDescription: data.jobDescription || "",
        applicationDeadline: data.applicationDeadline || "",
      });
      setExtractionConfidence(data.extractionConfidence || {});
      setExtractionConflicts(Array.isArray(data.extractionConflicts) ? data.extractionConflicts : []);
      setExtractionNotes(data.notes || "");
      setUserEditedFields([]);
      setReviewOpen(true);
      toast.success("Vision AI extracted vacancy details. Please review before saving.");
    } catch (err) {
      setExtractionError(err.message || "Vision AI extraction failed.");
      toast.error(err.message || "Vision AI extraction failed.");
    } finally {
      clearInterval(progressTimer);
      setExtracting(false);
    }
  };

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setUserEditedFields((prev) => (prev.includes(field) ? prev : [...prev, field]));
  };

  const handleConfirmSave = async (event) => {
    event.preventDefault();
    if (!form.companyName.trim() || !form.jobRole.trim()) {
      toast.error("Company Name and Job Role are required.");
      return;
    }
    if (!form.hrEmail.trim() && !form.applyUrl.trim()) {
      toast.error("Provide at least an HR Email or Apply URL before saving.");
      return;
    }

    setSaving(true);
    try {
      const res = await screenshotImportApi.confirm({
        sessionId,
        companyName: form.companyName.trim(),
        jobRole: form.jobRole.trim(),
        department: form.department.trim(),
        location: form.location.trim(),
        workArrangement: form.workArrangement,
        employmentType: form.employmentType.trim(),
        experienceRequired: form.experienceRequired.trim(),
        salary: form.salary.trim(),
        hrEmail: form.hrEmail.trim(),
        applyUrl: form.applyUrl.trim(),
        companyWebsite: form.companyWebsite.trim(),
        requiredSkills: form.requiredSkillsText
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        jobDescription: form.jobDescription.trim(),
        applicationDeadline: form.applicationDeadline.trim(),
        extractionConfidence,
        extractionConflicts,
        userEditedFields,
      });

      setSavedJob(res.job);
      setSessionId("");
      setScreenshots([]);
      setReviewOpen(false);
      setForm(EMPTY_FORM);
      toast.success(`Saved "${res.job.jobRole}" at ${res.job.companyName} to Pending Vacancies.`);
    } catch (err) {
      toast.error(err.message || "Failed to save vacancy.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
            <Sparkles className="h-3.5 w-3.5" />
            Screenshot-First Import
          </span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
            Quick Apply / Screenshot Import
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Paste one or multiple job vacancy screenshots with <kbd className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs font-semibold text-zinc-700">Ctrl + V</kbd>, drag &amp; drop, or upload files. Vision AI combines them into one structured vacancy.
          </p>
        </div>

        <Link
          href="/import"
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Manual / CSV Import
        </Link>
      </div>

      {savedJob && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-emerald-950">
                Vacancy saved: {savedJob.jobRole} at {savedJob.companyName}
              </p>
              <p className="text-xs text-emerald-800">
                Added to Pending Vacancies ({savedJob.matchScore || 0}% skill match). Ready for contact discovery or email drafting.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(`/pending`)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              Open Pending Queue
            </button>
            <Link
              href="/vacancies"
              className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
            >
              All Vacancies
            </Link>
          </div>
        </div>
      )}

      {/* Dropzone & Clipboard Paste Surface */}
      <div
        tabIndex={0}
        onPaste={(e) => {
          const imgs = extractImagesFromDataTransfer(e.clipboardData);
          if (imgs.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            uploadImageFiles(imgs, "paste");
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          dragging
            ? "border-indigo-500 bg-indigo-50/70"
            : "border-zinc-300 bg-white hover:border-indigo-300"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              uploadImageFiles(e.target.files, "upload");
              e.target.value = "";
            }
          }}
        />

        <div className="mx-auto flex max-w-xl flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
          </div>
          <h2 className="mt-3 text-base font-semibold text-zinc-900">
            Drop screenshots here, click to upload, or press Ctrl + V to paste.
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Supports PNG, JPG, JPEG, and WEBP (up to {MAX_SCREENSHOTS} screenshots per vacancy). Mix Windows Snipping Tool pastes and file uploads freely.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              <Upload className="h-4 w-4" />
              Select Screenshots
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={handlePasteButtonClick}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
            >
              <ClipboardPaste className="h-4 w-4" />
              Paste from Clipboard
            </button>
          </div>
        </div>
      </div>

      {/* Ordered Screenshot Queue */}
      {screenshots.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">
                Attached Screenshots ({screenshots.length}/{MAX_SCREENSHOTS})
              </h3>
              <p className="text-xs text-zinc-500">
                Order matters when a job post spans multiple screens. Use arrows to reorder before extraction.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add More
              </button>
              <button
                type="button"
                onClick={handleClearSession}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear All
              </button>
              <button
                type="button"
                disabled={extracting || uploading}
                onClick={handleExtract}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {extracting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {extracting ? "Extracting..." : "Extract Vacancy with AI"}
              </button>
            </div>
          </div>

          {extracting && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-zinc-600">
                <span>Analyzing {screenshots.length} screenshot(s) with Vision AI...</span>
                <span>{extractionProgress}%</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                  style={{ width: `${extractionProgress}%` }}
                />
              </div>
            </div>
          )}

          {extractionError && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold">Vision AI Extraction Unavailable</p>
                  <p className="mt-0.5 text-amber-800">{extractionError}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReviewOpen(true)}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-900 hover:bg-amber-100"
              >
                Fill Fields Manually Instead
              </button>
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {screenshots.map((shot, idx) => (
              <div
                key={shot._id}
                className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-zinc-900/5">
                  <img
                    src={screenshotImportApi.imageUrl(shot._id)}
                    alt={shot.originalName}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-zinc-200 bg-white px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        #{idx + 1}
                      </span>
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                        {shot.source === "paste" ? "Pasted" : "Uploaded"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[11px] font-medium text-zinc-700">
                      {shot.originalName}
                    </p>
                    <p className="text-[10px] text-zinc-400">{formatBytes(shot.sizeBytes)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveScreenshot(idx, -1)}
                      title="Move left"
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === screenshots.length - 1}
                      onClick={() => handleMoveScreenshot(idx, 1)}
                      title="Move right"
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveScreenshot(shot._id)}
                      title="Remove screenshot"
                      className="rounded p-1 text-rose-500 hover:bg-rose-50"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Editable Vacancy Review Screen */}
      {reviewOpen && (
        <form onSubmit={handleConfirmSave} className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-900">
                Vacancy Review &amp; Confirmation
              </h2>
              <p className="text-xs text-zinc-500">
                Verify extracted details, resolve any flagged conflicts, and confirm to save this vacancy.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearSession}
                className="rounded-lg border border-zinc-200 px-3.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel Import
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirm &amp; Save Vacancy
              </button>
            </div>
          </div>

          {extractionConflicts.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Cross-Screenshot Conflicts Detected
              </div>
              <ul className="mt-2 space-y-1 text-xs text-amber-800">
                {extractionConflicts.map((conflict, i) => (
                  <li key={`${conflict.field}-${i}`}>
                    <span className="font-semibold">{conflict.field}:</span> {conflict.note}
                    {conflict.values?.length > 0 && ` (${conflict.values.join(" vs ")})`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {extractionNotes && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs text-zinc-700">
              <span className="font-semibold">AI Notes:</span> {extractionNotes}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-700">Company Name *</label>
                <ConfidenceBadge score={extractionConfidence.companyName} />
              </div>
              <input
                required
                value={form.companyName}
                onChange={(e) => handleFieldChange("companyName", e.target.value)}
                placeholder="e.g., Acme Technologies"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-700">Job Role *</label>
                <ConfidenceBadge score={extractionConfidence.jobRole} />
              </div>
              <input
                required
                value={form.jobRole}
                onChange={(e) => handleFieldChange("jobRole", e.target.value)}
                placeholder="e.g., Senior Frontend Engineer"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-700">HR / Recruiter Email</label>
                <ConfidenceBadge score={extractionConfidence.hrEmail} />
              </div>
              <input
                type="email"
                value={form.hrEmail}
                onChange={(e) => handleFieldChange("hrEmail", e.target.value)}
                placeholder="Leave blank if not shown in screenshot"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-700">Apply URL</label>
                <ConfidenceBadge score={extractionConfidence.applyUrl} />
              </div>
              <input
                value={form.applyUrl}
                onChange={(e) => handleFieldChange("applyUrl", e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-700">Location</label>
                <ConfidenceBadge score={extractionConfidence.location} />
              </div>
              <input
                value={form.location}
                onChange={(e) => handleFieldChange("location", e.target.value)}
                placeholder="City / Country"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-700">Work Arrangement</label>
                <ConfidenceBadge score={extractionConfidence.workArrangement} />
              </div>
              <select
                value={form.workArrangement}
                onChange={(e) => handleFieldChange("workArrangement", e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none"
              >
                <option value="unspecified">Unspecified</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="office">On-site / Office</option>
              </select>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-700">Salary / Compensation</label>
                <ConfidenceBadge score={extractionConfidence.salary} />
              </div>
              <input
                value={form.salary}
                onChange={(e) => handleFieldChange("salary", e.target.value)}
                placeholder="e.g., 18-24 LPA"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-700">Experience Required</label>
                <ConfidenceBadge score={extractionConfidence.experienceRequired} />
              </div>
              <input
                value={form.experienceRequired}
                onChange={(e) => handleFieldChange("experienceRequired", e.target.value)}
                placeholder="e.g., 2-4 years"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-700">Department</label>
                <ConfidenceBadge score={extractionConfidence.department} />
              </div>
              <input
                value={form.department}
                onChange={(e) => handleFieldChange("department", e.target.value)}
                placeholder="e.g., Engineering"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-700">Company Website</label>
                <ConfidenceBadge score={extractionConfidence.companyWebsite} />
              </div>
              <input
                value={form.companyWebsite}
                onChange={(e) => handleFieldChange("companyWebsite", e.target.value)}
                placeholder="https://company.com"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-700">Required Skills (comma-separated)</label>
                <ConfidenceBadge score={extractionConfidence.requiredSkills} />
              </div>
              <input
                value={form.requiredSkillsText}
                onChange={(e) => handleFieldChange("requiredSkillsText", e.target.value)}
                placeholder="React, Next.js, TypeScript, Node.js"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-700">Job Description</label>
                <ConfidenceBadge score={extractionConfidence.jobDescription} />
              </div>
              <textarea
                rows={5}
                value={form.jobDescription}
                onChange={(e) => handleFieldChange("jobDescription", e.target.value)}
                placeholder="Combined description extracted from screenshots..."
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
