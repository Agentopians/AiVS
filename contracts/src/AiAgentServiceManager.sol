// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@eigenlayer/contracts/libraries/BytesLib.sol";
import "./IAiAgentTaskManager.sol";
import "@eigenlayer-middleware/src/ServiceManagerBase.sol";

/**
 * @title Primary entrypoint for procuring services from AiAgent.
 * @author Layr Labs, Inc.
 */
contract AiAgentServiceManager is ServiceManagerBase {
    using BytesLib for bytes;

    IAiAgentTaskManager
        public immutable AiAgentTaskManager;

    /// @notice when applied to a function, ensures that the function is only callable by the `registryCoordinator`.
    modifier onlyAiAgentTaskManager() {
        require(
            msg.sender == address(AiAgentTaskManager),
            "onlyAiAgentTaskManager: not from AI Agent task manager"
        );
        _;
    }

    constructor(
        IAVSDirectory _avsDirectory,
        IRegistryCoordinator _registryCoordinator,
        IStakeRegistry _stakeRegistry,
        IAiAgentTaskManager _AiAgentTaskManager
    )
        ServiceManagerBase(
            _avsDirectory,
            IPaymentCoordinator(address(0)), // TODO: look into this for handling payment by the user if we decide to have initial payment
            _registryCoordinator,
            _stakeRegistry
        )
    {
        AiAgentTaskManager = _AiAgentTaskManager;
    }

    /// @notice Called in the event of challenge resolution, in order to forward a call to the Slasher, which 'freezes' the `operator`.
    /// @dev The Slasher contract is under active development and its interface expected to change.
    ///      We recommend writing slashing logic without integrating with the Slasher at this point in time.
    function freezeOperator(
        address operatorAddr
    ) external onlyAiAgentTaskManager {
        // slasher.freezeOperator(operatorAddr);
    }
}
