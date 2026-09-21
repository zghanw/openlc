// Unit check for the money helpers, runnable without a browser: `node --test lib/units.test.mjs`
// from web/, or `node --test web/lib/units.test.mjs` from the repo root.
//
// Imports the real implementation (units.mjs, plain JS so this needs no TypeScript loader).
// web/lib/chain.ts re-exports formatBot/parseBot from this same module unchanged, so this
// exercises exactly what the app calls - a regression here would be caught, not masked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBot, parseBot } from "./units.mjs";

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
