// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/Address.sol";

/// Test-only helper: attempts to re-enter OpenLCEscrow from its own
/// receive(), used to prove the nonReentrant guards hold on every payout
/// path. Not part of the deployed product.
contract ReentrantReceiver {
    using Address for address;

    address public immutable escrow;
    bytes public reentryCall;
    bool public reentered;

    constructor(address escrowAddress) {
        escrow = escrowAddress;
    }

    function setReentryCall(bytes calldata data) external {
        reentryCall = data;
    }

    /// Attempts the configured call back into the escrow; never reverts,
    /// so a blocked reentrancy just leaves `reentered` false.
    receive() external payable {
        (bool ok,) = escrow.call(reentryCall);
        if (ok) reentered = true;
    }

    /// Forwards a call (with value) to `target` so this contract can act as
    /// the buyer or supplier on an OpenLCEscrow call; bubbles up reverts.
    function execute(address target, bytes calldata data) external payable returns (bytes memory) {
        return target.functionCallWithValue(data, msg.value);
    }
}
