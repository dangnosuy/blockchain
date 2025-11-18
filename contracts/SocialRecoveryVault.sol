// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IProofVerifier.sol";

contract SocialRecoveryVault {
    struct RecoveryPolicy {
        address owner;
        address recoveryController;
        address aggregator;
        uint8 threshold;
        uint8 totalGuardians;
        bytes32 merkleRoot;
        uint64 merkleVersion;
        bool exists;
    }

    struct PublicInputs {
        bytes32 policyId;
        bytes32 recoveryRequestId;
        bytes32 merkleRoot;
        bytes32 nullifier;
        address newOwner;
    }

    struct RecoveryState {
        address newOwner;
        uint64 approvals;
        bool active;
        bool finalized;
    }

    IProofVerifier public verifier;
    address public contractOwner;

    mapping(bytes32 => RecoveryPolicy) private policies;
    mapping(bytes32 => bytes32) private activeRecovery;
    mapping(bytes32 => mapping(bytes32 => RecoveryState)) private recoveryStates;
    mapping(bytes32 => bool) private usedNullifier;

    event PolicyRegistered(bytes32 indexed policyId, address indexed owner, uint8 threshold, uint8 totalGuardians, address aggregator);
    event PolicyUpdated(bytes32 indexed policyId, address indexed aggregator, address indexed recoveryController);
    event VerifierUpdated(address indexed newVerifier);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RootUpdated(bytes32 indexed policyId, bytes32 indexed merkleRoot, uint64 batchId, address indexed updater);
    event RecoveryInitiated(bytes32 indexed policyId, bytes32 indexed recoveryRequestId, address indexed newOwner);
    event ApprovalAccepted(bytes32 indexed policyId, bytes32 indexed recoveryRequestId, bytes32 nullifier, address indexed submitter);
    event RecoveryFinalized(bytes32 indexed policyId, bytes32 indexed recoveryRequestId, address indexed newOwner);

    modifier policyExists(bytes32 policyId) {
        require(policies[policyId].exists, "SRV: policy missing");
        _;
    }

    modifier onlyPolicyOwner(bytes32 policyId) {
        require(policies[policyId].owner == msg.sender, "SRV: not policy owner");
        _;
    }

    modifier onlyContractOwner() {
        require(contractOwner == msg.sender, "SRV: not owner");
        _;
    }

    constructor(address verifierAddress) {
        verifier = IProofVerifier(verifierAddress);
        contractOwner = msg.sender;
    }

    function setVerifier(address newVerifier) external onlyContractOwner {
        require(newVerifier != address(0), "SRV: invalid verifier");
        verifier = IProofVerifier(newVerifier);
        emit VerifierUpdated(newVerifier);
    }

    function transferOwnership(address newOwner) external onlyContractOwner {
        require(newOwner != address(0), "SRV: zero owner");
        address previous = contractOwner;
        contractOwner = newOwner;
        emit OwnershipTransferred(previous, newOwner);
    }

    function registerPolicy(
        bytes32 policyId,
        address recoveryController,
        address aggregator,
        uint8 threshold,
        uint8 totalGuardians
    ) external {
        require(!policies[policyId].exists, "SRV: policy exists");
        require(recoveryController != address(0), "SRV: controller required");
        require(totalGuardians > 0, "SRV: guardians required");
        require(threshold > 0 && threshold <= totalGuardians, "SRV: invalid threshold");

        policies[policyId] = RecoveryPolicy({
            owner: msg.sender,
            recoveryController: recoveryController,
            aggregator: aggregator,
            threshold: threshold,
            totalGuardians: totalGuardians,
            merkleRoot: bytes32(0),
            merkleVersion: 0,
            exists: true
        });

        emit PolicyRegistered(policyId, msg.sender, threshold, totalGuardians, aggregator);
    }

    function updatePolicyControllers(bytes32 policyId, address newAggregator, address newController)
        external
        onlyPolicyOwner(policyId)
    {
        if (newAggregator != address(0)) {
            policies[policyId].aggregator = newAggregator;
        }
        if (newController != address(0)) {
            policies[policyId].recoveryController = newController;
        }
        emit PolicyUpdated(policyId, policies[policyId].aggregator, policies[policyId].recoveryController);
    }

    function policyInfo(bytes32 policyId)
        external
        view
        policyExists(policyId)
        returns (
            address owner,
            address recoveryController,
            address aggregator,
            uint8 threshold,
            uint8 totalGuardians,
            bytes32 merkleRoot,
            uint64 merkleVersion,
            bytes32 activeRequestId
        )
    {
        RecoveryPolicy storage policy = policies[policyId];
        owner = policy.owner;
        recoveryController = policy.recoveryController;
        aggregator = policy.aggregator;
        threshold = policy.threshold;
        totalGuardians = policy.totalGuardians;
        merkleRoot = policy.merkleRoot;
        merkleVersion = policy.merkleVersion;
        activeRequestId = activeRecovery[policyId];
    }

    function registerCommitmentBatch(bytes32 policyId, bytes32 newRoot, uint64 batchId)
        external
        policyExists(policyId)
    {
        require(newRoot != bytes32(0), "SRV: root required");
        RecoveryPolicy storage policy = policies[policyId];
        require(msg.sender == policy.aggregator || msg.sender == policy.owner, "SRV: unauthorized updater");

        policy.merkleRoot = newRoot;
        policy.merkleVersion += 1;

        emit RootUpdated(policyId, newRoot, batchId, msg.sender);
    }

    function initiateRecovery(bytes32 policyId, bytes32 recoveryRequestId, address newOwner)
        external
        policyExists(policyId)
    {
        require(newOwner != address(0), "SRV: new owner required");
        RecoveryPolicy storage policy = policies[policyId];
        require(
            msg.sender == policy.owner || msg.sender == policy.recoveryController,
            "SRV: unauthorized initiator"
        );
        require(policy.merkleRoot != bytes32(0), "SRV: merkle root missing");
        require(activeRecovery[policyId] == bytes32(0), "SRV: recovery active");

        RecoveryState storage state = recoveryStates[policyId][recoveryRequestId];
        require(!state.active && !state.finalized, "SRV: request used");

        state.newOwner = newOwner;
        state.approvals = 0;
        state.active = true;
        state.finalized = false;
        activeRecovery[policyId] = recoveryRequestId;

        emit RecoveryInitiated(policyId, recoveryRequestId, newOwner);
    }

    function submitApproval(
        bytes32 policyId,
        bytes32 recoveryRequestId,
        bytes calldata proof,
        PublicInputs calldata publicInputs
    ) external policyExists(policyId) {
        RecoveryPolicy storage policy = policies[policyId];
        require(policy.merkleRoot != bytes32(0), "SRV: merkle root missing");
        require(activeRecovery[policyId] == recoveryRequestId, "SRV: inactive request");

        require(publicInputs.policyId == policyId, "SRV: policy mismatch");
        require(publicInputs.recoveryRequestId == recoveryRequestId, "SRV: request mismatch");
        require(publicInputs.merkleRoot == policy.merkleRoot, "SRV: root mismatch");
        require(publicInputs.newOwner != address(0), "SRV: zero new owner");

        require(!usedNullifier[publicInputs.nullifier], "SRV: nullifier used");
        require(address(verifier) != address(0), "SRV: verifier unset");
        bool ok = verifier.verifyProof(proof, abi.encode(publicInputs));
        require(ok, "SRV: invalid proof");

        usedNullifier[publicInputs.nullifier] = true;

        RecoveryState storage state = recoveryStates[policyId][recoveryRequestId];
        require(state.active, "SRV: state inactive");
        require(state.newOwner == publicInputs.newOwner, "SRV: new owner mismatch");

        state.approvals += 1;

        emit ApprovalAccepted(policyId, recoveryRequestId, publicInputs.nullifier, msg.sender);
    }

    function finalizeRecovery(bytes32 policyId, bytes32 recoveryRequestId)
        external
        policyExists(policyId)
    {
        RecoveryPolicy storage policy = policies[policyId];
        RecoveryState storage state = recoveryStates[policyId][recoveryRequestId];

        require(state.active, "SRV: recovery not active");
        require(state.approvals >= policy.threshold, "SRV: threshold not met");

        policy.owner = state.newOwner;
        policy.recoveryController = state.newOwner;
        state.active = false;
        state.finalized = true;
        activeRecovery[policyId] = bytes32(0);

        emit RecoveryFinalized(policyId, recoveryRequestId, state.newOwner);
    }

    function approvalsOf(bytes32 policyId, bytes32 recoveryRequestId)
        external
        view
        returns (uint64 approvalsCount, bool isActive, bool isFinalized, address proposedOwner)
    {
        RecoveryState storage state = recoveryStates[policyId][recoveryRequestId];
        approvalsCount = state.approvals;
        isActive = state.active;
        isFinalized = state.finalized;
        proposedOwner = state.newOwner;
    }

    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return usedNullifier[nullifier];
    }
}
