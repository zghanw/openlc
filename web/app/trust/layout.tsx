import type { Metadata } from "next";
import { SessionScope } from "@/app/components/sign-in-gate";
export const metadata: Metadata = { title: "OpenLC · Trust profile", description: "Manage the verified activity shown on your company trust profile." };
export default function TrustLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <SessionScope>{children}</SessionScope>; }
