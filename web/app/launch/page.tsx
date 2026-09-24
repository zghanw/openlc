import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderMarkdown } from "@/lib/markdown";
import { BuiltOnBotChain } from "@/app/components/built-on-botchain";

export const metadata = {
  title: "OpenLC is officially launched on BOT Chain Mainnet",
  description: "OpenLC, escrow for business orders, is officially launched on BOT Chain Mainnet: the contract, the first mainnet order and how to use it.",
};

// The announcement lives in docs/launch.md beside the Terms and the Policy, rendered by the same renderer.
export default async function LaunchPage() {
  const source = await readFile(path.join(process.cwd(), "..", "docs", "launch.md"), "utf8");
  return (
    <div className="legal-shell">
      <header className="legal-header">
        <a className="logo" href="/">
          <span className="logo-mark brand-logo-mark">
            <img src="/favicon.png" alt="" width="40" height="40" />
          </span>
          <span>OpenLC</span>
        </a>
        <nav className="legal-nav">
          <a href="/">Home</a>
          <a href="/legal/terms">Terms of Service</a>
          <a href="/legal/dispute-policy">Dispute Policy</a>
        </nav>
      </header>
      <main className="legal-main">
        <article className="legal-document" dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />
      </main>
      <footer className="legal-footer">
        <BuiltOnBotChain />
      </footer>
    </div>
  );
}
