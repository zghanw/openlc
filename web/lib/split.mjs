// Exact wei arithmetic for a proposed split of a disputed amount, as plain JS so split.check.mjs
// runs it with bare node. The API accepts a split only when buyerUnits + supplierUnits equals the
// disputed units exactly, so neither share is ever rounded to cents or whole BOT.
import { parseBotNumber } from "./units.mjs";

/** The typed buyer share (a BOT display number) -> { buyerUnits, supplierUnits } as wei strings.
 *  The buyer share is converted once, clamped to [0, disputed]; the supplier gets exactly the rest. */
export function splitUnits(disputedUnits, buyerValue) {
  const disputed = BigInt(disputedUnits);
  const typed = Number.isFinite(buyerValue) && buyerValue > 0 ? parseBotNumber(buyerValue) : 0n;
  const buyer = typed > disputed ? disputed : typed;
  return { buyerUnits: buyer.toString(), supplierUnits: (disputed - buyer).toString() };
}
