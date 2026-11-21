/**
 * Tailored application email generator.
 *
 * AI_PROVIDER selects the provider:
 *   "gemini"   -> Gemini REST API (gemini-2.5-flash), JSON response output
 *   "ollama"   -> local Ollama with format: "json", stream: false
 *   "template" -> deterministic, role-specific copy
 *
 * A configured provider that is unreachable, misconfigured or returns
 * something unusable falls back to the template so a draft is always produced.
 * Environment values are read lazily: dotenv runs in the entry module after
 * its imports have been evaluated.
 *
 * Grounding: the candidate facts in the prompt are the parsed text of the
 * uploaded PDF resume, the profile's contact fields and its showcase projects.
 * Skills are filtered against the resume text, years of experience are only
 * stated when the resume states them, and AI output that invents metrics or
 * uses hype wording is retried once and then replaced by the template.
 */

import {
  computeMatch,
  containsSkill,
  dedupeSkills,
  pickRelevantProject,
} from "./jobMatcher.js";
import { ensureResumeText } from "./resumeParser.js";

const DEFAULT_TIMEOUT_MS = 20000;
const MIN_BODY_WORDS = 40;
const MAX_CUSTOM_NOTE = 400;

export const TONE_OPTIONS = ["direct", "enthusiastic", "founder"];

const TONE_GUIDE = {
  direct:
    "Tone: direct and technical. Short clauses, concrete stack names, no filler, no sales language.",
  enthusiastic:
    "Tone: warm and product-focused. Show interest in what the company builds using only facts from the posting, while staying specific.",
  founder:
    "Tone: short and punchy, written for a startup founder. Blunt and plain, two or three sentences per paragraph.",
};

// Wording that turns a factual email into marketing copy. AI drafts that use
// any of it are regenerated once and otherwise replaced by the template.
const BANNED_PATTERNS = [
  /\bpassionate(?:\s+developer)?\b/i,
  /\brockstar\b/i,
  /\bguru\b/i,
  /\bninja\b/i,
  /cutting[\s-]edge/i,
  /\bseasoned(?:\s+expert)?\b/i,
  /\bthrilled(?:\s+to\s+apply)?\b/i,
  /hit the ground running/i,
  /\bsynergy\b/i,
  /proven track record/i,
  /world[\s-]class/i,
  /best[\s-]in[\s-]class/i,
  /game[\s-]changer/i,
  /\b10x\b/i,
  /dream job/i,
  /results[\s-]driven/i,
  /\bgo[\s-]getter\b/i,
  /self[\s-]starter/i,
  /thought leader/i,
  /bleeding[\s-]edge/i,
];

const BANNED_PROMPT_LIST =
  '"passionate developer", "rockstar", "guru", "cutting-edge", "seasoned expert", "thrilled to apply", "hit the ground running", "synergy", "proven track record", "world-class", "results-driven", "game-changer", "10x"';

export const findBannedPhrase = (text) => {
  const value = String(text || "");
  for (const pattern of BANNED_PATTERNS) {
    const match = value.match(pattern);
    if (match) return match[0];
  }
  return null;
};

// Counts and percentages are where invented claims hide ("5k users", "40%
// faster"), so any such number must already exist in the resume, the note or
// the profile.
const METRIC_PATTERN =
  /\b\d[\d,.]*\s*(?:\+|k\b|m\b|%|percent(?:age)?\b|users?\b|customers?\b|clients?\b|downloads?\b|companies\b|revenue\b|projects?\b|teams?\b|years?\b)/gi;

const numberTokens = (sources) => {
  const tokens = new Set();
  for (const source of sources) {
    for (const match of String(source || "").matchAll(/\d+(?:[.,]\d+)?/g)) {
      tokens.add(match[0].replace(/,/g, ""));
    }
  }
  return tokens;
};

export const unsupportedMetrics = (text, sources = []) => {
  const allowed = numberTokens(sources);
  const found = new Set();
  for (const match of String(text || "").matchAll(METRIC_PATTERN)) {
    const digits = (match[0].match(/\d+(?:[.,]\d+)?/) || [""])[0].replace(/,/g, "");
    if (!digits) continue;
    const bare = String(Number(digits));
    if (!allowed.has(digits) && !allowed.has(bare)) found.add(match[0].trim());
  }
  return [...found];
};

