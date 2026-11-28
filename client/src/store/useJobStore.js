"use client";

import { create } from "zustand";
import { applicationApi, errorMessage, jobApi, resumeApi, syncApi } from "@/lib/api";

export const initialJobFilters = {
  search: "",
  type: "all",
  status: "all",
  lifecycleStatus: "all",
  contactFilter: "all",
  dateField: "createdAt",
  datePreset: "",
  dateFrom: "",
  dateTo: "",
  company: "",
  jobTitle: "",
  location: "",
  experience: "",
  workArrangement: "all",
  sourcePlatform: "",
  importType: "all",
  resumeId: "all",
  sort: "newest",
  page: 1,
  limit: 25,
};

const EMPTY_SUMMARY = {
  pendingVacancies: 0,
  emailAvailable: 0,
  emailNotFound: 0,
  draftsReady: 0,
  approvedReadyToSend: 0,
  failedApplications: 0,
};

export const useJobStore = create((set, get) => ({
  jobs: [],
  total: 0,
  page: 1,
  limit: 25,
  totalPages: 1,
  summary: EMPTY_SUMMARY,
  resumes: [],
  filters: initialJobFilters,

  loading: false,
  resumesLoading: false,
  parsingResumeId: null,
  importing: false,
  uploading: false,
  error: null,
  resumeError: null,
  lastImport: null,
  generatingJobId: null,
  applyingJobId: null,
  bulkDrafting: false,
  bulkDeleting: false,
  bulkApplying: false,
  bulkProgress: null,

  setFilter: (patch) =>
    set((state) => ({
      filters: {
        ...state.filters,
        ...patch,
        // Reset page to 1 when any non-page filter changes
        page: patch.page !== undefined ? patch.page : 1,
      },
    })),

  resetFilters: () => set({ filters: initialJobFilters }),

  fetchJobs: async (overrides = {}) => {
    const f = { ...get().filters, ...overrides };
    set({ loading: true, error: null });
    try {
      const params = {
        scope: f.scope || "all",
        sort: f.sort || "newest",
        page: f.page || 1,
        limit: f.limit || 25,
      };
      if (f.search?.trim()) params.search = f.search.trim();
      if (f.type && f.type !== "all") params.type = f.type;
      if (f.lifecycleStatus && f.lifecycleStatus !== "all") {
        params.lifecycleStatus = f.lifecycleStatus;
      } else if (f.status && f.status !== "all") {
        params.status = f.status;
      }
      if (f.contactFilter && f.contactFilter !== "all") params.contactFilter = f.contactFilter;
      if (f.dateField) params.dateField = f.dateField;
      if (f.datePreset) params.datePreset = f.datePreset;
      if (f.dateFrom) params.dateFrom = f.dateFrom;
      if (f.dateTo) params.dateTo = f.dateTo;
      if (f.company?.trim()) params.company = f.company.trim();
      if (f.jobTitle?.trim()) params.jobTitle = f.jobTitle.trim();
      if (f.location?.trim()) params.location = f.location.trim();
      if (f.experience?.trim()) params.experience = f.experience.trim();
      if (f.workArrangement && f.workArrangement !== "all") {
        params.workArrangement = f.workArrangement;
      }
      if (f.sourcePlatform?.trim()) params.sourcePlatform = f.sourcePlatform.trim();
      if (f.importType && f.importType !== "all") params.importType = f.importType;
      if (f.resumeId && f.resumeId !== "all") params.resumeId = f.resumeId;

      const data = await jobApi.list(params);
      const items = Array.isArray(data) ? data : data.items || [];
      set({
        jobs: items,
        total: data.total ?? items.length,
        page: data.page ?? params.page,
        limit: data.limit ?? params.limit,
        totalPages: data.totalPages ?? 1,
        summary: data.summary || get().summary,
        loading: false,
      });
      return data;
    } catch (error) {
      set({ error: errorMessage(error), loading: false });
      return null;
    }
  },

  deleteJob: async (id) => {
    try {
      await jobApi.remove(id);
      set((state) => ({ jobs: state.jobs.filter((job) => job._id !== id) }));
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    }
  },

  archiveJob: async (id, archived = true) => {
    try {
      const updated = await jobApi.archive(id, archived);
      set((state) => ({
        jobs: state.jobs.map((job) => (job._id === id ? { ...job, ...updated } : job)),
      }));
      return updated;
    } catch (error) {
      set({ error: errorMessage(error) });
      return null;
    }
  },

  updateJobDetails: async (id, patch) => {
    try {
      const updated = await jobApi.update(id, patch);
      set((state) => ({
        jobs: state.jobs.map((job) => (job._id === id ? { ...job, ...updated } : job)),
      }));
      return updated;
    } catch (error) {
      set({ error: errorMessage(error) });
      throw error;
    }
  },

  generateDraft: async (jobId, options = {}) => {
    set({ generatingJobId: jobId, error: null });
    try {
      const application = await applicationApi.generate(jobId, options);
      set({ generatingJobId: null });
      return application;
    } catch (error) {
      set({ generatingJobId: null, error: errorMessage(error) });
      return null;
    }
  },

  autoApply: async (jobId, options = {}) => {
    set({ applyingJobId: jobId, error: null });
    try {
      const result = await applicationApi.autoApply(jobId, options);
      set({ applyingJobId: null });
      return result;
    } catch (error) {
      set({ applyingJobId: null, error: errorMessage(error) });
      return null;
    }
  },

  autoApplyBatch: async (jobIds, tone = "direct") => {
    if (!jobIds.length) return null;
    set({
      bulkApplying: true,
      bulkProgress: { done: 0, total: jobIds.length },
      error: null,
    });
    try {
      const result = await applicationApi.autoApplyBatch({ jobIds, tone });
      set({ bulkApplying: false, bulkProgress: null });
      return result;
    } catch (error) {
      set({ bulkApplying: false, bulkProgress: null, error: errorMessage(error) });
      return null;
    }
  },

  generateDrafts: async (jobIds, tone = "direct") => {
    if (!jobIds.length) return null;
    set({
      bulkDrafting: true,
      bulkProgress: { done: 0, total: jobIds.length },
      error: null,
    });
    try {
      const result = await applicationApi.generateBatch({ jobIds, tone });
      set({ bulkDrafting: false, bulkProgress: null });
      return result;
    } catch (error) {
      set({ bulkDrafting: false, bulkProgress: null, error: errorMessage(error) });
      return null;
    }
  },

  bulkDeleteJobs: async (jobIds) => {
    if (!jobIds.length) return null;
    set({ bulkDeleting: true, error: null });
    try {
      const result = await jobApi.bulkDelete(jobIds);
      const idSet = new Set(jobIds);
      set((state) => ({
        jobs: state.jobs.filter((item) => !idSet.has(item._id)),
        bulkDeleting: false,
      }));
      return result;
    } catch (error) {
      set({ bulkDeleting: false, error: errorMessage(error) });
      return null;
    }
  },

  markJobStatus: async (id, status) => {
    set({ error: null });
    try {
      const job = await jobApi.setStatus(id, status);
      set((state) => ({
        jobs: state.jobs.map((item) => (item._id === id ? { ...item, ...job } : item)),
      }));
      return job;
    } catch (error) {
      set({ error: errorMessage(error) });
      return null;
    }
  },

  createJob: async (jobData) => {
    set({ error: null });
    try {
      const result = await jobApi.create(jobData);
      const job = result?.job || result;
      if (job) {
        set((state) => ({ jobs: [job, ...state.jobs] }));
      }
      return result;
    } catch (error) {
      set({ error: errorMessage(error) });
      throw error;
    }
  },

  setInterview: async (id, interview) => {
    set({ error: null });
    try {
      const job = await jobApi.setInterview(id, interview);
      set((state) => ({
        jobs: state.jobs.map((item) => (item._id === id ? { ...item, ...job } : item)),
      }));
      return job;
    } catch (error) {
      set({ error: errorMessage(error) });
      return null;
    }
  },

  fetchUpcomingInterviews: async () => {
    try {
      return await jobApi.upcomingInterviews();
    } catch {
      return [];
    }
  },

  syncReplies: async () => {
    set({ error: null });
    try {
      return await syncApi.run();
    } catch (error) {
      set({ error: errorMessage(error) });
      return { checked: 0, repliesFound: 0, bouncesFound: 0, error: errorMessage(error) };
    }
  },

  importCsv: async (file) => {
    set({ importing: true, error: null, lastImport: null });
    try {
      const summary = await jobApi.importCsv(file);
      set({ importing: false, lastImport: summary });
      return summary;
    } catch (error) {
      set({ importing: false, error: errorMessage(error) });
      return null;
    }
  },

  fetchResumes: async () => {
    set({ resumesLoading: true, resumeError: null });
    try {
      const resumes = await resumeApi.list();
      set({ resumes, resumesLoading: false });
    } catch (error) {
      set({ resumeError: errorMessage(error), resumesLoading: false });
    }
  },

  uploadResume: async (file, options) => {
    set({ uploading: true, resumeError: null });
    try {
      await resumeApi.upload(file, options);
      set({ uploading: false });
      await get().fetchResumes();
      return true;
    } catch (error) {
      set({ uploading: false, resumeError: errorMessage(error) });
      return false;
    }
  },

  reparseResume: async (id) => {
    set({ parsingResumeId: id, resumeError: null });
    try {
      const resume = await resumeApi.reparse(id);
      set((state) => ({
        resumes: state.resumes.map((item) =>
          item._id === id ? { ...item, ...resume } : item,
        ),
        parsingResumeId: null,
      }));
      return resume;
    } catch (error) {
      set({ parsingResumeId: null, resumeError: errorMessage(error) });
      return null;
    }
  },

  setDefaultResume: async (id) => {
    try {
      await resumeApi.setDefault(id);
      await get().fetchResumes();
    } catch (error) {
      set({ resumeError: errorMessage(error) });
    }
  },

  deleteResume: async (id) => {
    try {
      await resumeApi.remove(id);
      set((state) => ({ resumes: state.resumes.filter((resume) => resume._id !== id) }));
    } catch (error) {
      set({ resumeError: errorMessage(error) });
    }
  },
}));
