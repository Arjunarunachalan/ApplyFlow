/**
 * Deterministic job matching.
 *
 * The score is a pure function of the candidate's skills and the posting text,
 * so the same job and profile always produce the same number. Scores are
 * recalculated on import and whenever the profile changes.
 */

const clean = (value) =>
  value === undefined || value === null ? "" : String(value).trim();

export const normalizeSkill = (skill) =>
  clean(skill).toLowerCase().replace(/\s+/g, " ");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Skills like "Node.js", "C++" and "C#" survive because the boundary class
// only excludes letters, digits and the symbols those skills end with.
export const containsSkill = (haystack, skill) => {
  const needle = normalizeSkill(skill);
  if (needle.length < 2 || !haystack) return false;
  const pattern = new RegExp(
    `(^|[^a-z0-9+#])${escapeRegExp(needle)}($|[^a-z0-9+#])`,
    "i",
  );
  return pattern.test(haystack);
};

export const dedupeSkills = (skills = []) => {
  const seen = new Set();
  const list = [];
  for (const skill of Array.isArray(skills) ? skills : []) {
    const label = clean(skill);
    const key = normalizeSkill(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    list.push(label);
  }
  return list;
};

/**
 * computeMatch({ jobRole, jobDescription, location }, skills)
 * -> { matchScore: 0-100, matchedSkills: [String] }
 */
export const computeMatch = (job = {}, skills = []) => {
  const profileSkills = dedupeSkills(skills);
  if (!profileSkills.length) return { matchScore: 0, matchedSkills: [] };

  const posting = `${clean(job.jobRole)} ${clean(job.jobDescription)}`.toLowerCase();
  if (!posting.trim()) return { matchScore: 0, matchedSkills: [] };

  const matchedSkills = profileSkills.filter((skill) =>
    containsSkill(posting, skill),
  );

  const roleText = clean(job.jobRole).toLowerCase();
  const roleHits = matchedSkills.filter((skill) => containsSkill(roleText, skill)).length;

  // Covering the first six skills is a full match; skills named in the role
  // title itself add the remaining 20 points.
  const coverage = Math.min(1, matchedSkills.length / Math.min(profileSkills.length, 6));
  const matchScore = Math.min(100, Math.round(coverage * 80 + Math.min(20, roleHits * 10)));

  return { matchScore, matchedSkills };
};

/**
 * Picks the one project that best fits a posting, preferring projects whose
 * tech stack appears in the description. Ties fall back to the first project.
 */
export const pickRelevantProject = (projects = [], job = {}) => {
  const list = (Array.isArray(projects) ? projects : []).filter(
    (project) => project && clean(project.name),
  );
  if (!list.length) return null;

  const posting = `${clean(job.jobRole)} ${clean(job.jobDescription)}`.toLowerCase();

  let best = list[0];
  let bestScore = -1;

  for (const project of list) {
    let score = 0;
    for (const tech of project.techStack || []) {
      if (containsSkill(posting, tech)) score += 2;
    }
    if (posting && posting.includes(clean(project.name).toLowerCase())) score += 1;
    if (score > bestScore) {
      best = project;
      bestScore = score;
    }
  }

  return best;
};

export default { computeMatch, pickRelevantProject };
