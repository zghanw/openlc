"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";

const Providers = dynamic(
  () => import("./providers").then((module) => module.Providers),
  { ssr: false },
);

export function ClientShell({ children }: { children: React.ReactNode }) {
  // The API sleeps on Render's free tier and needs about 30-45s to wake. Start that wake when
  // any page opens, so sign-in is not the request that pays for it.
  useEffect(() => {
    const api = process.env.NEXT_PUBLIC_OPENLC_BACKEND_URL?.replace(/\/$/, "");
    if (api) void fetch(`${api}/health`).catch(() => {});
  }, []);
  return <Providers>{children}</Providers>;
}
