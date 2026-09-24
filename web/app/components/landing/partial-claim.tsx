"use client";

import { useRef } from "react";
import { useInView } from "motion/react";
import { ArrowUpRight } from "lucide-react";

const TESTNET_TX = "https://scan.bohr.life/tx/";
const SPLIT_TX = "0x8a72ab5e9f79100ee522063024443288a8bba20f23c634aa2a78667c6060f97a";
const SETTLE_TX = "0xb57dc85208eee87e171db06dbcecc370ad310d382c9af0101ae014d6fe220e61";

function TxLink({ hash, children }: { hash: string; children: string }) {
  return (
    <a className="lp-tx" href={`${TESTNET_TX}${hash}`} target="_blank" rel="noreferrer">
      {children} <span>{`${hash.slice(0, 6)}…${hash.slice(-4)}`}</span>
      <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  );
}

/** The real PO-97139111 claim: 0.7 BOT held for delivery splits into 0.55 paid and 0.15 held. */
export function PartialClaim() {
  const splitRef = useRef<HTMLDivElement>(null);
  const split = useInView(splitRef, { once: true, amount: 0.9 });

  return (
    <div className="lp-card lp-claim-card">
      <div className="lp-claim-order">
        <strong>PO-97139111</strong>
        <span>1 BOT order</span>
      </div>
      <div className="lp-context" aria-hidden="true">
        <i className="is-paid" style={{ flexGrow: 1 }} />
        <i className="is-paid" style={{ flexGrow: 2 }} />
        <i className="is-held" style={{ flexGrow: 7 }} />
      </div>
      <p className="lp-context-note">
        <span>0.3 BOT already paid</span>
        <span>0.7 BOT held for delivery</span>
      </p>

      <div ref={splitRef} className="lp-split" data-split={split || undefined}>
        <div className="lp-split-bar" aria-hidden="true">
          <span className="lp-seg lp-seg--held" />
          <span className="lp-seg lp-seg--paid" />
          <span className="lp-split-whole">0.7 BOT held for delivery</span>
        </div>
        <div className="lp-split-legend">
          <p className="lp-legend-held">
            <strong>0.15 BOT</strong> held in escrow
          </p>
          <p className="lp-legend-paid">
            <strong>0.55 BOT</strong> paid to the supplier
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
          <strong>Both parties signed the same split.</strong> 0.15 BOT refunded.
        </p>
        <TxLink hash={SETTLE_TX}>Settle</TxLink>
      </div>
    </div>
  );
}
