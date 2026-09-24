"use client";

import "./landing.css";
import { useEffect, useRef, useState } from "react";
import { MotionConfig, motion } from "motion/react";
import {
  ArrowDown,
  ArrowUpRight,
  BadgeCheck,
  Blocks,
  Check,
  FlaskConical,
  KeyRound,
  RefreshCcw,
  Scale,
} from "lucide-react";
import { BuiltOnBotChain } from "@/app/components/built-on-botchain";
import { TunnelCanvas } from "@/app/components/landing/tunnel-canvas";
import { WalletEntry } from "@/app/components/landing/wallet-entry";
import { CreditTimeline } from "@/app/components/landing/credit-timeline";
import { PartialClaim } from "@/app/components/landing/partial-claim";
import { BOTCHAIN } from "@/lib/chain";

const EASE = [0.16, 1, 0.3, 1] as const;
const ONCE = { once: true, amount: 0.3 } as const;
const TRY_DESTINATION = "/orders?action=create&demo=1";
const CONTRACT = "0x20C3b91B78D6F86b27C01e12692d2e56C0bcA5C5";
const GITHUB = "https://github.com/zghanw/openlc";

const FACTS = [
  { icon: Blocks, label: "Built on BOT Chain" },
  { icon: BadgeCheck, label: "Source-verified contract" },
  { icon: KeyRound, label: "No owner or admin keys" },
  { icon: FlaskConical, label: "41 contract tests" },
  { icon: RefreshCcw, label: "Every step re-verified on chain" },
];

function Brand() {
  return (
    <a className="lp-brand" href="#top" aria-label="OpenLC, back to top">
      <img src="/favicon.png" alt="" width={28} height={28} />
      <span>OpenLC</span>
    </a>
  );
}

function Consent() {
  return (
    <p className="lp-consent">
      By continuing you agree to the <a href="/legal/terms">Terms of Service</a> and the{" "}
      <a href="/legal/dispute-policy">Dispute Resolution Policy</a>.
    </p>
  );
}

function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="lp-header" data-scrolled={scrolled || undefined}>
      <div className="lp-wrap lp-header-inner">
        <Brand />
        <nav className="lp-nav" aria-label="Main">
          <a href="#timeline">How it works</a>
          <a href="#try">Try it</a>
          <a href="#truths">Security</a>
        </nav>
        <WalletEntry destination="/workspace" variant="header">
          Open workspace
        </WalletEntry>
      </div>
    </header>
  );
}

