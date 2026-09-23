// Pure port of the two BOT Chain deadline paths in contracts/OpenLCEscrow.sol - refundUnshipped
// (buyer) and claimUninspected (supplier) - so the same rule that would make the contract accept
// the call is what decides whether DeadlineControls (web/app/components/order-actions.tsx) shows
// the Reclaim/Claim button. No React, no aliased imports: this file and its check,
// deadline-action.check.mjs, run under plain Node - see that file for `node <it>`.

/** The slice of getEscrow/inspectionClosesAt this decision needs. Seconds, as the contract stores
 *  them (never milliseconds - callers convert once at the chain-call boundary, same as elsewhere). */
export type DeadlineChainState = {
  /** OpenLCEscrow.Status: Open=0, Disputed=1, Settled=2. */
  status: number;
  shipped: boolean;
  deliveryDeadline: number;
  inspectionClosesAt: number;
};

export type DeadlineRole = "BUYER" | "SUPPLIER";

const STATUS_OPEN = 0;

/**
 * Mirrors exactly:
 *   refundUnshipped:   msg.sender == buyer,    status Open, !shipped, block.timestamp > deliveryDeadline
 *   claimUninspected:  msg.sender == supplier, status Open,  shipped, block.timestamp > inspectionClosesAt(id)
 */
export function deadlineAction(chain: DeadlineChainState, role: DeadlineRole, nowSeconds: number): "reclaim" | "claim" | null {
  if (chain.status !== STATUS_OPEN) return null;
  if (role === "BUYER") return !chain.shipped && nowSeconds > chain.deliveryDeadline ? "reclaim" : null;
  if (role === "SUPPLIER") return chain.shipped && nowSeconds > chain.inspectionClosesAt ? "claim" : null;
  return null;
}
