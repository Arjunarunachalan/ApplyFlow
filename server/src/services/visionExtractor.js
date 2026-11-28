import { WORK_ARRANGEMENTS } from "../models/Job.js";

const getVisionTimeoutMs = () =>
  Math.max(Number(process.env.VISION_TIMEOUT_MS) || 55000, Number(process.env.AI_TIMEOUT_MS) || 0, 45000);
const getGeminiVisionModel = () =>
  process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || "gemini-3.8-flash";

/**
 * Validate image buffer magic bytes to prevent spoofed MIME uploads.
 * Returns normalized MIME type ("image/png" | "image/jpeg" | "image/webp") or null.
 */
export function validateImageMagicBytes(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

const EXTRACTION_FIELDS = [
  "companyName",
  "jobRole",
  "department",
  "location",
  "workArrangement",
  "employmentType",
  "experienceRequired",
  "salary",
  "hrEmail",
  "applyUrl",
  "companyWebsite",
  "requiredSkills",
  "jobDescription",
  "applicationDeadline",
];

function cleanString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function cleanEmail(value) {
  const str = cleanString(value).toLowerCase();
  if (!str) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str) ? str : "";
}

function cleanUrl(value) {
  const str = cleanString(value);
  if (!str) return "";
  if (/^https?:\/\//i.test(str)) return str;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(str)) return `https://${str}`;
  return "";
}

function cleanConfidence(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num > 1 && num <= 100) return Math.round((num / 100) * 100) / 100;
  return Math.max(0, Math.min(1, Math.round(num * 100) / 100));
}

function normalizeWorkArrangement(value) {
  const v = cleanString(value).toLowerCase();
  if (!v) return "unspecified";
  if (WORK_ARRANGEMENTS.includes(v)) return v;
  if (v.includes("hybrid")) return "hybrid";
  if (v.includes("remote") || v.includes("wfh") || v.includes("work from home")) return "remote";
  if (v.includes("on-site") || v.includes("onsite") || v.includes("office") || v.includes("in-person")) {
    return "office";
  }
  return "unspecified";
}

function normalizeSkills(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((s) => cleanString(String(s))).filter(Boolean))].slice(0, 30);
  }
  if (typeof value === "string") {
    return [...new Set(value.split(/[,;\n|]+/).map((s) => s.trim()).filter(Boolean))].slice(0, 30);
  }
  return [];
}

/**
 * Strictly normalize raw Vision AI JSON into the vacancy schema.
 * Never fabricates missing fields or emails.
 */
export function normalizeAndValidateExtraction(rawJson) {
  const data = rawJson && typeof rawJson === "object" ? rawJson : {};
  const rawFields = data.fields && typeof data.fields === "object" ? data.fields : data;
  const rawConfidence =
    data.extractionConfidence && typeof data.extractionConfidence === "object"
      ? data.extractionConfidence
      : data.confidence && typeof data.confidence === "object"
        ? data.confidence
        : {};

  const normalized = {
    companyName: cleanString(rawFields.companyName),
    jobRole: cleanString(rawFields.jobRole),
    department: cleanString(rawFields.department),
    location: cleanString(rawFields.location),
    workArrangement: normalizeWorkArrangement(rawFields.workArrangement),
    employmentType: cleanString(rawFields.employmentType),
    experienceRequired: cleanString(rawFields.experienceRequired),
    salary: cleanString(rawFields.salary),
    hrEmail: cleanEmail(rawFields.hrEmail),
    applyUrl: cleanUrl(rawFields.applyUrl),
    companyWebsite: cleanUrl(rawFields.companyWebsite),
    requiredSkills: normalizeSkills(rawFields.requiredSkills),
    jobDescription: cleanString(rawFields.jobDescription),
    applicationDeadline: cleanString(rawFields.applicationDeadline),
  };

  const extractionConfidence = {};
  for (const field of EXTRACTION_FIELDS) {
    const val = normalized[field];
    const hasValue = Array.isArray(val)
      ? val.length > 0
      : field === "workArrangement"
        ? val !== "unspecified"
        : Boolean(val);
    extractionConfidence[field] = hasValue
      ? cleanConfidence(rawConfidence[field], 0.75)
      : cleanConfidence(rawConfidence[field], 0);
  }

  const rawConflicts = Array.isArray(data.extractionConflicts)
    ? data.extractionConflicts
    : Array.isArray(data.conflicts)
      ? data.conflicts
      : [];

  const extractionConflicts = rawConflicts
    .filter((item) => item && typeof item === "object" && cleanString(item.field))
    .map((item) => ({
      field: cleanString(item.field),
      values: Array.isArray(item.values)
        ? item.values.map((v) => cleanString(String(v))).filter(Boolean)
        : [],
      note: cleanString(item.note || item.reason || "Conflicting values detected across screenshots"),
    }));

  const notes = cleanString(data.notes || data.extractionNotes || "");

  return {
    ...normalized,
    extractionConfidence,
    extractionConflicts,
    notes,
  };
}