function Hero() {
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <section className="lp-hero" aria-labelledby="lp-hero-title">
      <TunnelCanvas anchorRef={anchorRef} />
      <div className="lp-wrap lp-hero-inner">
        <h1 id="lp-hero-title" className="lp-display">
          {["Locked before it ships.", "Released on proof."].map((line, index) => (
            <motion.span
              key={line}
              className="lp-display-line"
              initial={{ opacity: 0, y: 16, filter: "blur(14px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 1.2, delay: 0.2 + index * 0.16, ease: EASE }}
            >
              {line}
            </motion.span>
          ))}
        </h1>
        <motion.div
          className="lp-hero-body"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.62, ease: EASE }}
        >
          <p className="lp-hero-sub">
            OpenLC locks the buyer&apos;s BOT on BOT Chain before the goods move, pays the supplier as dispatch and
            delivery are proven, and holds only the disputed part.
          </p>
          <div className="lp-actions">
            <WalletEntry destination={TRY_DESTINATION}>Try it with one wallet</WalletEntry>
            <a className="lp-pill lp-pill--ghost" href="#timeline">
              See how it works <ArrowDown size={16} aria-hidden="true" />
            </a>
          </div>
          <Consent />
        </motion.div>

        <div className="lp-mark-slot" ref={anchorRef}>
          <motion.span
            className="lp-pillar"
            aria-hidden="true"
            initial={{ opacity: 0, scaleY: 0.2 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ duration: 1.6, delay: 0.7, ease: EASE }}
          >
            <span className="lp-pillar-glow" />
            <span className="lp-pillar-core" />
            <span className="lp-pillar-pool" />
          </motion.span>
          <motion.div
            className="lp-mark"
            initial={{ opacity: 0, y: 36, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1.4, delay: 0.35, ease: EASE }}
          >
            <span className="lp-mark-face">
              <img src="/favicon.png" alt="OpenLC" width={62} height={62} />
            </span>
          </motion.div>
        </div>

        <motion.ul
          className="lp-facts"
          aria-label="What is already true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 1.1, ease: EASE }}
        >
          {FACTS.map(({ icon: Icon, label }) => (
            <li key={label}>
              <Icon size={16} aria-hidden="true" />
              {label}
            </li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}

function TimelineSection() {
  return (
    <section id="timeline" className="lp-section lp-section--timeline" aria-labelledby="lp-timeline-title">
      <div className="lp-wrap">
        <motion.div
          className="lp-section-head lp-section-head--center"
          initial={{ opacity: 0, y: 18, filter: "blur(10px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={ONCE}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 id="lp-timeline-title" className="lp-h2">
            Sixty days of credit, or paid on proof.
          </h2>
          <p className="lp-lede">
            The same 3 BOT sale, two ways. On the right are the real transactions of order PO-90758439 on BOT Chain
            testnet, set on the days a shipment takes.
          </p>
        </motion.div>
        <CreditTimeline />
      </div>
    </section>
  );
}

function ClaimSection() {
  return (
    <section className="lp-section lp-section--claim" aria-labelledby="lp-claim-title">
      <div className="lp-wrap lp-claim-grid">
        <motion.div
          className="lp-claim-copy"
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={ONCE}
          transition={{ duration: 1, ease: EASE }}
        >
          <h2 id="lp-claim-title" className="lp-h2">
            When part of it goes wrong, only that part waits.
          </h2>
          <p className="lp-lede">
            Order PO-97139111 was for 1 BOT. The 0.1 BOT deposit and the 0.2 BOT dispatch payment had already reached
            the supplier, leaving 0.7 BOT held for delivery. A carton arrived damaged, so the buyer claimed 0.15 BOT.
          </p>
          <p className="lp-mediator">
            <Scale size={18} aria-hidden="true" />
            <span>
              When the parties are stuck, an AI mediator drafts a split from the evidence and the policy, quoting both
              word for word. It cannot move money.
            </span>
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 48 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={ONCE}
          transition={{ duration: 1.2, delay: 0.1, ease: EASE }}
        >
          <PartialClaim />
        </motion.div>
      </div>
    </section>
  );
}

const TRY_STEPS = [
  {
    title: "Connect MetaMask and sign in",
    body: "A readable message proves the wallet is yours. No transaction, no fee.",
    visual: (
      <div className="lp-sig">
        <span className="lp-sig-head">Signature request</span>
        <strong>Sign in to OpenLC</strong>
        <span>Network: BOT Chain (chain {BOTCHAIN.chainIdDec})</span>
        <span className="lp-sig-quiet">This request does not submit a transaction or spend funds.</span>
        <span className="lp-sig-actions">
          <i>Cancel</i>
          <i className="is-primary">Sign</i>
        </span>
      </div>
    ),
  },
  {
    title: "Get test BOT",
    body: "Claim free test BOT from the BOT Chain faucet to pay for gas and the order.",
    link: { href: "https://faucet.botchain.ai/basic", label: "Open the faucet" },
    visual: (
      <div className="lp-bal">
        <span className="lp-bal-top">
          <span className="lp-token">BOT</span>
          <span className="lp-bal-name">
            <strong>BOT</strong>
            <small>{BOTCHAIN.chainName}</small>
          </span>
          <span className="lp-bal-ok">
            <Check size={12} aria-hidden="true" /> Received
          </span>
        </span>
        <span className="lp-bal-gas">
          <span>Gas per step</span>
          <span>0.002–0.004 BOT</span>
        </span>
      </div>
    ),
  },
  {
    title: "Create an order with the OpenLC demo supplier",
    body: "Tick the demo supplier and it confirms your order straight away.",
    visual: (
      <div className="lp-form">
        <span className="lp-field">
          <small>Supplier</small>
          <span>OpenLC demo supplier</span>
        </span>
        <span className="lp-check">
          <span className="lp-box">
            <Check size={12} strokeWidth={3} aria-hidden="true" />
          </span>
          Use the OpenLC demo supplier
        </span>
      </div>
    ),
  },
  {
    title: "Lock it on BOT Chain",
    body: "One signature moves your BOT into the escrow contract.",
    visual: (
      <div className="lp-chain">
        <span className="lp-chain-head">
          <span className="lp-live" /> On BOT Chain
        </span>
        <dl>
          <div>
            <dt>Status</dt>
            <dd>Open</dd>
          </div>
          <div>
            <dt>Locked</dt>
            <dd>1 BOT</dd>
          </div>
          <div>
            <dt>Escrow</dt>
            <dd>#3</dd>
          </div>
        </dl>
      </div>
    ),
  },
];

function TrySection() {
  return (
    <section id="try" className="lp-section lp-section--try" aria-labelledby="lp-try-title">
      <div className="lp-wrap">
        <motion.div
          className="lp-section-head"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={ONCE}
          transition={{ duration: 1, ease: EASE }}
        >
          <h2 id="lp-try-title" className="lp-h2">
            Try it in four steps
          </h2>
          <p className="lp-lede">One MetaMask wallet is all you need. It runs on BOT Chain testnet.</p>
        </motion.div>
        <ol className="lp-try-grid">
          {TRY_STEPS.map((step, index) => (
            <motion.li
              key={step.title}
              className="lp-card lp-try-card"
              initial={{ opacity: 0, y: 32, scale: 0.97 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 1, delay: index * 0.09, ease: EASE }}
            >
              <div className="lp-mini" aria-hidden="true">
                <span className="lp-step-no">0{index + 1}</span>
                {step.visual}
              </div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              {step.link && (
                <a className="lp-inline-link" href={step.link.href} target="_blank" rel="noreferrer">
                  {step.link.label} <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              )}
            </motion.li>
          ))}
        </ol>
        <motion.div
          className="lp-try-foot"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={ONCE}
          transition={{ duration: 1, delay: 0.2, ease: EASE }}
        >
          <p>
            The demo supplier confirms instantly and never ships, so you can reclaim the full amount after the
            delivery date.
          </p>
          <WalletEntry destination={TRY_DESTINATION}>Try it with one wallet</WalletEntry>
        </motion.div>
      </div>
    </section>
  );
}

function Signatures() {
  const stroke = "M6 52c10-26 22-34 30-22s-2 30 10 26 14-34 26-30 6 26 18 22 12-12 24-8";
  return (
    <svg className="lp-signatures" viewBox="0 0 280 96" aria-hidden="true">
      <motion.path
        d={stroke}
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true, amount: 0.8 }}
        transition={{ duration: 1.6, ease: EASE }}
      />
      <g transform="translate(280 0) scale(-1 1)">
        <motion.path
          d={stroke}
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, amount: 0.8 }}
          transition={{ duration: 1.6, delay: 0.25, ease: EASE }}
        />
      </g>
      <circle cx="140" cy="40" r="13" />
      <path className="lp-signatures-check" d="M134 40.5l4 4 8-9" />
      <text x="6" y="88">Buyer</text>
      <text x="274" y="88" textAnchor="end">
        Supplier
      </text>
    </svg>
  );
}

function TruthsSection() {
  const tile = (index: number) => ({
    initial: { opacity: 0, clipPath: "inset(0 0 18% 0 round 18px)", y: 16 },
    whileInView: { opacity: 1, clipPath: "inset(0 0 0% 0 round 18px)", y: 0 },
    viewport: { once: true, amount: 0.25 },
    transition: { duration: 1.1, delay: index * 0.07, ease: EASE },
  });

  return (
    <section id="truths" className="lp-section lp-section--truths" aria-labelledby="lp-truths-title">
      <div className="lp-wrap">
        <motion.div
          className="lp-section-head"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={ONCE}
          transition={{ duration: 1, ease: EASE }}
        >
          <h2 id="lp-truths-title" className="lp-h2">
            What stays true
          </h2>
          <p className="lp-lede">Enforced by the contract and the API, and checkable on the explorer.</p>
        </motion.div>

        <div className="lp-bento">
          <motion.article className="lp-card lp-tile lp-tile--contract" {...tile(0)}>
            <h3>No owner, no admin, no upgrade path.</h3>
            <p>
              The escrow contract has no owner, no admin, no upgrade path and no fee. The API never signs a
              transaction or holds funds.
            </p>
            <dl className="lp-spec">
              {["Owner", "Admin", "Upgrade path", "Fee"].map((key) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>None</dd>
                </div>
              ))}
            </dl>
            <div className="lp-tile-foot">
              <a
                className="lp-inline-link"
                href={`https://scan.bohr.life/address/${CONTRACT}`}
                target="_blank"
                rel="noreferrer"
              >
                Source-verified contract {CONTRACT.slice(0, 6)}…{CONTRACT.slice(-4)}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
              <span>41 contract tests</span>
            </div>
          </motion.article>

          <motion.article className="lp-card lp-tile lp-tile--verify" {...tile(1)}>
            <h3>Every step re-verified</h3>
            <p>
              Before a step counts, the API re-reads its transaction from BOT Chain and pins it to the wallet that
              signed it.
            </p>
          </motion.article>

          <motion.article className="lp-card lp-tile lp-tile--ai" {...tile(2)}>
            <h3>The AI can&apos;t move money</h3>
            <p>
              The mediator drafts a split and quotes the policy and the evidence word for word. It holds no key and
              signs nothing.
            </p>
          </motion.article>

          <motion.article className="lp-card lp-tile lp-tile--source" {...tile(3)}>
            <h3>Open source</h3>
            <p>Read the contract, the API and this site.</p>
            <a className="lp-inline-link" href={GITHUB} target="_blank" rel="noreferrer">
              github.com/zghanw/openlc <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </motion.article>

          <motion.article className="lp-card lp-tile lp-tile--sign" {...tile(4)}>
            <div className="lp-tile-text">
              <h3>Both parties sign the split</h3>
              <p>
                A mutual split pays out only when the buyer and the supplier have signed the same numbers. Without
                that, only the arbitrator named on the order can decide it.
              </p>
            </div>
            <Signatures />
          </motion.article>
        </div>
      </div>
    </section>
  );
}