export const normalizeTone = (tone) => {
  const value = String(tone || "").trim().toLowerCase();
  return TONE_OPTIONS.includes(value) ? value : "direct";
};

const providerUrl = () =>
  process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate";

const ollamaModel = () =>
  process.env.OLLAMA_MODEL || "qwen2.5-coder:1.5b";

const geminiModel = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";

const timeoutMs = () => {
  const parsed = Number(process.env.AI_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
};

const clean = (value) => (value === undefined || value === null ? "" : String(value).trim());

const truncate = (value, max) => {
  const text = clean(value);
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
};

const formatList = (items) => {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
};

const wordCount = (text) => clean(text).split(/\s+/).filter(Boolean).length;

// Gemini/Qwen sometimes wrap JSON in a fence or add a sentence around it.
export const parseEmailJson = (text) => {
  const raw = clean(text).replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }

  const subject = clean(parsed.subject);
  const body = clean(parsed.body);
  if (!subject || !body || wordCount(body) < MIN_BODY_WORDS) return null;

  return { subject, body };
};

const projectLine = (project) => {
  if (!project) return "";
  const tech = (project.techStack || []).map(clean).filter(Boolean).join(", ");
  const highlight = clean(project.highlight);
  const url = clean(project.url);
  return [
    `Project: ${clean(project.name)}`,
    tech ? `- Tech stack: ${tech}` : "",
    highlight ? `- Highlight: ${highlight}` : "",
    url ? `- Link: ${url}` : "",
  ]
    .filter(Boolean)
    .join(" ");
};

const projectList = (profile = {}) =>
  (Array.isArray(profile.projects) ? profile.projects : []).filter(
    (project) => project && clean(project.name),
  );

// A skill the resume does not mention is not a fact the email may claim, so
// only resume-backed skills survive. Without resume text the profile is all
// the generator has.
const groundedSkills = (profileSkills, resumeText) => {
  const skills = dedupeSkills(profileSkills).map(clean).filter(Boolean);
  if (!resumeText) return skills;

  const haystack = resumeText.toLowerCase().replace(/\s+/g, " ");
  return skills.filter((skill) => containsSkill(haystack, skill));
};

// Number of years is only repeated when the resume itself states it.
const groundedYears = (profile = {}, resumeText = "") => {
  const years = Number(profile.yearsOfExperience);
  if (!Number.isFinite(years) || years <= 0) return null;
  if (!resumeText) return years;

  const pattern = new RegExp(`\\b${years}\\s*\\+?\\s*(?:years?|yrs?)\\b`, "i");
  return pattern.test(resumeText) ? years : null;
};

export const STRICT_SYSTEM_PROMPT = `You are a professional software engineer assistant generating job application emails.
Every generated email must be strictly grounded in the candidate's actual uploaded PDF resume text and real showcase projects.

Source of Truth:
The Resume Text and Showcase Projects provided are the ONLY permitted facts about the candidate. Anything not explicitly mentioned is unknown and must NOT be written.

STRICT ANTI-HALLUCINATION & ANTI-HYPE RULES:
1. Zero fabrication: ONLY mention skills, tools, job titles, years of experience, and projects that explicitly appear in the provided Resume Text or Showcase Projects list. If a technology, skill, metric, or past role does not explicitly appear in the resume or showcase projects, it does NOT exist. Do NOT assume, extrapolate, or invent anything.
2. Never invent metrics or claims: Do NOT make up percentages, user counts, revenue numbers, team sizes, or "proven track record" claims unless those exact numbers are explicitly stated in the resume.
3. No fake skill matching: If the job description requires a technology that is NOT in the resume, do NOT claim the candidate knows it. Focus strictly on the genuine overlapping skills.
4. Mention real projects only: Pick 1–2 relevant projects from the resume or profile.projects and describe them plainly and accurately based only on what is written.
5. No over-hyped buzzwords: Strictly ban phrases like ${BANNED_PROMPT_LIST}. Write like a real, grounded engineer—clear, concise, and factual (120–160 words).

Output format: Return strict JSON only, with no markdown code fences and no extra text outside the JSON:
{"subject": "...", "body": "..."}`;

