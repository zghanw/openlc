import type { Metadata } from "next";
import "./globals.css";
import "./app-shell.css";
import "./app-shell-2.css";
import "./app-shell-3.css";
import "./app-shell-4.css";
import "./app-shell-5.css";
import { ClientShell } from "./client-shell";

export const metadata: Metadata = {
  title: "OpenLC",
  description:
    "Escrow for B2B orders on BOT Chain: payment is locked before the goods ship and released in milestones as dispatch and delivery are proven.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
