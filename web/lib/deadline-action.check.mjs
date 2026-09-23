// Assert-based check for deadlineAction, runnable without a browser or the web app's TS config:
//   node web/lib/deadline-action.check.mjs      (from the repo root)
//   node deadline-action.check.mjs              (from web/lib)
// Mirrors the contract rules in contracts/OpenLCEscrow.sol's refundUnshipped / claimUninspected -
// see the comment on deadlineAction itself in ./deadline-action.ts.
import assert from "node:assert/strict";
import { deadlineAction } from "./deadline-action.ts";

const OPEN = 0, DISPUTED = 1, SETTLED = 2;
const base = { status: OPEN, shipped: false, deliveryDeadline: 1000, inspectionClosesAt: 2000 };

// Buyer reclaim: only after the deadline, and only while unshipped.
assert.equal(deadlineAction(base, "BUYER", 999), null, "before the deadline, buyer gets nothing");
assert.equal(deadlineAction(base, "BUYER", 1000), null, "at the deadline exactly, buyer gets nothing (contract needs strictly after)");
assert.equal(deadlineAction(base, "BUYER", 1001), "reclaim", "past the deadline, unshipped, buyer can reclaim");
assert.equal(deadlineAction({ ...base, shipped: true }, "BUYER", 1001), null, "shipped blocks reclaim even past the deadline");

// Supplier claim: only after the inspection window closes, and only once shipped.
assert.equal(deadlineAction({ ...base, shipped: true }, "SUPPLIER", 1999), null, "before inspection closes, supplier gets nothing");
assert.equal(deadlineAction({ ...base, shipped: true }, "SUPPLIER", 2001), "claim", "past inspection close, shipped, supplier can claim");
assert.equal(deadlineAction(base, "SUPPLIER", 2001), null, "not shipped blocks claim even past inspection close");

// Any non-Open status blocks both paths outright.
for (const status of [DISPUTED, SETTLED]) {
  assert.equal(deadlineAction({ ...base, status }, "BUYER", 1001), null, `status ${status} blocks reclaim`);
  assert.equal(deadlineAction({ ...base, status, shipped: true }, "SUPPLIER", 2001), null, `status ${status} blocks claim`);
}

// The wrong role for a path never gets it, even when every other condition is met.
assert.equal(deadlineAction({ ...base, shipped: true }, "BUYER", 2001), null, "buyer never gets the supplier's claim path");
assert.equal(deadlineAction(base, "SUPPLIER", 1001), null, "supplier never gets the buyer's reclaim path before shipment");
assert.equal(deadlineAction({ ...base, shipped: true }, "ARBITRATOR", 2001), null, "an unrecognised role gets nothing");

console.log("deadline-action.check.mjs: all assertions passed");
