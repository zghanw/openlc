import type { Metadata } from "next";
import { SessionScope } from "@/app/components/sign-in-gate";

export const metadata: Metadata = { title: "OpenLC · Wallet", description: "Available balance, secured funds and wallet activity." };

export default function WalletLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <SessionScope>{children}</SessionScope>; }
