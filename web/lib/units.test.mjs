// Unit check for the money helpers, runnable without a browser: `node --test lib/units.test.mjs`
// from web/, or `node --test web/lib/units.test.mjs` from the repo root.
//
// Imports the real implementation (units.mjs, plain JS so this needs no TypeScript loader).
// web/lib/chain.ts re-exports formatBot/parseBot from this same module unchanged, so this
// exercises exactly what the app calls - a regression here would be caught, not masked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBot, formatBotAmount, parseBot, parseBotNumber } from "./units.mjs";

const DECIMALS = 18;

test("parseBot converts a decimal BOT amount to wei exactly", () => {
  assert.equal(parseBot("1.2"), 1200000000000000000n);
});

test("formatBot round-trips parseBot exactly for everyday amounts", () => {
  // ethers always prints at least one decimal place (30000 -> "30000.0"), so a whole number's
  // string form gains a harmless ".0" - compare numeric value, which is what "exact" means here.
  for (const value of ["1.2", "0.1", "30000", "3900.5", "1"]) {
    assert.equal(Number(formatBot(parseBot(value))), Number(value));
  }
  // Values that already have a fractional part round-trip byte-for-byte.
  for (const value of ["1.2", "0.1", "3900.5"]) {
    assert.equal(formatBot(parseBot(value)), value);
  }
});

test("a value using all 18 decimal places survives the round trip intact", () => {
  const value = "123456789.123456789012345678";
  assert.equal(parseBot(value), 123456789123456789012345678n);
  assert.equal(formatBot(parseBot(value)), value);
});

test("the smallest unit (1 wei) survives the round trip intact", () => {
  const value = "0.000000000000000001";
  assert.equal(parseBot(value), 1n);
  assert.equal(formatBot(1n), value);
});

test("never loses precision the way Math.round(value * 10 ** 18) would", () => {
  // Number(value) * 10 ** 18 for this input exceeds Number.MAX_SAFE_INTEGER and would round
  // to the wrong integer; parseUnits does exact decimal-string arithmetic instead.
  const value = "1.100000000000000001";
  assert.equal(parseBot(value), 1100000000000000001n);
  assert.notEqual(Math.round(Number(value) * 10 ** DECIMALS), Number(1100000000000000001n));
});

test("parseBotNumber rounds float noise out of a display number before exact parseUnits", () => {
  // 3 * 0.15 as a JS float is 0.44999999999999996, not 0.45.
  assert.equal(parseBotNumber(3 * 0.15), 450000000000000000n);
  // Accumulating several line totals drifts the other way: 0.4500000000000002.
  assert.equal(parseBotNumber(3 - (7 * 0.15 + 5 * 0.2 + 10 * 0.05)), 450000000000000000n);
  assert.equal(parseBotNumber(1.2), 1200000000000000000n);
  // String(5e-7) is "5e-7", which parseUnits rejects outright.
  assert.equal(parseBotNumber(5e-7), 500000000000n);
  assert.equal(parseBotNumber(0), 0n);
});

test("formatBotAmount shows sub-cent amounts exactly and drops trailing zeros", () => {
  assert.equal(formatBotAmount(0.001), "0.001");
  assert.equal(formatBotAmount(0.005), "0.005");
  assert.equal(formatBotAmount(0.0005), "0.0005");
  assert.equal(formatBotAmount(3), "3");
  assert.equal(formatBotAmount(2.1), "2.1");
  assert.equal(formatBotAmount(1234.5), "1,234.5");
  // formatBot's exact string form reads the same, including a whole number's ".0".
  assert.equal(formatBotAmount(formatBot(parseBot("0.0035"))), "0.0035");
  assert.equal(formatBotAmount(formatBot(parseBot("30000"))), "30,000");
});

test("formatBotAmount truncates, so an amount never shows more than it is", () => {
  assert.equal(formatBotAmount("0.0000019"), "0.000001");
  assert.equal(formatBotAmount(formatBot(333333333333333n)), "0.000333");
  assert.equal(formatBotAmount(formatBot(parseBot("0.99999999"))), "0.999999");
  assert.equal(formatBotAmount(0.0000019), "0.000001");
  // Float noise is still fixed before truncating: 3 * 0.15 is 0.44999999999999996.
  assert.equal(formatBotAmount(3 * 0.15), "0.45");
});

test("formatBotAmount shows a non-zero amount below 0.000001 as <0.000001, and zero as 0", () => {
  assert.equal(formatBotAmount(formatBot(1n)), "<0.000001");
  assert.equal(formatBotAmount(0.0000005), "<0.000001");
  assert.equal(formatBotAmount(0), "0");
  assert.equal(formatBotAmount(formatBot(0n)), "0");
  assert.equal(formatBotAmount("0.000001"), "0.000001");
});
