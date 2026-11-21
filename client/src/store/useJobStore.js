"use client";

import { create } from "zustand";
import { applicationApi, errorMessage, jobApi, resumeApi, syncApi } from "@/lib/api";

const initialFilters = { search: "", type: "all", status: "all" };

export const useJobStore = create((set, get) => ({
  jobs: [],
  resumes: [],
  filters: initialFilters,

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
  bulkApplying: false,
  bulkProgress: null,

  setFilter: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
  resetFilters: () => set({ filters: initialFilters }),

  fetchJobs: async () => {
    const { search, type, status } = get().filters;
    set({ loading: true, error: null });
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (type !== "all") params.type = type;
      if (status !== "all") params.status = status;

      const jobs = await jobApi.list(params);
      set({ jobs, loading: false });
    } catch (error) {
      set({ error: errorMessage(error), loading: false });
    }
  },

  deleteJob: async (id) => {
    try {
      await jobApi.remove(id);
      set((state) => ({ jobs: state.jobs.filter((job) => job._id !== id) }));
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  generateDraft: async (jobId, options = {}) => {
    set({ generatingJobId: jobId, error: null });
    try {
      const application = await applicationApi.generate(jobId, options);
      set({ generatingJobId: null });
      await get().fetchJobs();
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
      await get().fetchJobs();
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
      await get().fetchJobs();
      return result;
    } catch (error) {
      set({ bulkApplying: false, bulkProgress: null, error: errorMessage(error) });
      return null;
    }
  },

  // Drafts are generated one at a time by the API, so the bar reports the
  // batch size while the request is in flight.
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
      await get().fetchJobs();
      return result;
    } catch (error) {
      set({ bulkDrafting: false, bulkProgress: null, error: errorMessage(error) });
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
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  createJob: async (job) => {
    set({ error: null });
    try {
      const created = await jobApi.create(job);
      set((state) => ({ jobs: [created, ...state.jobs] }));
      return created;
    } catch (error) {
      set({ error: errorMessage(error) });
      return null;
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
    } catch (error) {
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
      await get().fetchJobs();
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