export const STRICT_FOLLOW_UP_SYSTEM_PROMPT = `You are a professional software engineer assistant generating fact-only follow-up emails for software candidates.
Every follow-up email must be strictly grounded in the candidate's actual uploaded PDF resume text and real showcase projects.

Source of Truth:
The Resume Text and Showcase Projects provided are the ONLY permitted facts about the candidate. Anything not explicitly mentioned is unknown and must NOT be written.

STRICT ANTI-HALLUCINATION & ANTI-HYPE RULES:
1. Zero fabrication: ONLY mention skills, tools, job titles, years of experience, and projects that explicitly appear in the provided Resume Text or Showcase Projects list.
2. Never invent metrics or claims: Do NOT make up percentages, user counts, revenue numbers, or "proven track record" claims unless those exact numbers are in the resume.
3. No fake skill matching: If the job description requires a technology that is NOT in the resume, do NOT claim the candidate knows it. Focus strictly on genuine overlapping skills.
4. Mention real projects only: Pick 1–2 relevant projects from the resume or profile.projects if relevant, described plainly based only on what is written.
5. No over-hyped buzzwords: Strictly ban phrases like ${BANNED_PROMPT_LIST}. Write like a real, grounded engineer—clear, concise, and factual (60–90 words).

Output format: Return strict JSON only, with no markdown code fences and no extra text outside the JSON:
{"subject": "...", "body": "..."}`;

const buildPrompt = ({
  job = {},
  profile = {},
  resume = null,
  resumeText = "",
  tone = "direct",
  customNote = "",
}) => {
  const text = clean(resumeText) || clean(resume?.extractedText);
  const links = [profile.portfolioUrl, profile.githubUrl, profile.linkedinUrl]
    .map(clean)
    .filter(Boolean);
  const skills = groundedSkills(profile.skills, text);
  const { matchedSkills } = computeMatch(job, skills);
  const projects = projectList(profile);
  const project = pickRelevantProject(projects, job);
  const years = groundedYears(profile, text);
  const nextTone = normalizeTone(tone);
  const note = truncate(customNote, MAX_CUSTOM_NOTE);
  const resumeName = clean(resume?.fileName);

  const facts = [
    `Name: ${clean(profile.fullName) || "the candidate"}`,
    `Email: ${clean(profile.email) || "not provided"}`,
    `Phone: ${clean(profile.phone) || "not provided"}`,
    `Portfolio URL: ${clean(profile.portfolioUrl) || "not provided"}`,
    `GitHub URL: ${clean(profile.githubUrl) || "not provided"}`,
    `LinkedIn URL: ${clean(profile.linkedinUrl) || "not provided"}`,
    clean(profile.headline) ? `Headline (as written by candidate): ${clean(profile.headline)}` : "",
    `Years of experience: ${
      years
        ? `${years} — explicitly stated in the resume, so it may be repeated`
        : "not stated in the resume — do not give any number of years"
    }`,
    `Skills that appear in the resume: ${skills.join(", ") || "none listed"}`,
    `Skills the posting asks for that the candidate genuinely has: ${matchedSkills.join(", ") || "none"}`,
    `Resume on file: ${resumeName || "none"}`,
    projects.length
      ? `Showcase projects (real, entered by candidate):\n${projects.map(projectLine).join("\n")}`
      : "Showcase projects: none provided",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    "You write one job application email for a software candidate.",
    "Source of Truth: Pass resume.extractedText and profile.projects (plus profile.fullName, profile.email, profile.phone, profile.portfolioUrl, profile.githubUrl, profile.linkedinUrl) as the ONLY allowed facts about the candidate. Anything not explicitly listed is unknown and must not be written.",
    "Return strict JSON only, with no markdown and no commentary outside the JSON.",
    "",
    "Job posting:",
    `Company: ${clean(job.companyName) || "the company"}`,
    `Role: ${clean(job.jobRole) || "the role"}`,
    `Location: ${clean(job.location) || "not specified"}`,
    `Description: ${truncate(job.jobDescription, 2000) || "not provided"}`,
    "",
    "Candidate facts (the ONLY permitted facts about the candidate):",
    facts,
    "",
    "Resume text extracted from the candidate's uploaded PDF (verbatim, primary source of truth):",
    text || "(no resume text available — use only the candidate facts above)",
    "",
    `Style — ${nextTone}: ${TONE_GUIDE[nextTone]}`,
    note
      ? `The candidate asked you to include this specific point, in your own words: ${note}`
      : "",
    "",
    "Strict Anti-Hallucination & Anti-Hype Rules:",
    "1. Zero fabrication: ONLY mention skills, tools, job titles, years of experience, and projects that explicitly appear in the provided Resume Text or Showcase Projects list. If it is not there, do not write it.",
    "2. Never invent metrics or claims: Do NOT make up percentages, user counts, revenue numbers, or 'proven track record' claims unless those exact numbers are in the resume.",
    "3. No fake skill matching: If the job description requires a technology that is NOT in the resume, do NOT claim the candidate knows it. Focus strictly on the genuine overlapping skills.",
    "4. Mention real projects only: Pick 1–2 relevant projects from the resume or profile.projects and describe them plainly and accurately based only on what is written.",
    project
      ? `   The closest project for this posting is "${clean(project.name)}" — reuse only its accurate details.`
      : "",
    `5. No over-hyped buzzwords: Strictly ban phrases like ${BANNED_PROMPT_LIST}. Write like a real, grounded engineer—clear, concise, and factual (120–160 words).`,
    "6. The body must be 120-160 words of plain text, with no placeholders, brackets or bullet lists.",
    '7. Never open with "I am writing to express my interest" or "I hope this email finds you well". Start with a concrete, verifiable fact.',
    "8. Reference one or two concrete details from the posting and connect them only to the listed skills.",
    note
      ? "9. Work in the candidate's custom note naturally; it is the only new information you may add."
      : "",
    "10. Mention that the resume is attached, put the links in the sign-off when present, and sign off with the candidate's name.",
    "11. The subject must name the company and role, stay under 90 characters, and contain no hype.",
    'Reply with JSON shaped exactly like {"subject": "...", "body": "..."}.',
  ]
    .filter((line) => line !== "")
    .join("\n");
};

