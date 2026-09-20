# Build ledger: docs/hackathon-build/plan.md

Merge base: c87129d (kickoff, spec, plan). Commits stay local until Hao Wen says "push" (github.com/zghanw/openlc is public).

Task 1: complete (commits ee7ca8d..5cff1e3). Review found 3 issues (env example described the future, dotfiles skipped, renamed defaults); fixed in 1 round, re-review clean. Baseline: backend 103 tests pass, backend + web build.
Task 2: complete (commits d46dfe7..b6a7832). Review: no critical issues; fixed in 1 round: restored Move conservation check in _settle, auth-first approveSettlement, cumulative releasedAmount (invariant total == released + balance + settledBuyerRefund), /types/ ignored. Re-review clean.
Task 3: complete (commits d183420..6ea6815). 41 tests pass: 15 Move-parity + validation + approvals + exact deadline boundaries + terminal state + hostile receiver + reentrancy + invariants. Review found 2 critical blind spots (reentrancy test insensitive to the guard; inspection-window rule tested tautologically); both fixed and proven by mutation testing (removing nonReentrant, and breaking max(shippedAt, deliveryDeadline), each fail a named test). Written by the orchestrator after the subagent hit the session limit.
