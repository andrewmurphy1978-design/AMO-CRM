"use client";

import { useEffect } from "react";

// Registers the service worker that makes the CRM installable and shows push notifications.
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