const buildFollowUpPrompt = ({
  job = {},
  application = {},
  profile = {},
  resume = null,
  resumeText = "",
}) => {
  const text = clean(resumeText) || clean(resume?.extractedText);
  const links = [profile.portfolioUrl, profile.githubUrl, profile.linkedinUrl]
    .map(clean)
    .filter(Boolean);
  const skills = groundedSkills(profile.skills, text);
  const { matchedSkills } = computeMatch(job, skills);
  const projects = projectList(profile);
  const resumeName = clean(resume?.fileName);

  const sentAt = application.sentAt ? new Date(application.sentAt) : null;
  const sentLabel =
    sentAt && !Number.isNaN(sentAt.getTime())
      ? sentAt.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "recently";

  const facts = [
    `Name: ${clean(profile.fullName) || "the candidate"}`,
    `Email: ${clean(profile.email) || "not provided"}`,
    `Phone: ${clean(profile.phone) || "not provided"}`,
    `Portfolio URL: ${clean(profile.portfolioUrl) || "not provided"}`,
    `GitHub URL: ${clean(profile.githubUrl) || "not provided"}`,
    `LinkedIn URL: ${clean(profile.linkedinUrl) || "not provided"}`,
    `Skills that appear in the resume: ${skills.join(", ") || "none listed"}`,
    `Skills the posting asks for that the candidate genuinely has: ${matchedSkills.join(", ") || "none"}`,
    `Resume on file: ${resumeName || "none"}`,
    projects.length
      ? `Showcase projects (real, entered by candidate):\n${projects.map(projectLine).join("\n")}`
      : "Showcase projects: none provided",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    "You write one follow-up email for a software candidate.",
    "Source of Truth: Pass resume.extractedText and profile.projects (plus profile.fullName, profile.email, profile.phone, profile.portfolioUrl, profile.githubUrl, profile.linkedinUrl) as the ONLY allowed facts about the candidate. Anything not explicitly listed is unknown and must not be written.",
    "Return strict JSON only, with no markdown and no commentary outside the JSON.",
    "",
    "Job posting:",
    `Company: ${clean(job.companyName) || "the company"}`,
    `Role: ${clean(job.jobRole) || "the role"}`,
    `Previous application sent date: ${sentLabel}`,
    "",
    "Candidate facts (the ONLY permitted facts about the candidate):",
    facts,
    "",
    "Resume text extracted from the candidate's uploaded PDF (verbatim, primary source of truth):",
    text || "(no resume text available — use only the candidate facts above)",
    "",
    "Strict Anti-Hallucination & Anti-Hype Rules:",
    "1. Zero fabrication: ONLY mention skills, tools, job titles, years of experience, and projects that explicitly appear in the provided Resume Text or Showcase Projects list.",
    "2. Never invent metrics or claims: Do NOT make up percentages, user counts, revenue numbers, or 'proven track record' claims unless those exact numbers are in the resume.",
    "3. No fake skill matching: If the job description requires a technology that is NOT in the resume, do NOT claim the candidate knows it. Focus strictly on the genuine overlapping skills.",
    "4. Mention real projects only: Pick 1–2 relevant projects from the resume or profile.projects if relevant, described plainly and accurately based only on what is written.",
    `5. No over-hyped buzzwords: Strictly ban phrases like ${BANNED_PROMPT_LIST}. Write like a real, grounded engineer—clear, concise, and factual (60–90 words).`,
    "6. The body must be 60-90 words of plain text, with no placeholders, brackets or bullet lists.",
    "7. Mention following up on the previously submitted application, reiterate interest factually, reference attached resume, and sign off cleanly.",
    "8. The subject line must name the company and role, stay under 90 characters, and contain no hype.",
    'Reply with JSON shaped exactly like {"subject": "...", "body": "..."}.',
  ]
    .filter((line) => line !== "")
    .join("\n");
};

