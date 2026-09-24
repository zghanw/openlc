// The exact decimal-string <-> wei math for native BOT (18 decimals), as plain JS so
// web/lib/units.test.mjs can exercise the real implementation with a bare `node --test`,
// no TypeScript loader. web/lib/chain.ts re-exports these two functions unchanged.
//
// Never do `Math.round(value * 10 ** 18)`: it silently loses precision past about 15
// significant digits. ethers' parseUnits/formatUnits do exact decimal-string math instead.
import { formatUnits, parseUnits } from "ethers";

/** Wei (or any BigNumberish) -> an exact decimal string, e.g. 1200000000000000000n -> "1.2". */
export function formatBot(wei) {
  return formatUnits(wei, 18);
}

/** An exact decimal string -> wei, e.g. "1.2" -> 1200000000000000000n. Never float math. */
export function parseBot(decimal) {
  return parseUnits(decimal, 18);
}

/** A display number (JS float) -> wei. Float maths on prices leaves noise such as
 *  3 * 0.15 = 0.44999999999999996; rounding to 9 decimals first removes it without changing any
 *  amount the UI can express (prices have 2 decimals), and avoids "5e-7" exponent strings. */
export function parseBotNumber(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Not a BOT amount: ${value}`);
  return parseBot(value.toFixed(9));
}

const BOT_DISPLAY = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6, roundingMode: "trunc" });

/** A BOT amount for display: up to 6 decimals, truncated (a balance never shows more than it
 *  is), no trailing zeros, thousands grouped, e.g. 0.005 -> "0.005", 1234.5 -> "1,234.5", and
 *  "<0.000001" for a non-zero amount below the last shown digit. Takes a number, or formatBot's
 *  exact decimal string (Intl formats a string as an exact decimal). Display only: never parse
 *  this back into an amount. */
export function formatBotAmount(value) {
  const amount = Number(value);
  if (amount > 0 && amount < 0.000001) return "<0.000001";
  // ponytail: a number is float maths (3 * 0.15 = 0.44999999999999996); fix it at 9 decimals,
  // as parseBotNumber does, before truncating, or 0.45 would show as 0.449999.
  return BOT_DISPLAY.format(typeof value === "number" ? value.toFixed(9) : value);
}
