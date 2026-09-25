"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowUpRight, Check, Clock3 } from "lucide-react";
import { NETWORKS } from "@/lib/chain";

// OLC-LAUNCH-002 is on mainnet whatever network this build targets.
const MAINNET_TX = `${NETWORKS[677].explorerBase}/tx/`;

const ATRADIUS =
  "https://group.atradius.com/dam/jcr:de5379ba-2ad5-415f-9c77-6e6c2669d13e/payment-practices-barometer-asia-2025-en.pdf";

type Step = {
  day: string;
  credit?: { title: string; body?: string; cite?: boolean };
  waiting?: string; // the credit lane between events: nothing has been paid
  escrow?: { title: string; body: string; paid: string; tx: string; txLabel: string };
  settled?: boolean;
};

const STEPS: Step[] = [
  {
    day: "Day 0",
    credit: { title: "Goods ship.", body: "The supplier is now lending to a stranger." },
    escrow: {
      title: "The buyer locks 0.001 BOT before anything ships.",
      body: "The 0.0001 BOT deposit pays the supplier in the same transaction.",
      paid: "0.0001 of 0.001 BOT paid",
      tx: "0x1e4573934e3e9277ccfdc1109b5246c2a7a9dc4fc578784ae0a771c42e73dc2b",
      txLabel: "Fund",
    },
  },
  {
    day: "Day 1",
    waiting: "No payment yet.",
    escrow: {
      title: "The supplier ships with a dispatch photo.",
      body: "Its fingerprint goes on chain and 0.0002 BOT releases.",
      paid: "0.0003 of 0.001 BOT paid",
      tx: "0x3d4b596827dc43216af8a49d85290f91f4958ef1e3e6e28c3ffba7cf4868eafe",
      txLabel: "Ship",
    },
  },
  {
    day: "Day 3",
    waiting: "Still no payment.",
    escrow: {
      title: "The buyer checks the delivery and accepts it.",
      body: "One transaction releases the remaining 0.0007 BOT to the supplier.",
      paid: "0.001 of 0.001 BOT paid",
      tx: "0xe2a27526580b03e1ae8c191c3ad9a5d0cbb2a5724ab6f56f62e1c1a874c2ff7c",
      txLabel: "Accept",
    },
  },
  {
    day: "Day 30",
    credit: { title: "The invoice is ageing.", body: "The supplier's cash is tied up in it." },
    settled: true,
  },
  { day: "Day 60", credit: { title: "Payment is due.", body: "Sixty days after the goods left." } },
  {
    day: "After 60",
    credit: {
      title: "Across Asia, 44% of B2B credit sales are paid late, and about 5% are never paid.",
      cite: true,
    },
  },
];

const SETTLED_AT = 3; // steps lit once Day 3 is reached

function shortHash(hash: string) {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

export function CreditTimeline() {
  const trackRef = useRef<HTMLDivElement>(null);
  const marks = useRef<number[]>([]);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start 55%", "end 55%"] });
  const trackHeight = useMotionValue(0);
  const lightY = useTransform(() => scrollYProgress.get() * trackHeight.get());
  const [lit, setLit] = useState(0);

  function update(progress: number) {
    const y = progress * trackHeight.get();
    setLit(marks.current.filter((mark) => y >= mark).length);
  }

  useMotionValueEvent(scrollYProgress, "change", update);

  // Where each day marker sits on the staff, so an entry lights exactly as the light reaches it.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const top = track.getBoundingClientRect().top;
      trackHeight.set(track.offsetHeight);
      marks.current = Array.from(track.querySelectorAll<HTMLElement>("[data-mark]")).map((mark) => {
        const box = mark.getBoundingClientRect();
        return box.top + box.height / 2 - top - 4;
      });
      update(scrollYProgress.get());
    };
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    measure();
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = reduceMotion ? STEPS.length : lit;
  const settled = shown >= SETTLED_AT;

  return (
    <div className="lp-timeline">
      <div className="lp-lanes" aria-hidden="true">
        <div className="lp-lane-head lp-lane-head--credit">
          <strong>On 60-day credit</strong>
          <span className="lp-state">Waiting to be paid</span>
        </div>
        <div className="lp-lane-head lp-lane-head--escrow">
          <strong>On OpenLC</strong>
          <span className="lp-state" data-on={settled || undefined}>
            {settled ? (
              <>
                <Check size={13} aria-hidden="true" /> Paid in full by Day 3
              </>
            ) : (
              "OLC-LAUNCH-002 · 0.001 BOT"
            )}
          </span>
        </div>
      </div>

      <div className="lp-track" ref={trackRef}>
        <div className="lp-staff" aria-hidden="true">
          <motion.span className="lp-staff-fill" style={{ scaleY: reduceMotion ? 1 : scrollYProgress }} />
          {!reduceMotion && <motion.span className="lp-staff-light" style={{ y: lightY }} />}
        </div>

        <ol className="lp-steps">
          {STEPS.map((step, index) => (
            <li key={step.day} className="lp-step" data-lit={index < shown || undefined}>
              <div className="lp-day" data-mark>
                <span>{step.day}</span>
              </div>

              <div className="lp-cell lp-cell--credit" data-empty={!(step.credit || step.waiting) || undefined}>
                {step.waiting && (
                  <p className="lp-entry-quiet">
                    <span className="lp-cell-lane">60-day credit: </span>
                    <Clock3 size={14} aria-hidden="true" /> {step.waiting}
                  </p>
                )}
                {step.credit && (
                  <div className="lp-entry-credit">
                    <span className="lp-cell-lane">60-day credit</span>
                    <p className="lp-cell-title">{step.credit.title}</p>
                    {step.credit.body && <p className="lp-cell-body">{step.credit.body}</p>}
                    {step.credit.cite && (
                      <a className="lp-cite" href={ATRADIUS} target="_blank" rel="noreferrer">
                        Atradius Payment Practices Barometer, Asia 2025 <ArrowUpRight size={13} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              <div className="lp-cell lp-cell--escrow" data-empty={!(step.escrow || step.settled) || undefined}>
                {step.escrow && (
                  <div className="lp-card lp-entry-escrow">
                    <span className="lp-cell-lane">OpenLC</span>
                    <p className="lp-cell-title">{step.escrow.title}</p>
                    <p className="lp-cell-body">{step.escrow.body}</p>
                    <div className="lp-entry-foot">
                      <span className="lp-paid">{step.escrow.paid}</span>
                      <a className="lp-tx" href={`${MAINNET_TX}${step.escrow.tx}`} target="_blank" rel="noreferrer">
                        {step.escrow.txLabel} on chain <span>{shortHash(step.escrow.tx)}</span>
                        <ArrowUpRight size={13} aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                )}
                {step.settled && (
                  <div className="lp-entry-settled">
                    <span className="lp-cell-lane">OpenLC</span>
                    <p>
                      <Check size={15} aria-hidden="true" /> Settled on Day 3. The supplier has every BOT of the order. Nothing owed, nothing to chase.
                    </p>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
