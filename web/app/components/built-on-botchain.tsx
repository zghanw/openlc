import { BOTCHAIN, ESCROW_ADDRESS, escrowConfigured, explorerAddressUrl } from "@/lib/chain";
import { ExternalLink } from "lucide-react";

export function BuiltOnBotChain() {
  return (
    <span className="built-on-botchain">
      Built on{" "}
      <a href="https://botchain.ai" target="_blank" rel="noreferrer">
        BOT Chain <ExternalLink size={12} aria-hidden="true" />
      </a>
      {" · "}
      <a href={BOTCHAIN.explorerBase} target="_blank" rel="noreferrer">
        {BOTCHAIN.chainName} Explorer <ExternalLink size={12} aria-hidden="true" />
      </a>
      {escrowConfigured && (
        <>
          {" · "}
          <a href={explorerAddressUrl(ESCROW_ADDRESS)} target="_blank" rel="noreferrer">
            Escrow contract <ExternalLink size={12} aria-hidden="true" />
          </a>
        </>
      )}
    </span>
  );
}
