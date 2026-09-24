// Assert-based check for splitUnits, runnable without a browser: `node lib/split.check.mjs` from web/.
// The live mainnet claim (0.001 BOT disputed) was rejected when the form rounded a 0.0005 share.
import assert from "node:assert/strict";
import { shareText, splitUnits } from "./split.mjs";

const DISPUTED = "1000000000000000"; // 0.001 BOT
const REQUESTED = DISPUTED;
const sum = ({ buyerUnits, supplierUnits }) => BigInt(buyerUnits) + BigInt(supplierUnits);
const refused = (text, requested = REQUESTED) => assert.ok(splitUnits(DISPUTED, requested, text).error, `"${text}" must be refused`);

assert.deepEqual(splitUnits(DISPUTED, REQUESTED, "0.0005"), { buyerUnits: "500000000000000", supplierUnits: "500000000000000" }, "half of 0.001 splits evenly");
assert.deepEqual(splitUnits(DISPUTED, REQUESTED, "0"), { buyerUnits: "0", supplierUnits: DISPUTED }, "nothing back to the buyer: the supplier gets all of it");
assert.deepEqual(splitUnits(DISPUTED, REQUESTED, " 0.001 "), { buyerUnits: DISPUTED, supplierUnits: "0" }, "all of it back to the buyer, surrounding spaces ignored");
assert.deepEqual(splitUnits(DISPUTED, REQUESTED, "0.000333"), { buyerUnits: "333000000000000", supplierUnits: "667000000000000" }, "a 1/3-ish split");
assert.equal(sum(splitUnits(DISPUTED, REQUESTED, "0.000333")), BigInt(DISPUTED), "the shares sum to the disputed amount exactly");
assert.equal(sum(splitUnits("700000000000000000", "700000000000000000", "0.15")), 700000000000000000n, "a larger claim sums exactly too");

// The text is validated, never read through Number (which turned these into 0 or "1e+21").
for (const text of ["", "   ", "0.", ".5", "-0.0005", "-1", "0,0005", "1e21", "1e-4", "0x10", "abc", "0.0000001", "Infinity", "NaN"]) refused(text);
refused("0.002"); // above the disputed amount: refused, not clamped
refused("1000000000000000000000"); // 1e21 BOT written out: refused, no crash
refused("0.0006", "500000000000000"); // above the requested refund (the contract's _validateAllocation)
assert.ok(splitUnits(DISPUTED, "500000000000000", "0.0005").buyerUnits, "exactly the requested refund is allowed");
assert.match(splitUnits(DISPUTED, "500000000000000", "0.0006").error, /asked for 0\.0005 BOT/, "the reason names the requested refund");

assert.equal(shareText("500000000000000"), "0.0005", "the default share of a 0.001 request");
assert.equal(shareText("333333333333333"), "0.000333", "a prefill is truncated to the 6 decimals the field accepts");
assert.equal(shareText("1000000000000000000"), "1", "a whole amount has no trailing .0");
assert.equal(shareText("0"), "0");
assert.ok(splitUnits(DISPUTED, "333333333333333", shareText("333333333333333")).buyerUnits, "a truncated prefill is always a valid share");

console.log("split.check.mjs: all assertions passed");