const callGemini = async (prompt, systemPrompt = STRICT_SYSTEM_PROMPT) => {
  const apiKey = clean(process.env.GEMINI_API_KEY);
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  };

  if (systemPrompt) {
    body.system_instruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs()),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini request failed (${response.status}) ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  const parts = (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part?.text)
    .filter(Boolean)
    .join("");

  return parseEmailJson(parts);
};

const callOllama = async (prompt, systemPrompt = STRICT_SYSTEM_PROMPT) => {
  const body = {
    model: ollamaModel(),
    prompt,
    format: "json",
    stream: false,
    options: { temperature: 0.2 },
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const response = await fetch(providerUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs()),
  });

  if (!response.ok) throw new Error(`Ollama request failed (${response.status})`);

  const data = await response.json();
  return parseEmailJson(data?.response);
};

const splitSentences = (text) =>
  clean(text)
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 30);

// A posting sentence is only quotable when every capitalised term in it is
// already in the candidate's material. This keeps "We need Rust and
// Kubernetes" out of the email while still using neutral scope lines.
const CAPITALISED_WORD = /\b[A-Z][A-Za-z0-9.+#-]{1,}\b/g;

const safeHighlights = (description, allowedText, count) => {
  const allowed = String(allowedText || "").toLowerCase();
  const picked = [];

  for (const sentence of splitSentences(description)) {
    const capitalised = sentence.match(CAPITALISED_WORD) || [];
    // The first word of a sentence is capitalised by grammar, not by being a
    // product name, so it is not treated as a claim.
    const unsupported = capitalised
      .slice(1)
      .filter((word) => !allowed.includes(word.toLowerCase()));
    if (unsupported.length) continue;

    picked.push(sentence);
    if (picked.length === count) break;
  }

  return picked;
};

const quotedHighlights = (highlights) =>
  highlights.map((sentence) => `“${truncate(sentence.replace(/[.]$/, ""), 150)}”`);

const buildSignOff = (profile = {}) => {
  const name = clean(profile.fullName) || "Your Name";
  const signOff = ["Best regards,", name];
  const links = [profile.portfolioUrl, profile.githubUrl, profile.linkedinUrl]
    .map(clean)
    .filter(Boolean);
  if (links.length) signOff.push(links.join(" · "));

  const contact = [clean(profile.phone), clean(profile.email)].filter(Boolean);
  if (contact.length) signOff.push(contact.join(" · "));

  return signOff.join("\n");
};

const PROJECT_TECH = (project) =>
  (project?.techStack || []).map(clean).filter(Boolean).join(", ");

// Users type the note as an instruction ("mention I can join immediately"),
// so the template turns it into a sentence instead of pasting the instruction.
const NOTE_INSTRUCTION =
  /^(please\s+)?(mention|highlight|note|emphasize|emphasise|stress|underline|say|add|include|point out|make clear)\s+(that\s+)?/i;

const naturalNote = (note) => {
  const text = truncate(note, MAX_CUSTOM_NOTE).replace(/[.\s]+$/, "");
  if (!text) return "";

  const stripped = text.replace(NOTE_INSTRUCTION, "");
  const sentence = `${stripped.charAt(0).toUpperCase()}${stripped.slice(1)}`;

  // A first-person note already reads as its own sentence.
  if (/^I\b/i.test(stripped)) return `${sentence}.`;
  return `One detail worth mentioning: ${stripped}.`;
};

// Plain, factual fallback: every clause is either resume-backed, taken from the
// posting, or written by the candidate in the profile/note.
const buildTemplateEmail = ({
  job = {},
  profile = {},
  resume = null,
  resumeText = "",
  tone = "direct",
  customNote = "",
}) => {
  const nextTone = normalizeTone(tone);
  const name = clean(profile.fullName) || "Your Name";
  const company = clean(job.companyName) || "your team";
  const role = clean(job.jobRole) || "this role";
  const location = clean(profile.location);
  const resumeName = clean(resume?.fileName);
  const note = naturalNote(customNote);

  const text = clean(resumeText) || clean(resume?.extractedText);
  const skills = groundedSkills(profile.skills, text);
  const { matchedSkills } = computeMatch(job, skills);
  const relevant = (matchedSkills.length ? matchedSkills : skills).slice(0, 3);
  const stack = formatList(relevant);
  const years = groundedYears(profile, text);
  const project = pickRelevantProject(projectList(profile), job);

  const yearsClause = years
    ? `I have ${years} year${years === 1 ? "" : "s"} of experience.`
    : "";

  let opener;
  let close;

  if (nextTone === "founder") {
    opener = [
      `Short version: I am applying for the ${role} role at ${company}.`,
      location ? `I am based in ${location}.` : "",
      yearsClause,
      stack ? `Most of my work is in ${stack}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    close =
      "Worth 15 minutes this week to see whether the scope matches what I have been doing?";
  } else if (nextTone === "enthusiastic") {
    opener = [
      `I am applying for the ${role} role at ${company}.`,
      location ? `I am based in ${location}.` : "",
      yearsClause,
      stack ? `The work I do is mostly in ${stack}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    close =
      "I would like to hear how the team is approaching this hire and what the first month should cover.";
  } else {
    opener = [
      `${name} here, applying for the ${role} role at ${company}.`,
      location ? `I am based in ${location}.` : "",
      yearsClause,
      stack ? `Most of my work is in ${stack}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    close =
      "If the role is still open, I would welcome a short conversation about what the team needs first.";
  }

  // Only a posting sentence whose named tools are already in the resume is
  // quoted, so a requirement like Rust never appears in the email.
  const allowedText = [
    text,
    skills.join(" "),
    clean(profile.fullName),
    clean(profile.headline),
    clean(profile.location),
    clean(job.companyName),
  ]
    .filter(Boolean)
    .join(" ");
  const quoted = quotedHighlights(safeHighlights(job.jobDescription, allowedText, 1));

  // With no genuine overlap the email says so instead of implying a fit.
  const fitClause = matchedSkills.length
    ? `The posting and my resume overlap on ${formatList(
        matchedSkills.slice(0, 3),
      )}, which is the part of the role I can speak to directly.`
    : skills.length
      ? "The posting and my resume do not overlap on every tool it lists, so I will keep this to what my resume supports."
      : "";

  const detail = [
    quoted.length ? `The posting describes ${quoted[0]}.` : "",
    fitClause,
  ]
    .filter(Boolean)
    .join(" ");

  const remainingSkills = skills.filter((skill) => !relevant.includes(skill)).slice(0, 2);
  const extraStack = remainingSkills.length
    ? `I also work with ${formatList(remainingSkills)}.`
    : "";

  const projectHighlight = project ? clean(project.highlight).replace(/[.\s]+$/, "") : "";
  const projectParagraph = project
    ? `A project of mine is ${clean(project.name)}${
        PROJECT_TECH(project) ? ` (${PROJECT_TECH(project)})` : ""
      }${projectHighlight ? `: ${truncate(projectHighlight, 140)}` : ""}${
        clean(project.url) ? ` — ${clean(project.url)}` : ""
      }.`
    : "";

  const resumeParagraph = `My resume is attached${
    resumeName ? ` (${resumeName})` : ""
  } and covers the rest of my background in more detail.`;

  const paragraphs = [
    `Hi ${company} team,`,
    opener,
    detail,
    extraStack,
    projectParagraph,
    note,
    resumeParagraph,
    "I am glad to share code samples or walk through the project in more detail.",
    close,
  ].filter(Boolean);

  const subjects = {
    direct: `${role} at ${company} — ${name}`,
    enthusiastic: `${name} — ${role} at ${company}`,
    founder: `${role} at ${company}: ${name}`,
  };

  return {
    subject: truncate(subjects[nextTone], 90),
    body: [...paragraphs, buildSignOff(profile)].join("\n\n"),
  };
};

// A draft is rejected when it uses banned wording or numbers that no source
// supports. Sources are the resume text, the custom note and the profile.
const reviewEmail = (result, sources) => {
  if (!result) return ["no usable email"];

  const text = `${result.subject}\n${result.body}`;
  const problems = [];

  const hype = findBannedPhrase(text);
  if (hype) problems.push(`banned hype wording "${hype}"`);

  const metrics = unsupportedMetrics(result.body, sources);
  if (metrics.length) problems.push(`numbers that are not in the resume: ${metrics.join(", ")}`);

  return problems;
};

export const generateApplicationEmail = async ({
  job,
  profile = {},
  resume = null,
  tone = "direct",
  customNote = "",
}) => {
  const provider = clean(process.env.AI_PROVIDER).toLowerCase() || "template";
  const nextTone = normalizeTone(tone);
  const note = truncate(customNote, MAX_CUSTOM_NOTE);

  // Parses and saves the PDF text the first time a resume is used.
  const resumeText = await ensureResumeText(resume);
  const call = provider === "gemini" ? callGemini : callOllama;

  if (provider === "gemini" || provider === "ollama") {
    const prompt = buildPrompt({
      job,
      profile,
      resume,
      resumeText,
      tone: nextTone,
      customNote: note,
    });
    const sources = [
      resumeText,
      note,
      JSON.stringify(projectList(profile)),
      String(profile.yearsOfExperience ?? ""),
    ];

    try {
      let result = await call(prompt, STRICT_SYSTEM_PROMPT);
      const problems = result ? reviewEmail(result, sources) : [];

      if (problems.length) {
        console.warn(
          `[aiGenerator] ${provider} draft rejected (${problems.join("; ")}); retrying once.`,
        );
        const retryPrompt = `${prompt}\n\nYour previous draft broke the rules: ${problems.join(
          "; ",
        )}. Rewrite the email using only facts from the resume text, with no hype and no invented numbers. Return JSON only.`;
        result = await call(retryPrompt, STRICT_SYSTEM_PROMPT);

        if (result) {
          const remaining = reviewEmail(result, sources);
          if (remaining.length) {
            console.warn(
              `[aiGenerator] ${provider} draft still unusable (${remaining.join("; ")}); using the template.`,
            );
            result = null;
          }
        }
      }

      if (result) return { ...result, providerUsed: provider };
      console.warn(`[aiGenerator] ${provider} returned an unusable email; using the template.`);
    } catch (error) {
      console.warn(`[aiGenerator] ${provider} failed (${error.message}); using the template.`);
    }
  }

  return {
    ...buildTemplateEmail({
      job,
      profile,
      resume,
      resumeText,
      tone: nextTone,
      customNote: note,
    }),
    providerUsed: "template",
  };
};

/**
 * Plain, factual follow-up template: strictly uses resume-grounded skills and
 * a real showcase project if available.
 */
export const buildTemplateFollowUpEmail = ({
  job = {},
  application = {},
  profile = {},
  resume = null,
  resumeText = "",
}) => {
  const name = clean(profile.fullName) || "Your Name";
  const company = clean(job.companyName) || "your team";
  const role = clean(job.jobRole) || "the role";

  const sentAt = application.sentAt ? new Date(application.sentAt) : null;
  const sentLabel =
    sentAt && !Number.isNaN(sentAt.getTime())
      ? sentAt.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "recently";

  const text = clean(resumeText) || clean(resume?.extractedText);
  const skills = groundedSkills(profile.skills, text);
  const { matchedSkills } = computeMatch(job, skills);
  const proof = matchedSkills.length
    ? ` ${formatList(matchedSkills.slice(0, 2))} is still the part of the posting I can point to directly.`
    : "";

  const project = pickRelevantProject(projectList(profile), job);
  const projectHighlight = project ? clean(project.highlight).replace(/[.\s]+$/, "") : "";
  const projectNote = project
    ? `Since then, I also continue work on ${clean(project.name)}${
        PROJECT_TECH(project) ? ` (${PROJECT_TECH(project)})` : ""
      }${projectHighlight ? `: ${truncate(projectHighlight, 120)}` : ""}.`
    : "";

  const resumeName = clean(resume?.fileName);

  const body = [
    `Hi ${company} team,`,
    `I applied for the ${role} role on ${sentLabel} and wanted to follow up rather than leave it hanging.${proof} I am still interested and would welcome a short conversation about what the team needs first.`,
    projectNote,
    `My resume is attached${resumeName ? ` (${resumeName})` : ""} again for convenience.`,
    buildSignOff(profile),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    subject: truncate(`Following up: ${role} at ${company} — ${name}`, 90),
    body,
  };
};

/**
 * A 60-90 word nudge for an application that has gone quiet. Same grounding as
 * the application email: only resume-backed skills are named.
 */
export const generateFollowUpEmail = async ({
  job = {},
  application = {},
  profile = {},
  resume = null,
  resumeText = "",
} = {}) => {
  const provider = clean(process.env.AI_PROVIDER).toLowerCase() || "template";
  const text = clean(resumeText) || (await ensureResumeText(resume));
  const call = provider === "gemini" ? callGemini : callOllama;

  if (provider === "gemini" || provider === "ollama") {
    const prompt = buildFollowUpPrompt({
      job,
      application,
      profile,
      resume,
      resumeText: text,
    });
    const sources = [
      text,
      JSON.stringify(projectList(profile)),
      String(profile.yearsOfExperience ?? ""),
    ];

    try {
      let result = await call(prompt, STRICT_FOLLOW_UP_SYSTEM_PROMPT);
      const problems = result ? reviewEmail(result, sources) : [];

      if (problems.length) {
        console.warn(
          `[aiGenerator] ${provider} follow-up draft rejected (${problems.join("; ")}); retrying once.`,
        );
        const retryPrompt = `${prompt}\n\nYour previous draft broke the rules: ${problems.join(
          "; ",
        )}. Rewrite using only facts from the resume text, with no hype and no invented numbers. Return JSON only.`;
        result = await call(retryPrompt, STRICT_FOLLOW_UP_SYSTEM_PROMPT);

        if (result) {
          const remaining = reviewEmail(result, sources);
          if (remaining.length) {
            console.warn(
              `[aiGenerator] ${provider} follow-up draft still unusable (${remaining.join("; ")}); using template.`,
            );
            result = null;
          }
        }
      }

      if (result) return { ...result, providerUsed: provider };
      console.warn(`[aiGenerator] ${provider} returned an unusable follow-up; using template.`);
    } catch (error) {
      console.warn(`[aiGenerator] ${provider} follow-up failed (${error.message}); using template.`);
    }
  }

  return {
    ...buildTemplateFollowUpEmail({
      job,
      application,
      profile,
      resume,
      resumeText: text,
    }),
    providerUsed: "template",
  };
};

export { buildTemplateEmail, buildPrompt, buildFollowUpPrompt };
