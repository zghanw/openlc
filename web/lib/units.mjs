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
