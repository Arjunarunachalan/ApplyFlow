"use client";

import { useEffect, useState } from "react";

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Check if already running in standalone mode (desktop or mobile)
    const checkStandalone = () => {
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true ||
        document.referrer.includes("android-app://");
      setIsInstalled(Boolean(isStandalone));
    };

    checkStandalone();

    const mediaMatcher = window.matchMedia("(display-mode: standalone)");
    const onDisplayModeChange = (e) => {
      setIsInstalled(e.matches);
    };
    if (mediaMatcher.addEventListener) {
      mediaMatcher.addEventListener("change", onDisplayModeChange);
    } else {
      mediaMatcher.addListener(onDisplayModeChange);
    }

    // 2. Detect iOS / iPadOS Safari
    const ua = window.navigator.userAgent.toLowerCase();
    const isAppleDevice =
      /iphone|ipad|ipod/.test(ua) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    const isSafari =
      /safari/.test(ua) && !/chrome|crios|crmo|firefox|fxios/.test(ua);

    if (isAppleDevice && isSafari) {
      setIsIOS(true);
    }

    // 3. Listen for beforeinstallprompt (Chrome, Edge, Android)
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setIsInstallable(true);
    };

    // 4. Listen for appinstalled
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      setShowIOSModal(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      if (mediaMatcher.removeEventListener) {
        mediaMatcher.removeEventListener("change", onDisplayModeChange);
      } else {
        mediaMatcher.removeListener(onDisplayModeChange);
      }
    };
  }, []);

  const promptInstall = async () => {
    // If iOS Safari, trigger the step-by-step guidance modal
    if (isIOS) {
      setShowIOSModal(true);
      return { outcome: "ios_instructions" };
    }

    // If native prompt is available (Chrome, Edge, Android, Opera)
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setIsInstalled(true);
        setIsInstallable(false);
      }
      setDeferredPrompt(null);
      return choiceResult;
    }

    // Fallback if neither: on desktop/other browsers, show helper or prompt
    return { outcome: "unavailable" };
  };

  return {
    isInstallable: isInstallable || (isIOS && !isInstalled),
    isInstalled,
    isIOS,
    showIOSModal,
    setShowIOSModal,
    promptInstall,
  };
}
