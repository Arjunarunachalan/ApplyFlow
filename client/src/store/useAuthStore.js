"use client";

import { create } from "zustand";
import { authApi, errorMessage } from "@/lib/api";

export const useAuthStore = create((set) => ({
  user: null,
  authenticated: false,
  authRequired: false,
  needsSetup: false,
  loading: true,
  error: null,

  checkStatus: async () => {
    set({ loading: true, error: null });
    try {
      const data = await authApi.status();
      set({
        authenticated: Boolean(data.authenticated),
        authRequired: Boolean(data.authRequired),
        needsSetup: Boolean(data.needsSetup),
        user: data.user || null,
        loading: false,
      });
      return data;
    } catch (err) {
      set({
        authenticated: false,
        authRequired: false,
        needsSetup: false,
        user: null,
        loading: false,
        error: errorMessage(err),
      });
      return null;
    }
  },

  setup: async ({ name, email, password }) => {
    set({ error: null });
    const data = await authApi.setup({ name, email, password });
    set({
      authenticated: true,
      needsSetup: false,
      user: data.user,
      loading: false,
    });
    return data.user;
  },

  login: async ({ email, password }) => {
    set({ error: null });
    const data = await authApi.login({ email, password });
    set({
      authenticated: true,
      needsSetup: false,
      user: data.user,
      loading: false,
    });
    return data.user;
  },

  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      set({ authenticated: false, user: null, loading: false });
    }
  },

  markUnauthenticated: () => {
    set({ authenticated: false, user: null, loading: false });
  },
}));
