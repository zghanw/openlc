import type { Metadata } from "next";
import { SessionScope } from "@/app/components/sign-in-gate";

export const metadata: Metadata = { title: "OpenLC · Overview", description: "Orders that need your action, and where your money is." };

export default function UnifiedLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <SessionScope>{children}</SessionScope>; }
