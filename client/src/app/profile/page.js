"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, FolderPlus, Loader2, Save, Trash2 } from "lucide-react";
import { errorMessage, jobApi, profileApi } from "@/lib/api";

const EMPTY_PROJECT = { name: "", techStack: "", highlight: "", url: "" };

const EMPTY_FORM = {
  fullName: "",
  headline: "",
  email: "",
  phone: "",
  location: "",
  yearsOfExperience: "",
  skills: "",
  summary: "",
  portfolioUrl: "",
  githubUrl: "",
  linkedinUrl: "",
  dailyEmailLimit: 30,
  projects: [],
};

const inputClass =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

const toProject = (project = {}) => ({
  name: project.name || "",
  techStack: Array.isArray(project.techStack) ? project.techStack.join(", ") : "",
  highlight: project.highlight || "",
  url: project.url || "",
});

const toForm = (profile) => ({
  ...EMPTY_FORM,
  ...profile,
  yearsOfExperience: profile?.yearsOfExperience ?? "",
  dailyEmailLimit: profile?.dailyEmailLimit ?? 30,
  skills: Array.isArray(profile?.skills) ? profile.skills.join(", ") : "",
  projects: Array.isArray(profile?.projects) ? profile.projects.map(toProject) : [],
});

function Field({ label, hint, className = "", children }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-medium text-zinc-600">{label}</span>
      {children}
      {hint ? <span className="text-xs text-zinc-400">{hint}</span> : null}
    </label>
  );
}

