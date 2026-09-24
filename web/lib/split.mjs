// Exact wei arithmetic for a proposed split of a disputed amount, as plain JS so split.check.mjs
// runs it with bare node. The API accepts a split only when buyerUnits + supplierUnits equals the
// disputed units exactly, so neither share is ever rounded to cents or whole BOT.
import { formatBot, formatBotAmount, parseBot } from "./units.mjs";

/** The typed buyer share, as the text in the field -> { buyerUnits, supplierUnits } as wei
 *  strings, or { error } saying why it cannot be sent. The text itself is validated (a plain
 *  decimal, at most 6 decimals like the display, no sign or exponent) and never goes through
 *  Number, so "", "0.", "-1", "0,0005" and "1e21" are refused instead of read as 0 or crashing.
 *  The contract rejects a buyer refund above the requested refund, so that is refused too. */
export function splitUnits(disputedUnits, requestedUnits, text) {
  const value = String(text ?? "").trim();
  if (value === "") return { error: "Enter the amount that goes back to the buyer." };
  if (value.startsWith("-")) return { error: "The amount cannot be negative." };
  if (!/^\d+(\.\d{1,6})?$/.test(value)) return { error: "Enter a plain amount such as 0.0005, with at most 6 decimals." };
  let buyer;
  try {
    buyer = parseBot(value);
  } catch {
    return { error: "Enter a plain amount such as 0.0005, with at most 6 decimals." };
  }
  const disputed = BigInt(disputedUnits || "0");
  const requested = BigInt(requestedUnits || "0");
  if (buyer > disputed) return { error: `The buyer's share cannot be more than the ${formatBotAmount(formatBot(disputed))} BOT in dispute.` };
  if (buyer > requested) return { error: `The buyer asked for ${formatBotAmount(formatBot(requested))} BOT back. A split cannot refund more than that.` };
  return { buyerUnits: buyer.toString(), supplierUnits: (disputed - buyer).toString() };
}

/** A wei amount as field text, truncated to the 6 decimals the field accepts, e.g. for the
 *  default share or a counter's prefill: 333333333333333 -> "0.000333". Never above `units`. */
export function shareText(units) {
  const wei = BigInt(units || "0");
  return formatBot(wei - (wei % 10n ** 12n)).replace(/\.0$/, "");
}
