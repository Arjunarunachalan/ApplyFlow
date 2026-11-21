"use client";

import { create } from "zustand";
import { applicationApi, errorMessage } from "@/lib/api";

const initialQuota = { sentToday: 0, queued: 0, dailyLimit: 30, remaining: 30 };

export const useApplicationStore = create((set, get) => ({
  applications: [],
  quota: initialQuota,
  statusFilter: "all",
  loading: false,
  error: null,

  setStatusFilter: (statusFilter) => set({ statusFilter }),

  fetchApplications: async () => {
    set({ loading: true, error: null });
    try {
      const data = await applicationApi.list(get().statusFilter);
      set({
        applications: data.applications || [],
        quota: data.quota || initialQuota,
        loading: false,
      });
    } catch (error) {
      set({ error: errorMessage(error), loading: false });
    }
  },
}));