export default function ProfilePage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedMessage, setSavedMessage] = useState(null);

  useEffect(() => {
    let active = true;

    profileApi
      .get()
      .then((profile) => {
        if (active) setForm(toForm(profile));
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
  }, []);

  const update = (key) => (event) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const updateProject = (index, key) => (event) =>
    setForm((prev) => ({
      ...prev,
      projects: prev.projects.map((project, projectIndex) =>
        projectIndex === index ? { ...project, [key]: event.target.value } : project,
      ),
    }));

  const addProject = () =>
    setForm((prev) => ({ ...prev, projects: [...prev.projects, { ...EMPTY_PROJECT }] }));

  const removeProject = (index) =>
    setForm((prev) => ({
      ...prev,
      projects: prev.projects.filter((_, projectIndex) => projectIndex !== index),
    }));

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMessage(null);

    try {
      const profile = await profileApi.save({
        fullName: form.fullName,
        headline: form.headline,
        email: form.email,
        phone: form.phone,
        location: form.location,
        yearsOfExperience: Number(form.yearsOfExperience) || 0,
        skills: form.skills,
        summary: form.summary,
        portfolioUrl: form.portfolioUrl,
        githubUrl: form.githubUrl,
        linkedinUrl: form.linkedinUrl,
        dailyEmailLimit: Number(form.dailyEmailLimit) || 30,
        projects: form.projects
          .filter((project) => project.name.trim())
          .map((project) => ({
            name: project.name,
            techStack: project.techStack,
            highlight: project.highlight,
            url: project.url,
          })),
      });

      setForm(toForm(profile));

      // Every job score depends on the skills, so refresh them right away.
      try {
        const rescored = await jobApi.recalculateScores();
        setSavedMessage(
          `Profile saved · match scores refreshed for ${rescored.updated} job${
            rescored.updated === 1 ? "" : "s"
          }.`,
        );
      } catch (rescoreError) {
        setSavedMessage("Profile saved, but match scores could not be refreshed.");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Candidate profile</h1>
        <p className="mt-1 text-sm text-zinc-500">
          This is what the email generator writes from, so keep the skills, projects and summary
          specific.
        </p>
      </header>

      {loading ? (
        <p className="rounded-xl border border-zinc-200 bg-white px-5 py-12 text-center text-sm text-zinc-500 shadow-sm">
          Loading profile…
        </p>
      ) : (
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-5 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <input
                value={form.fullName}
                onChange={update("fullName")}
                placeholder="Arjun Arunachalam"
                className={inputClass}
              />
            </Field>

            <Field label="Headline">
              <input
                value={form.headline}
                onChange={update("headline")}
                placeholder="Full-stack developer, Node.js and React"
                className={inputClass}
              />
            </Field>

            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={update("email")}
                placeholder="you@example.com"
                className={inputClass}
              />
            </Field>

            <Field label="Phone">
              <input
                value={form.phone}
                onChange={update("phone")}
                placeholder="+91 98765 43210"
                className={inputClass}
              />
            </Field>

            <Field label="Location">
              <input
                value={form.location}
                onChange={update("location")}
                placeholder="Chennai, India"
                className={inputClass}
              />
            </Field>

            <Field label="Years of experience">
              <input
                type="number"
                min="0"
                step="0.5"
                value={form.yearsOfExperience}
                onChange={update("yearsOfExperience")}
                placeholder="3"
                className={inputClass}
              />
            </Field>

            <Field
              label="Skills"
              hint="Comma separated — the generator matches these against each job description."
              className="sm:col-span-2"
            >
              <input
                value={form.skills}
                onChange={update("skills")}
                placeholder="Node.js, Express, MongoDB, Redis, React, Next.js"
                className={inputClass}
              />
            </Field>

            <Field label="Short bio" className="sm:col-span-2">
              <textarea
                value={form.summary}
                onChange={update("summary")}
                rows={4}
                placeholder="Backend-leaning full-stack developer who ships queue-driven systems and cares about clean data models."
                className={inputClass}
              />
            </Field>

            <Field label="Portfolio URL">
              <input
                value={form.portfolioUrl}
                onChange={update("portfolioUrl")}
                placeholder="https://portfolio.dev"
                className={inputClass}
              />
            </Field>

            <Field label="GitHub URL">
              <input
                value={form.githubUrl}
                onChange={update("githubUrl")}
                placeholder="https://github.com/you"
                className={inputClass}
              />
            </Field>

            <Field label="LinkedIn URL">
              <input
                value={form.linkedinUrl}
                onChange={update("linkedinUrl")}
                placeholder="https://linkedin.com/in/you"
                className={inputClass}
              />
            </Field>

            <Field
              label="Daily email limit"
              hint="Approvals are blocked once this many are sent or queued in 24 hours."
            >
              <input
                type="number"
                min="1"
                value={form.dailyEmailLimit}
                onChange={update("dailyEmailLimit")}
                className={inputClass}
              />
            </Field>
          </div>

          <section className="flex flex-col gap-3 border-t border-zinc-200 pt-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Showcase projects</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  The generator picks the single most relevant project for each vacancy, so keep
                  the stack and the one-line result concrete.
                </p>
              </div>
              <button
                type="button"
                onClick={addProject}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <FolderPlus className="h-4 w-4" />
                Add project
              </button>
            </div>

            {form.projects.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500">
                No projects yet. Add one or two and every draft can cite real work.
              </p>
            ) : null}

            {form.projects.map((project, index) => (
              <div
                key={index}
                className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Project {index + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeProject(index)}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Name">
                    <input
                      value={project.name}
                      onChange={updateProject(index, "name")}
                      placeholder="Queue-driven job tracker"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Tech stack" hint="Comma separated.">
                    <input
                      value={project.techStack}
                      onChange={updateProject(index, "techStack")}
                      placeholder="Next.js, Node.js, BullMQ, MongoDB"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="One-line highlight" className="sm:col-span-2">
                    <input
                      value={project.highlight}
                      onChange={updateProject(index, "highlight")}
                      placeholder="Sends 30 personalized applications a day with a quota guard"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="URL" className="sm:col-span-2">
                    <input
                      value={project.url}
                      onChange={updateProject(index, "url")}
                      placeholder="https://github.com/you/project"
                      className={inputClass}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </section>

          {error ? (
            <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          ) : null}

          {savedMessage ? (
            <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              {savedMessage}
            </p>
          ) : null}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
