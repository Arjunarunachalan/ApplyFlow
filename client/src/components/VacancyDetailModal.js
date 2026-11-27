"use client";

import { useState } from "react";
import {
  Archive,
  Calendar,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Save,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  ContactStatusBadge,
  MatchBadge,
  StatusBadge,
  TypeBadge,
} from "@/components/Badges";
import { useToast } from "@/components/ToastProvider";
import { errorMessage } from "@/lib/api";

const inputClass =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

const initialFormFromJob = (job) => ({
  companyName: job?.companyName || "",
  jobRole: job?.jobRole || "",
  hrName: job?.hrName || "",
  hrEmail: job?.hrEmail || "",
  applyUrl: job?.applyUrl || "",
  companyWebsite: job?.companyWebsite || "",
  location: job?.location || "",
  salary: job?.salary || "",
  workArrangement: job?.workArrangement || "unspecified",
  experienceRequirement: job?.experienceRequirement || "",
  jobDescription: job?.jobDescription || "",
});

export default function VacancyDetailModal({
  job,
  onClose,
  onSave,
  onGenerateDraft,
  onArchive,
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => initialFormFromJob(job));

  if (!job) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(job._id, form);
      toast.success("Vacancy details updated.");
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      <div
        className="absolute inset-0 bg-zinc-900/40 backdrop-blur-[1px]"
        onClick={onClose}
        role="presentation"
      />
      <aside className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-zinc-200 px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={job.lifecycleStatus || job.status} />
              <ContactStatusBadge status={job.contactStatus} />
              <MatchBadge score={job.matchScore} />
            </div>
            <h2 className="mt-2 truncate text-lg font-semibold text-zinc-900">
              {job.jobRole}
            </h2>
            <p className="text-sm text-zinc-500">{job.companyName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-50"
            aria-label="Close vacancy details"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {editing ? (
            <form id="vacancy-edit-form" onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-600">Company Name *</span>
                <input
                  required
                  value={form.companyName}
                  onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-600">Job Title *</span>
                <input
                  required
                  value={form.jobRole}
                  onChange={(e) => setForm((p) => ({ ...p, jobRole: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-600">HR / Recruiter Email</span>
                <input
                  type="email"
                  value={form.hrEmail}
                  onChange={(e) => setForm((p) => ({ ...p, hrEmail: e.target.value }))}
                  placeholder="careers@company.com"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-600">HR / Contact Name</span>
                <input
                  value={form.hrName}
                  onChange={(e) => setForm((p) => ({ ...p, hrName: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-600">Application URL</span>
                <input
                  type="url"
                  value={form.applyUrl}
                  onChange={(e) => setForm((p) => ({ ...p, applyUrl: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-600">Company Website</span>
                <input
                  type="url"
                  value={form.companyWebsite}
                  onChange={(e) => setForm((p) => ({ ...p, companyWebsite: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-600">Location</span>
                <input
                  value={form.location}
                  onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-600">Work Arrangement</span>
                <select
                  value={form.workArrangement}
                  onChange={(e) => setForm((p) => ({ ...p, workArrangement: e.target.value }))}
                  className={`${inputClass} bg-white`}
                >
                  <option value="unspecified">Unspecified</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="office">Office</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-600">Experience Requirement</span>
                <input
                  value={form.experienceRequirement}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, experienceRequirement: e.target.value }))
                  }
                  placeholder="e.g. 2-4 years"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-600">Salary / CTC</span>
                <input
                  value={form.salary}
                  onChange={(e) => setForm((p) => ({ ...p, salary: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs font-medium text-zinc-600">Job Description</span>
                <textarea
                  rows={8}
                  value={form.jobDescription}
                  onChange={(e) => setForm((p) => ({ ...p, jobDescription: e.target.value }))}
                  className={`${inputClass} font-mono text-xs leading-relaxed`}
                />
              </label>
            </form>
          ) : (
            <div className="flex flex-col gap-5">
              {/* Contact section */}
              <section className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Recruitment Contact &amp; Channel
                  </h3>
                  <TypeBadge type={job.applicationType} />
                </div>

                {job.hrEmail ? (
                  <div className="mt-3 flex flex-col gap-1 text-sm">
                    <div className="flex items-center gap-2 font-medium text-zinc-900">
                      <Mail className="h-4 w-4 text-indigo-600" />
                      <span>{job.hrEmail}</span>
                      {job.hrName ? (
                        <span className="text-xs font-normal text-zinc-500">
                          ({job.hrName})
                        </span>
                      ) : null}
                    </div>
                    {job.contactSourceUrl ? (
                      <p className="text-xs text-zinc-500">
                        Source:{" "}
                        <a
                          href={job.contactSourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline"
                        >
                          {job.contactSourceUrl}
                        </a>
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                    <p className="font-semibold">HR Email Not Found</p>
                    <p className="mt-0.5 text-amber-800">
                      No verified HR email is stored yet. Edit to enter one manually, use the
                      application portal link below, or run public contact discovery (Phase 3).
                    </p>
                    {job.applyUrl ? (
                      <a
                        href={job.applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 font-medium text-cyan-800 underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open Portal Application URL
                      </a>
                    ) : null}
                  </div>
                )}
              </section>

              {/* Metadata grid */}
              <dl className="grid gap-3 rounded-xl border border-zinc-200 p-4 text-xs sm:grid-cols-2">
                <div>
                  <dt className="flex items-center gap-1 text-zinc-400">
                    <MapPin className="h-3.5 w-3.5" /> Location / Arrangement
                  </dt>
                  <dd className="mt-1 font-medium text-zinc-800 capitalize">
                    {job.location || "—"} ({job.workArrangement || "unspecified"})
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-zinc-400">
                    <Globe className="h-3.5 w-3.5" /> Website &amp; Source
                  </dt>
                  <dd className="mt-1 font-medium text-zinc-800">
                    {job.companyWebsite ? (
                      <a
                        href={job.companyWebsite}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:underline"
                      >
                        {job.companyWebsite}
                      </a>
                    ) : (
                      "—"
                    )}{" "}
                    · <span className="uppercase">{job.importType || "manual"}</span>
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-zinc-400">
                    <Calendar className="h-3.5 w-3.5" /> Created / Imported Date
                  </dt>
                  <dd className="mt-1 font-medium text-zinc-800">{formatDate(job.createdAt)}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-zinc-400">
                    <Calendar className="h-3.5 w-3.5" /> Original Job Posting Date
                  </dt>
                  <dd className="mt-1 font-medium text-zinc-800">
                    {job.jobPostedAt ? formatDate(job.jobPostedAt) : "Not captured"}
                  </dd>
                </div>
                {job.experienceRequirement ? (
                  <div>
                    <dt className="text-zinc-400">Experience Required</dt>
                    <dd className="mt-1 font-medium text-zinc-800">{job.experienceRequirement}</dd>
                  </div>
                ) : null}
                {job.salary ? (
                  <div>
                    <dt className="text-zinc-400">Compensation</dt>
                    <dd className="mt-1 font-medium text-zinc-800">{job.salary}</dd>
                  </div>
                ) : null}
              </dl>

              {job.matchedSkills?.length ? (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Matched Resume Skills
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {job.matchedSkills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Job Description
                </h3>
                <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs leading-relaxed text-zinc-700">
                  {job.jobDescription || "No job description provided."}
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 px-6 py-4">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="vacancy-edit-form"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Edit Details / Add Email
                </button>
                {onArchive && job.lifecycleStatus !== "ARCHIVED" ? (
                  <button
                    type="button"
                    onClick={() => onArchive(job, true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive
                  </button>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {!job.hrEmail ? (
                  <button
                    type="button"
                    onClick={() =>
                      toast.info(
                        "Automated public contact discovery arrives in Phase 3. You can enter a public email manually via Edit Details.",
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Find HR Email
                  </button>
                ) : null}

                {job.applicationType === "email" &&
                onGenerateDraft &&
                !["SENT", "QUEUED", "SENDING", "ARCHIVED"].includes(job.lifecycleStatus) ? (
                  <button
                    type="button"
                    onClick={() => onGenerateDraft(job)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate Email Draft
                  </button>
                ) : null}
              </div>
            </>
          )}
        </footer>
      </aside>
    </div>
  );
}