function buildVisionPrompt(screenshotCount) {
  return [
    `You are a strict, high-accuracy job vacancy extraction engine.`,
    `You are given ${screenshotCount} screenshot(s) in order representing a SINGLE job vacancy.`,
    `Combine information across all screenshots into ONE unified JSON object.`,
    `CRITICAL RULES:`,
    `1. ONLY extract information that is explicitly visible in the screenshots.`,
    `2. NEVER guess, invent, or fabricate an HR email, company website, apply URL, salary, or any missing field.`,
    `3. If a field is not visible, return "" (or [] for requiredSkills, "unspecified" for workArrangement).`,
    `4. If different screenshots show conflicting values for the same field (e.g. different locations or salaries), record that in extractionConflicts.`,
    `5. Return ONLY valid JSON (no markdown fences, no commentary) matching this exact shape:`,
    `{`,
    `  "companyName": "",`,
    `  "jobRole": "",`,
    `  "department": "",`,
    `  "location": "",`,
    `  "workArrangement": "office | remote | hybrid | unspecified",`,
    `  "employmentType": "",`,
    `  "experienceRequired": "",`,
    `  "salary": "",`,
    `  "hrEmail": "",`,
    `  "applyUrl": "",`,
    `  "companyWebsite": "",`,
    `  "requiredSkills": ["skill1", "skill2"],`,
    `  "jobDescription": "Full combined responsibilities, requirements, and perks from all screenshots",`,
    `  "applicationDeadline": "",`,
    `  "extractionConfidence": {`,
    `    "companyName": 0.95,`,
    `    "jobRole": 0.95,`,
    `    "department": 0.0,`,
    `    "location": 0.85,`,
    `    "workArrangement": 0.8,`,
    `    "employmentType": 0.0,`,
    `    "experienceRequired": 0.0,`,
    `    "salary": 0.0,`,
    `    "hrEmail": 0.0,`,
    `    "applyUrl": 0.0,`,
    `    "companyWebsite": 0.0,`,
    `    "requiredSkills": 0.9,`,
    `    "jobDescription": 0.9,`,
    `    "applicationDeadline": 0.0`,
    `  },`,
    `  "extractionConflicts": [`,
    `    { "field": "location", "values": ["Bengaluru", "Remote"], "note": "Screenshot 1 says Bengaluru; Screenshot 2 says Remote" }`,
    `  ],`,
    `  "notes": ""`,
    `}`,
  ].join("\n");
}

function extractJsonFromText(text) {
  const cleaned = String(text || "").trim();
  if (!cleaned) {
    throw new Error("Vision model returned an empty response.");
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    // Strip markdown fences or locate outermost JSON object
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) {
      return JSON.parse(fenceMatch[1].trim());
    }
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("Vision model response did not contain valid JSON.");
  }
}

async function callGeminiVision(screenshots, apiKey, modelOverride) {
  const model = modelOverride || getGeminiVisionModel();
  const prompt = buildVisionPrompt(screenshots.length);
  const parts = [{ text: prompt }];

  for (const shot of screenshots) {
    parts.push({
      inline_data: {
        mime_type: shot.mimeType,
        data: shot.fileData.toString("base64"),
      },
    });
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getVisionTimeoutMs());

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `Gemini Vision API error (${res.status})`;
      if (
        !modelOverride &&
        model !== "gemini-3.8-flash" &&
        /no longer available|not found|deprecated/i.test(msg)
      ) {
        return callGeminiVision(screenshots, apiKey, "gemini-3.8-flash");
      }
      const err = new Error(msg);
      err.statusCode = res.status >= 500 ? 502 : 422;
      throw err;
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("")
      .trim();

    return {
      parsed: extractJsonFromText(text),
      provider: "gemini",
      model,
    };
  } catch (err) {
    if (err?.name === "AbortError") {
      const timeoutErr = new Error(
        "Vision AI timed out while analyzing the screenshot(s). Please retry or upload fewer/smaller images."
      );
      timeoutErr.statusCode = 504;
      timeoutErr.code = "VISION_TIMEOUT";
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function callOllamaVision(screenshots) {
  const ollamaUrl = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_VISION_MODEL;
  const prompt = buildVisionPrompt(screenshots.length);
  const images = screenshots.map((shot) => shot.fileData.toString("base64"));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getVisionTimeoutMs());

  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt,
        images,
        stream: false,
        format: "json",
        options: { temperature: 0.1 },
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error || `Ollama Vision API error (${res.status})`;
      const err = new Error(msg);
      err.statusCode = 502;
      throw err;
    }

    return {
      parsed: extractJsonFromText(data?.response || ""),
      provider: "ollama",
      model,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract one structured vacancy from an ordered list of VacancyScreenshot documents.
 * Throws a 503 configuration error if no vision-capable provider is configured.
 */
export async function extractVacancyFromScreenshots(screenshots, options = {}) {
  if (!Array.isArray(screenshots) || screenshots.length === 0) {
    const err = new Error("At least one screenshot is required for extraction.");
    err.statusCode = 400;
    throw err;
  }

  const geminiKey = String(options?.geminiApiKey || process.env.GEMINI_API_KEY || "").trim();
  const hasGemini = Boolean(geminiKey);
  const hasOllamaVision = Boolean(process.env.OLLAMA_VISION_MODEL?.trim());

  if (!hasGemini && !hasOllamaVision) {
    const err = new Error(
      "No Vision AI provider is configured. Paste your Gemini API key in AI Settings (or here below) or set GEMINI_API_KEY in server/.env."
    );
    err.statusCode = 503;
    err.code = "VISION_PROVIDER_UNCONFIGURED";
    throw err;
  }

  let rawResult;
  if (hasGemini) {
    rawResult = await callGeminiVision(screenshots, geminiKey);
  } else {
    rawResult = await callOllamaVision(screenshots);
  }

  const extracted = normalizeAndValidateExtraction(rawResult.parsed);

  return {
    ...extracted,
    provider: rawResult.provider,
    model: rawResult.model,
    screenshotCount: screenshots.length,
  };
}
