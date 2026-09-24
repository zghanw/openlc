// Assert-based check for splitUnits, runnable without a browser: `node lib/split.check.mjs` from web/.
// The live mainnet claim (0.001 BOT disputed) was rejected when the form rounded a 0.0005 share.
import assert from "node:assert/strict";
import { splitUnits } from "./split.mjs";

const DISPUTED = "1000000000000000"; // 0.001 BOT
const sum = ({ buyerUnits, supplierUnits }) => BigInt(buyerUnits) + BigInt(supplierUnits);

assert.deepEqual(splitUnits(DISPUTED, 0.0005), { buyerUnits: "500000000000000", supplierUnits: "500000000000000" }, "half of 0.001 splits evenly");
assert.deepEqual(splitUnits(DISPUTED, 0), { buyerUnits: "0", supplierUnits: DISPUTED }, "nothing back to the buyer: the supplier gets all of it");
assert.deepEqual(splitUnits(DISPUTED, 0.002), { buyerUnits: DISPUTED, supplierUnits: "0" }, "a buyer share above the disputed amount is clamped");
assert.deepEqual(splitUnits(DISPUTED, -1), { buyerUnits: "0", supplierUnits: DISPUTED }, "a negative share is clamped to zero");
assert.deepEqual(splitUnits(DISPUTED, Number.NaN), { buyerUnits: "0", supplierUnits: DISPUTED }, "an empty field counts as zero");
const third = splitUnits(DISPUTED, 0.001 / 3);
assert.equal(sum(third), BigInt(DISPUTED), "a 1/3 split still sums to the disputed amount exactly");
assert.equal(third.buyerUnits, "333333000000000", "the typed share is converted once at 9 decimals");
assert.equal(sum(splitUnits("700000000000000000", 0.15)), 700000000000000000n, "a larger claim sums exactly too");

console.log("split.check.mjs: all assertions passed");
