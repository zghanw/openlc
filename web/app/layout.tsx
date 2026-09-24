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

// Impeccable direction contract (seed keys: world bfd3c1ba, landing surface 26fc985a). It is emitted
// as the first child of <body> so the finish review can audit the render against it.
const DIRECTION_CONTRACT = `<!--
LANDING
THESIS: Payment secured before it ships, watched happening; refuses the SaaS hero-plus-feature-grid.
OWN-WORLD: Owner-pinned monochrome: black ground, silver-white type, glossy near-black cards, luminous wave lines, white pill actions; no hue but white.
STORY: A judge sees money locked before goods move, watches credit terms lose to escrow on one timeline, sees the real partial claim, and tries it with one wallet.
FIRST VIEWPORT: Wave-line tunnel converging on the glowing OpenLC mark; centred headline; white pill "Try it with one wallet" plus "See how it works"; fact strip below.
FORM: Credit versus escrow, candidate 5 of 7, fused with a centre-staff timeline; seed 26fc985a.
WORKSPACE
THESIS: Money state and the next action first; refuses a decorated dashboard.
OWN-WORLD: Owner-pinned ops dashboard: cool near-black greys, one green accent for active and success, amber waiting, red problems, collapsible sidebar, blurred sticky header.
STORY: A party sees what is locked, what needs them, and acts in one click.
FIRST VIEWPORT: Sidebar left; header with title, network pill, New order; four money tiles; Needs your action list.
FORM: Owner-pinned structure.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <template dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
