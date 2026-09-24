"use client";

import { useRef } from "react";
import { useInView } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { explorerTxUrl } from "@/lib/chain";

const SPLIT_TX = "0xc745bfad13f06f90b18d5b8e46c3eed66389f9bd020f27c7ca22f607ef418699";
const SETTLE_TX = "0x5584e24933f4d613980589f42ea2d9a3ed9a01a0893bd9e7f5b5ba05e15599fa";

function TxLink({ hash, children }: { hash: string; children: string }) {
  return (
    <a className="lp-tx" href={explorerTxUrl(hash)} target="_blank" rel="noreferrer">
      {children} <span>{`${hash.slice(0, 6)}…${hash.slice(-4)}`}</span>
      <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  );
}

/** The real OLC-LAUNCH-001 claim: 0.0035 BOT held for delivery splits into 0.0025 paid and 0.001 held. */
export function PartialClaim() {
  const splitRef = useRef<HTMLDivElement>(null);
  const split = useInView(splitRef, { once: true, amount: 0.9 });

  return (
    <div className="lp-card lp-claim-card">
      <div className="lp-claim-order">
        <strong>OLC-LAUNCH-001</strong>
        <span>0.005 BOT order</span>
      </div>
      <div className="lp-context" aria-hidden="true">
        <i className="is-paid" style={{ flexGrow: 1 }} />
        <i className="is-paid" style={{ flexGrow: 2 }} />
        <i className="is-held" style={{ flexGrow: 7 }} />
      </div>
      <p className="lp-context-note">
        <span>0.0015 BOT already paid</span>
        <span>0.0035 BOT held for delivery</span>
      </p>

      <div ref={splitRef} className="lp-split" data-split={split || undefined}>
        <div className="lp-split-bar" aria-hidden="true">
          <span className="lp-seg lp-seg--held" />
          <span className="lp-seg lp-seg--paid" />
          <span className="lp-split-whole">0.0035 BOT held for delivery</span>
        </div>
        <div className="lp-split-legend">
          <p className="lp-legend-held">
            <strong>0.001 BOT</strong> held in escrow
          </p>
          <p className="lp-legend-paid">
            <strong>0.0025 BOT</strong> paid to the supplier
          </p>
        </div>
      </div>

      <div className="lp-claim-row">
        <p>
          <strong>One transaction</strong> did both.
        </p>
        <TxLink hash={SPLIT_TX}>Claim</TxLink>
      </div>
      <div className="lp-claim-row lp-claim-row--settle">
        <p>
          <strong>Both parties signed the same split.</strong> 0.001 BOT refunded.
        </p>
        <TxLink hash={SETTLE_TX}>Settle</TxLink>
      </div>
    </div>
  );
}
