// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// Escrow for a single native-BOT trade. Deliberation and evidence stay
/// off-chain. This contract holds funds, records shipment and evidence
/// fingerprints, pays undisputed value the moment the buyer records an
/// exception, and settles the disputed remainder once the designated parties
/// have approved the exact same allocation. Two deadline paths stop either
/// party from holding the other hostage: the buyer reclaims an escrow that
/// was never shipped, and the supplier claims an escrow the buyer never
/// inspected. A settled escrow is never deleted: its outcome stays on the
/// struct as the permanent receipt. For every escrow,
/// `totalAmount == releasedAmount + balance + settledBuyerRefund` holds
/// after every call. This is a line-for-line port of `payproof::escrow`
/// (Sui Move) onto BOT Chain; see the adaptation table in
/// docs/hackathon-build/spec.md for what changed and why. There is no owner,
/// admin, upgrade path or fee.
contract OpenLCEscrow is ReentrancyGuard {
    // -- Errors, one per Move abort code ------------------------------------
    error ZeroAmount();
    error InvalidOrderHash();
    error EmptyReference();
    error ReferenceTooLong();
    error InvalidParties();
    error InvalidState();
    error InvalidDispute();
    error Unauthorized();
    error AlreadyShipped();
    error InvalidAllocation();
    error ApprovalMismatch();
    error ApprovalRequired();
    error FundsNotReady();
    error InvalidProposalHash();
    error InvalidDeadline();
    error InvalidEvidenceHash();
    error DeadlineNotReached();
    error NotShipped();
    error InvalidReleasePlan();

    // -- EVM-only errors ------------------------------------------------------
    error UnknownEscrow();
    error NothingToWithdraw();
    error WithdrawFailed();

    enum Status {
        Open,
        Disputed,
        Settled
    }

    /// How a settlement came about.
    enum Mode {
        BuyerConfirmation,
        MutualApproval,
        Arbitrator,
        RefundUnshipped,
        ClaimUninspected
    }

    struct Escrow {
        address buyer;
        address supplier;
        address arbitrator;
        uint256 totalAmount;
        uint256 depositAmount;
        uint256 dispatchAmount;
        uint256 deliveryAmount;
        uint256 releasedAmount; // cumulative BOT released to the supplier: deposit, dispatch, undisputed value and settlement release
        uint256 balance; // BOT still held by this escrow
        uint256 disputedAmount;
        uint256 requestedBuyerRefund;
        uint256 approvedBuyerRefund;
        uint256 approvedSupplierRelease;
        bytes32 proposalHash;
        bytes32 orderHash;
        bytes32 dispatchEvidenceHash;
        string orderReference; // 1-128 bytes
        uint64 openedAt;
        uint64 deliveryDeadline; // the supplier must mark shipment by this time or the buyer may reclaim the escrow
        uint64 inspectionWindow; // how long after max(shippedAt, deliveryDeadline) the buyer has to act
        uint64 shippedAt;
        uint64 settledAt;
        Status status;
        Mode mode;
        bool shipped;
        bool undisputedReleased;
        bool buyerApproved;
        bool supplierApproved;
        bool arbitratorApproved;
        // mode, settledAt, settledBuyerRefund and settledSupplierRelease are meaningful only once status == Settled
        uint256 settledBuyerRefund;
        uint256 settledSupplierRelease;
    }

    event EscrowCreated(
        uint256 indexed id,
        address indexed buyer,
        address indexed supplier,
        address arbitrator,
        uint256 amount,
        bytes32 orderHash,
        string orderReference,
        uint64 deliveryDeadline,
        uint64 inspectionWindow,
        uint256 deposit,
        uint256 dispatch,
        uint256 delivery
    );
    event MilestoneReleased(
        uint256 indexed id,
        uint8 stage, // 1 deposit, 2 dispatch
        uint256 amount,
        uint256 cumulativeReleased,
        uint256 remaining,
        bytes32 evidenceHash
    );
    event Shipped(uint256 indexed id, address indexed supplier, bytes32 evidenceHash, uint256 releasedAmount, uint256 remainingAmount);
    event EvidenceAnchored(uint256 indexed id, address indexed party, uint8 kind, bytes32 evidenceHash);
    event DisputeOpened(uint256 indexed id, uint256 disputedAmount, uint256 requestedBuyerRefund);
    event UndisputedReleased(uint256 indexed id, address indexed supplier, uint256 amount);
    event SettlementApproved(uint256 indexed id, address indexed approver, uint256 buyerRefund, uint256 supplierRelease, bytes32 proposalHash);
    event SettlementExecuted(
        uint256 indexed id,
        address indexed buyer,
        address indexed supplier,
        uint256 buyerRefund,
        uint256 supplierRelease,
        bytes32 proposalHash,
        Mode mode
    );
    event PaymentDeferred(address indexed to, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    uint256 private constant MAX_REFERENCE_LENGTH = 128;
    /// Gas forwarded on the capped-gas payout push; see {_pay}.
    uint256 public constant PAYOUT_GAS = 50_000;

    mapping(uint256 => Escrow) private escrows;
    uint256 public escrowCount;
    /// Payouts a capped-gas push could not deliver, claimable via {withdraw}.
    mapping(address => uint256) public owed;

    function _escrow(uint256 id) internal view returns (Escrow storage) {
        if (id == 0 || id > escrowCount) revert UnknownEscrow();
        return escrows[id];
    }

    /// Deposits the whole payment into a new escrow. `depositAmount` pays the
    /// supplier immediately; `dispatchAmount` and `deliveryAmount` stay held
    /// (a 0/0/total plan means no milestones, just a single final release).
    function createEscrow(
        address supplier,
        address arbitrator,
        bytes32 orderHash,
        string calldata orderReference,
        uint256 depositAmount,
        uint256 dispatchAmount,
        uint256 deliveryAmount,
        uint64 deliveryDeadline,
        uint64 inspectionWindow
    ) external payable nonReentrant returns (uint256 id) {
        if (msg.value == 0) revert ZeroAmount();
        if (orderHash == bytes32(0)) revert InvalidOrderHash();
        uint256 refLength = bytes(orderReference).length;
        if (refLength == 0) revert EmptyReference();
        if (refLength > MAX_REFERENCE_LENGTH) revert ReferenceTooLong();
        address buyer = msg.sender;
        if (supplier == address(0) || arbitrator == address(0) || buyer == supplier || buyer == arbitrator || supplier == arbitrator) {
            revert InvalidParties();
        }
        if (deliveryDeadline <= block.timestamp || inspectionWindow == 0) revert InvalidDeadline();
        if (depositAmount + dispatchAmount + deliveryAmount != msg.value) revert InvalidReleasePlan();

        id = ++escrowCount;
        Escrow storage esc = escrows[id];
        esc.buyer = buyer;
        esc.supplier = supplier;
        esc.arbitrator = arbitrator;
        esc.totalAmount = msg.value;
        esc.depositAmount = depositAmount;
        esc.dispatchAmount = dispatchAmount;
        esc.deliveryAmount = deliveryAmount;
        esc.releasedAmount = depositAmount;
        esc.balance = msg.value - depositAmount;
        esc.orderHash = orderHash;
        esc.orderReference = orderReference;
        esc.openedAt = uint64(block.timestamp);
        esc.deliveryDeadline = deliveryDeadline;
        esc.inspectionWindow = inspectionWindow;
        esc.status = Status.Open;

        emit EscrowCreated(
            id, buyer, supplier, arbitrator, msg.value, orderHash, orderReference, deliveryDeadline, inspectionWindow, depositAmount, dispatchAmount, deliveryAmount
        );
        if (depositAmount > 0) {
            emit MilestoneReleased(id, 1, depositAmount, depositAmount, esc.balance, bytes32(0));
        }
        _pay(supplier, depositAmount);
    }

    /// Supplier records dispatch evidence and receives the agreed dispatch
    /// payment in the same transaction. From here the buyer can no longer
    /// reclaim the escrow as unshipped, and the inspection window starts.
    function markShipped(uint256 id, bytes32 evidenceHash) external nonReentrant {
        Escrow storage esc = _escrow(id);
        if (msg.sender != esc.supplier) revert Unauthorized();
        if (esc.status != Status.Open) revert InvalidState();
        if (esc.shipped) revert AlreadyShipped();
        if (evidenceHash == bytes32(0)) revert InvalidEvidenceHash();
        if (esc.balance != esc.dispatchAmount + esc.deliveryAmount) revert FundsNotReady();

        uint256 amount = esc.dispatchAmount;
        esc.shipped = true;
        esc.shippedAt = uint64(block.timestamp);
        esc.dispatchEvidenceHash = evidenceHash;
        esc.releasedAmount += amount;
        esc.balance -= amount;

        emit Shipped(id, esc.supplier, evidenceHash, amount, esc.balance);
        emit MilestoneReleased(id, 2, amount, esc.releasedAmount, esc.balance, evidenceHash);
        _pay(esc.supplier, amount);
    }

    /// Either party binds a document fingerprint to the escrow. The file
    /// stays off-chain; substituting it later no longer matches this hash.
    function anchorEvidence(uint256 id, uint8 kind, bytes32 evidenceHash) external {
        Escrow storage esc = _escrow(id);
        address party = msg.sender;
        if (party != esc.buyer && party != esc.supplier) revert Unauthorized();
        if (esc.status == Status.Settled) revert InvalidState();
        if (evidenceHash == bytes32(0)) revert InvalidEvidenceHash();
        emit EvidenceAnchored(id, party, kind, evidenceHash);
    }

    /// Buyer records an exception. Only the disputed portion stays locked:
    /// the undisputed balance is paid to the supplier in this same
    /// transaction. Does not require shipment.
    function openDispute(uint256 id, uint256 disputedAmount, uint256 requestedBuyerRefund) external nonReentrant {
        Escrow storage esc = _escrow(id);
        if (msg.sender != esc.buyer) revert Unauthorized();
        if (esc.status != Status.Open) revert InvalidState();
        uint256 remaining = esc.balance;
        if (disputedAmount == 0 || disputedAmount > remaining) revert InvalidDispute();
        if (requestedBuyerRefund > disputedAmount) revert InvalidDispute();

        esc.disputedAmount = disputedAmount;
        esc.requestedBuyerRefund = requestedBuyerRefund;
        esc.status = Status.Disputed;
        emit DisputeOpened(id, disputedAmount, requestedBuyerRefund);

        uint256 undisputed = remaining - disputedAmount;
        esc.undisputedReleased = true;
        esc.balance = disputedAmount;
        esc.releasedAmount += undisputed;
        emit UndisputedReleased(id, esc.supplier, undisputed);
        _pay(esc.supplier, undisputed);
    }

    /// Validates the allocation shared by all three approval roles.
    function _validateAllocation(Escrow storage esc, uint256 buyerRefund, uint256 supplierRelease, bytes32 proposalHash) private view {
        if (proposalHash == bytes32(0)) revert InvalidProposalHash();
        if (buyerRefund > esc.requestedBuyerRefund) revert InvalidAllocation();
        if (buyerRefund + supplierRelease != esc.disputedAmount) revert InvalidAllocation();
    }

    /// Buyer, supplier or arbitrator signs the exact allocation and proposal
    /// hash for a disputed escrow (role decided by `msg.sender`). A buyer or
    /// supplier approval must match an approval already recorded by the
    /// other party or by the arbitrator; the arbitrator's approval always
    /// overrides and needs no match.
    function approveSettlement(uint256 id, uint256 buyerRefund, uint256 supplierRelease, bytes32 proposalHash) external nonReentrant {
        Escrow storage esc = _escrow(id);
        bool isArbitrator = msg.sender == esc.arbitrator;
        bool isBuyer = msg.sender == esc.buyer;
        bool isSupplier = msg.sender == esc.supplier;
        if (!isArbitrator && !isBuyer && !isSupplier) revert Unauthorized();

        if (esc.status != Status.Disputed) revert InvalidState();
        _validateAllocation(esc, buyerRefund, supplierRelease, proposalHash);

        if (isArbitrator) {
            esc.arbitratorApproved = true;
        } else if (isBuyer) {
            if (esc.supplierApproved || esc.arbitratorApproved) {
                if (esc.approvedBuyerRefund != buyerRefund || esc.approvedSupplierRelease != supplierRelease || esc.proposalHash != proposalHash) {
                    revert ApprovalMismatch();
                }
            }
            esc.buyerApproved = true;
        } else {
            if (esc.buyerApproved || esc.arbitratorApproved) {
                if (esc.approvedBuyerRefund != buyerRefund || esc.approvedSupplierRelease != supplierRelease || esc.proposalHash != proposalHash) {
                    revert ApprovalMismatch();
                }
            }
            esc.supplierApproved = true;
        }

        esc.approvedBuyerRefund = buyerRefund;
        esc.approvedSupplierRelease = supplierRelease;
        esc.proposalHash = proposalHash;
        emit SettlementApproved(id, msg.sender, buyerRefund, supplierRelease, proposalHash);
    }

    /// Executes a mutual- or arbitrator-approved settlement. Callable by
    /// anyone once approval is in place.
    function executeSettlement(uint256 id) external nonReentrant {
        Escrow storage esc = _escrow(id);
        if (esc.status != Status.Disputed) revert InvalidState();
        if (!esc.undisputedReleased) revert FundsNotReady();
        if (!(esc.arbitratorApproved || (esc.buyerApproved && esc.supplierApproved))) revert ApprovalRequired();
        if (esc.balance != esc.disputedAmount) revert FundsNotReady();

        Mode mode = esc.arbitratorApproved ? Mode.Arbitrator : Mode.MutualApproval;
        _settle(id, esc, esc.approvedBuyerRefund, esc.approvedSupplierRelease, mode);
    }

    /// Non-disputed buyer confirmation releases the complete escrow to the
    /// supplier. Does not require shipment.
    function releaseFull(uint256 id) external nonReentrant {
        Escrow storage esc = _escrow(id);
        if (msg.sender != esc.buyer) revert Unauthorized();
        if (esc.status != Status.Open) revert InvalidState();
        _settle(id, esc, 0, esc.balance, Mode.BuyerConfirmation);
    }

    /// The supplier never marked shipment and the delivery deadline has
    /// passed: the buyer takes the whole escrow back without anyone else's
    /// signature.
    function refundUnshipped(uint256 id) external nonReentrant {
        Escrow storage esc = _escrow(id);
        if (msg.sender != esc.buyer) revert Unauthorized();
        if (esc.status != Status.Open) revert InvalidState();
        if (esc.shipped) revert AlreadyShipped();
        if (block.timestamp <= esc.deliveryDeadline) revert DeadlineNotReached();
        _settle(id, esc, esc.balance, 0, Mode.RefundUnshipped);
    }

    /// The goods were shipped and the buyer neither accepted nor disputed
    /// within the inspection window: the supplier claims the whole escrow.
    function claimUninspected(uint256 id) external nonReentrant {
        Escrow storage esc = _escrow(id);
        if (msg.sender != esc.supplier) revert Unauthorized();
        if (esc.status != Status.Open) revert InvalidState();
        if (!esc.shipped) revert NotShipped();
        if (block.timestamp <= inspectionClosesAt(id)) revert DeadlineNotReached();
        _settle(id, esc, 0, esc.balance, Mode.ClaimUninspected);
    }

    /// Pays out the remaining balance and marks the escrow Settled. The
    /// outcome (mode, split, timestamp) stays on the struct as the
    /// permanent receipt; a Settled escrow is terminal.
    function _settle(uint256 id, Escrow storage esc, uint256 buyerRefund, uint256 supplierRelease, Mode mode) private {
        if (buyerRefund + supplierRelease != esc.balance) revert FundsNotReady();

        esc.status = Status.Settled;
        esc.mode = mode;
        esc.settledAt = uint64(block.timestamp);
        esc.settledBuyerRefund = buyerRefund;
        esc.settledSupplierRelease = supplierRelease;
        esc.releasedAmount += supplierRelease;
        esc.balance = 0;

        emit SettlementExecuted(id, esc.buyer, esc.supplier, buyerRefund, supplierRelease, esc.proposalHash, mode);

        _pay(esc.buyer, buyerRefund);
        _pay(esc.supplier, supplierRelease);
    }

    /// Pushes `amount` to `to` on a capped gas stipend so a hostile
    /// recipient cannot block the caller; a failed push is credited to
    /// {owed} instead of reverting the whole transaction.
    function _pay(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok,) = payable(to).call{value: amount, gas: PAYOUT_GAS}("");
        if (!ok) {
            owed[to] += amount;
            emit PaymentDeferred(to, amount);
        }
    }

    /// Claims any payout this address could not receive via {_pay}.
    function withdraw() external nonReentrant {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        owed[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(msg.sender, amount);
    }

    function getEscrow(uint256 id) external view returns (Escrow memory) {
        return _escrow(id);
    }

    /// The later of shipment and the agreed delivery deadline, plus the
    /// inspection window, computed in uint256.
    function inspectionClosesAt(uint256 id) public view returns (uint256) {
        Escrow storage esc = _escrow(id);
        uint256 shippedAt = esc.shippedAt;
        uint256 deliveryDeadline = esc.deliveryDeadline;
        uint256 start = shippedAt > deliveryDeadline ? shippedAt : deliveryDeadline;
        return start + esc.inspectionWindow;
    }
}