function Close() {
  return (
    <section className="lp-close" aria-labelledby="lp-close-title">
      <span className="lp-close-beam" aria-hidden="true" />
      <motion.div
        className="lp-wrap lp-close-inner"
        initial={{ opacity: 0, scale: 0.96, filter: "blur(10px)" }}
        whileInView={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        viewport={ONCE}
        transition={{ duration: 1.3, ease: EASE }}
      >
        <h2 id="lp-close-title" className="lp-display lp-display--close">
          <span className="lp-display-line">Lock the payment.</span>
          <span className="lp-display-line">Ship on proof.</span>
        </h2>
        <div className="lp-actions">
          <WalletEntry destination={TRY_DESTINATION}>Try it with one wallet</WalletEntry>
          <a className="lp-pill lp-pill--ghost" href="#timeline">
            See how it works <ArrowDown size={16} aria-hidden="true" />
          </a>
        </div>
        <Consent />
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-wrap">
        <div className="lp-footer-top">
          <div className="lp-footer-brand">
            <Brand />
            <p>The open letter of credit.</p>
          </div>
          <nav aria-label="Legal and source">
            <a href="/legal/terms">Terms of Service</a>
            <a href="/legal/dispute-policy">Dispute Resolution Policy</a>
            <a href={GITHUB} target="_blank" rel="noreferrer">
              GitHub <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </nav>
        </div>
        <div className="lp-footer-chain">
          <BuiltOnBotChain />
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <MotionConfig reducedMotion="user">
      <div id="top" className="lp">
        <Header />
        <main>
          <Hero />
          <TimelineSection />
          <ClaimSection />
          <TrySection />
          <TruthsSection />
          <Close />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
