// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/Address.sol";

/// Test-only helper: a contract that can be told to accept or reject native
/// BOT, used as a buyer or supplier stand-in to exercise OpenLCEscrow's
/// capped-gas payout and pull-payment fallback. Not part of the deployed
/// product.
contract RevertingReceiver {
    using Address for address;

    bool public accepting;

    function setAccepting(bool value) external {
        accepting = value;
    }

    receive() external payable {
        require(accepting, "rejecting");
    }

    /// Forwards a call (with value) to `target` so this contract can act as
    /// the buyer or supplier on an OpenLCEscrow call; bubbles up reverts.
    function execute(address target, bytes calldata data) external payable returns (bytes memory) {
        return target.functionCallWithValue(data, msg.value);
    }
}
