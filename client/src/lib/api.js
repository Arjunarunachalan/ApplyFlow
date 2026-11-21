import axios from "axios";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

const unwrap = (request) => request.then((response) => response.data);

export const jobApi = {
  list: (params = {}) => unwrap(api.get("/jobs", { params })),
  create: (job) => unwrap(api.post("/jobs", job)),
  remove: (id) => unwrap(api.delete(`/jobs/${id}`)),
  setStatus: (id, status) => unwrap(api.patch(`/jobs/${id}/status`, { status })),
  setInterview: (id, interview) => unwrap(api.patch(`/jobs/${id}/interview`, interview)),
  upcomingInterviews: () => unwrap(api.get("/jobs/upcoming-interviews")),
  recalculateScores: () => unwrap(api.post("/jobs/recalculate-scores")),
  importCsv: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return unwrap(
      api.post("/jobs/import-csv", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      }),
    );
  },
};

export const resumeApi = {
  list: () => unwrap(api.get("/resumes")),
  upload: (file, { title, isDefault } = {}) => {
    const formData = new FormData();
    formData.append("file", file);
    if (title) formData.append("title", title);
    if (isDefault) formData.append("isDefault", "true");
    return unwrap(
      api.post("/resumes", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      }),
    );
  },
  reparse: (id) => unwrap(api.post(`/resumes/${id}/reparse`)),
  setDefault: (id) => unwrap(api.patch(`/resumes/${id}/default`)),
  remove: (id) => unwrap(api.delete(`/resumes/${id}`)),
};

export const applicationApi = {
  list: (status) =>
    unwrap(
      api.get("/applications", {
        params: status && status !== "all" ? { status } : {},
      }),
    ),
  generate: (jobId, options = {}) => unwrap(api.post(`/applications/generate/${jobId}`, options)),
  generateBatch: (payload) => unwrap(api.post("/applications/generate-batch", payload)),
  generateFollowUp: (id) => unwrap(api.post(`/applications/${id}/generate-followup`)),
  approveBatch: (applicationIds) =>
    unwrap(api.post("/applications/approve-batch", { applicationIds })),
  setStatus: (id, status) =>
    unwrap(api.patch(`/applications/${id}/status`, { status })),
  update: (id, patch) => unwrap(api.patch(`/applications/${id}`, patch)),
  approve: (id) => unwrap(api.post(`/applications/${id}/approve-and-queue`)),
  exportCsvUrl: `${API_BASE_URL}/applications/export-csv`,
  exportPdfUrl: `${API_BASE_URL}/applications/export-pdf`,
};

export const profileApi = {
  get: () => unwrap(api.get("/profile")),
  save: (payload) => unwrap(api.put("/profile", payload)),
};

export const analyticsApi = {
  get: () => unwrap(api.get("/analytics")),
  sendDigest: () => unwrap(api.post("/analytics/send-digest")),
};

export const syncApi = {
  run: () => unwrap(api.post("/sync/replies")),
};

export const errorMessage = (error) =>
  error?.response?.data?.error || error?.message || "Something went wrong";
