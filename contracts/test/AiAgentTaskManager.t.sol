// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import "../src/AiAgentServiceManager.sol" as aiagentsm;
import {AiAgentTaskManager} from "../src/AiAgentTaskManager.sol";
import {BLSMockAVSDeployer} from "@eigenlayer-middleware/test/utils/BLSMockAVSDeployer.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract AiAgentTaskManagerTest is BLSMockAVSDeployer {
    aiagentsm.AiAgentServiceManager sm;
    aiagentsm.AiAgentServiceManager smImplementation;
    AiAgentTaskManager tm;
    AiAgentTaskManager tmImplementation;

    uint32 public constant TASK_RESPONSE_WINDOW_BLOCK = 300;
    address aggregator =
        address(uint160(uint256(keccak256(abi.encodePacked("aggregator")))));
    address generator =
        address(uint160(uint256(keccak256(abi.encodePacked("generator")))));

    function setUp() public {
        _setUpBLSMockAVSDeployer();

        tmImplementation = new AiAgentTaskManager(
            aiagentsm.IRegistryCoordinator(address(registryCoordinator)),
            TASK_RESPONSE_WINDOW_BLOCK
        );

        // Third, upgrade the proxy contracts to use the correct implementation contracts and initialize them.
        tm = AiAgentTaskManager(
            address(
                new TransparentUpgradeableProxy(
                    address(tmImplementation),
                    address(proxyAdmin),
                    abi.encodeWithSelector(
                        tm.initialize.selector,
                        pauserRegistry,
                        registryCoordinatorOwner,
                        aggregator,
                        generator
                    )
                )
            )
        );
    }

    function testCreateNewTask() public {
        bytes memory quorumNumbers = new bytes(0);
        cheats.prank(generator, generator);
        tm.createNewTask("https://test.com/case.json", 100, quorumNumbers);
        assertEq(tm.latestTaskNum(), 1);
    }
}
