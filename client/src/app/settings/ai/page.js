"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Eye, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { errorMessage, settingsApi } from "@/lib/api";

export default function AiSettingsPage() {
  const toast = useToast();
  const [ai, setAi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsApi
      .get()
      .then((data) => setAi(data?.ai || null))
      .catch((err) => toast.error(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [toast]);

  const handleSaveKey = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await settingsApi.updateAi({ geminiApiKey: geminiApiKey.trim() });
      setAi((prev) => ({ ...(prev || {}), ...updated }));
      setGeminiApiKey("");
      toast.success(
        updated.geminiConfigured ? "Gemini API key saved." : "Saved Gemini API key cleared."
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">AI Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Inspect active AI generation &amp; vision capabilities and strict factual-grounding
          guardrails.
        </p>
      </header>

      {loading ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          Loading AI configuration…
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2.5">
              <SlidersHorizontal className="h-5 w-5 text-indigo-600" />
              <h2 className="text-sm font-semibold text-zinc-900">Configured Provider</h2>
            </div>

            <dl className="mt-4 flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                <dt className="text-zinc-500">Active Text Provider</dt>
                <dd className="rounded-md bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold uppercase text-indigo-700">
                  {ai?.provider || "template"}
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                <dt className="text-zinc-500">Gemini API Key</dt>
                <dd className="text-xs font-medium text-zinc-800">
                  {ai?.geminiConfigured ? "Configured (hidden)" : "Not set"}
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                <dt className="text-zinc-500">Gemini Model</dt>
                <dd className="font-mono text-xs text-zinc-700">{ai?.geminiModel}</dd>
              </div>
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                <dt className="text-zinc-500">Ollama Model</dt>
                <dd className="font-mono text-xs text-zinc-700">{ai?.ollamaModel}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-zinc-500">Multimodal Vision Ready</dt>
                <dd
                  className={`inline-flex items-center gap-1 text-xs font-medium ${
                    ai?.visionSupported ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  {ai?.visionSupported
                    ? "Ready for Screenshot Extraction"
                    : "Requires Gemini API Key"}
                </dd>
              </div>
            </dl>

            <form onSubmit={handleSaveKey} className="mt-5 border-t border-zinc-100 pt-4">
              <label className="block text-xs font-medium text-zinc-700">
                Save Gemini API Key (used for Vision AI Screenshot Extraction)
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIza... (leave blank & save to clear)"
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Key"}
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h2 className="text-sm font-semibold text-zinc-900">
                Strict Factual-Grounding Guards
              </h2>
            </div>

            <ul className="mt-4 flex flex-col gap-2.5 text-xs leading-relaxed text-zinc-600">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <strong>Zero Fabrication:</strong> Every draft is constrained strictly to text
                  extracted from your uploaded PDF resume and verified showcase projects.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <strong>Metric &amp; Buzzword Validator:</strong> Output containing unsupported
                  percentages/counts or hype clichés is automatically rejected and retried/replaced.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                <span>
                  <strong>Safe Template Fallback:</strong> If the external AI provider is unreachable,
                  a deterministic role-and-resume-grounded template keeps workflows running without
                  failing.
                </span>
              </li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
