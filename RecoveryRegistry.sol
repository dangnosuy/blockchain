// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IVerifier
 * @dev Đây là interface cho Verifier Contract (sẽ được snarkjs sinh ra).
 * Nó chỉ có một hàm duy nhất để xác thực proof.
 */
interface IVerifier {
    function verifyProof(
        bytes calldata _proof,
        uint256[] calldata _publicInputs
    ) external view returns (bool);
}

/**
 * @title RecoveryContract
 * @dev Contract này quản lý toàn bộ logic khôi phục xã hội ZKP.
 */
contract RecoveryContract {
    // --- State ---
    IVerifier public immutable verifier;

    struct Policy {
        uint256 threshold;        // approvals needed
        uint256 totalGuardians;   // declared total (for off-chain checks)
        bytes32 merkleRoot;       // latest aggregated guardian commitments root
        bool registered;
    }
    mapping(bytes32 => Policy) public policies;            // policyId => Policy
    mapping(bytes32 => address) public ownerOf;             // policyId => original owner (Holder X)
    mapping(bytes32 => bytes32) public activeRecoveryRequests; // policyId => recoveryRequestID (if any)

    struct RecoveryRequest {
        address newOwner;         // candidate new owner (Holder Y)
        uint256 approvalCount;    // number of valid ZKP approvals
    }
    mapping(bytes32 => RecoveryRequest) public recoveryRequests; // recoveryRequestID => struct

    mapping(bytes32 => bool) public usedNullifiers; // nullifier => used?

    // --- Events ---
    event PolicyRegistered(bytes32 indexed policyId, uint256 threshold, uint256 totalGuardians, address indexed owner);
    event RootUpdated(bytes32 indexed policyId, bytes32 merkleRoot, bytes32 indexed batchId);
    event RecoveryInitiated(bytes32 indexed policyId, bytes32 indexed recoveryRequestID, address newOwner);
    event ApprovalSubmitted(bytes32 indexed policyId, bytes32 indexed recoveryRequestID, bytes32 nullifier);
    event RecoveryFinalized(bytes32 indexed policyId, address oldOwner, address newOwner);

    constructor(address _verifier) {
        verifier = IVerifier(_verifier);
    }

    // Step 1: register policy without root (root can come later via batches)
    function registerPolicy(bytes32 policyId, uint256 threshold, uint256 totalGuardians) external {
        require(!policies[policyId].registered, "Policy exists");
        require(threshold > 0 && threshold <= totalGuardians, "Bad threshold");
        require(ownerOf[policyId] == address(0), "Owned");
        policies[policyId] = Policy({
            threshold: threshold,
            totalGuardians: totalGuardians,
            merkleRoot: bytes32(0),
            registered: true
        });
        ownerOf[policyId] = msg.sender;
        emit PolicyRegistered(policyId, threshold, totalGuardians, msg.sender);
    }

    // Step 3: aggregator updates root via batch commit
    function registerCommitmentBatch(bytes32 policyId, bytes32 merkleRoot, bytes32 batchId) external {
        Policy storage p = policies[policyId];
        require(p.registered, "Policy missing");
        // For demo allow only owner to update. Production: dedicated aggregator role / stake.
        require(ownerOf[policyId] == msg.sender, "Not owner");
        p.merkleRoot = merkleRoot;
        emit RootUpdated(policyId, merkleRoot, batchId);
    }

    // Step 5: initiate recovery with candidate newOwner (Y)
    function initiateRecovery(bytes32 policyId, bytes32 recoveryRequestID, address newOwner) external {
        Policy storage p = policies[policyId];
        require(p.registered, "Policy missing");
        require(activeRecoveryRequests[policyId] == bytes32(0), "Active");
        require(newOwner != address(0), "Bad newOwner");
        activeRecoveryRequests[policyId] = recoveryRequestID;
        recoveryRequests[recoveryRequestID] = RecoveryRequest({ newOwner: newOwner, approvalCount: 0 });
        emit RecoveryInitiated(policyId, recoveryRequestID, newOwner);
    }

    // Step 7: guardian submits ZKP approval
    // publicInputs layout assumption (example): [nullifier, merkleRoot, policyId, newOwner]
    function submitApproval(bytes32 policyId, bytes32 recoveryRequestID, bytes calldata proof, uint256[] calldata publicInputs) external {
        require(activeRecoveryRequests[policyId] == recoveryRequestID, "No active");
        require(publicInputs.length >= 2, "Bad inputs");
        bytes32 nullifier = bytes32(publicInputs[0]);
        bytes32 merkleRoot = bytes32(publicInputs[1]);
        Policy storage p = policies[policyId];
        require(p.merkleRoot == merkleRoot, "Root mismatch");
        require(!usedNullifiers[nullifier], "Nullifier used");
        require(verifier.verifyProof(proof, publicInputs), "Invalid proof");
        usedNullifiers[nullifier] = true;
        recoveryRequests[recoveryRequestID].approvalCount += 1;
        emit ApprovalSubmitted(policyId, recoveryRequestID, nullifier);
    }

    // Step 8: finalize if threshold met
    function finalizeRecovery(bytes32 policyId, bytes32 recoveryRequestID) external {
        require(activeRecoveryRequests[policyId] == recoveryRequestID, "No active");
        RecoveryRequest storage rq = recoveryRequests[recoveryRequestID];
        Policy storage p = policies[policyId];
        require(rq.approvalCount >= p.threshold, "Threshold not met");
        address oldOwner = ownerOf[policyId];
        ownerOf[policyId] = rq.newOwner;
        activeRecoveryRequests[policyId] = bytes32(0);
        emit RecoveryFinalized(policyId, oldOwner, rq.newOwner);
    }
}