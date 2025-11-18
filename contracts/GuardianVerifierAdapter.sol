// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IProofVerifier.sol";

interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata input
    ) external view returns (bool);
}

contract GuardianVerifierAdapter is IProofVerifier {
    IGroth16Verifier public immutable grothVerifier;

    struct PublicInputs {
        bytes32 policyId;
        bytes32 recoveryRequestId;
        bytes32 merkleRoot;
        bytes32 nullifier;
        address newOwner;
    }

    constructor(address verifierAddress) {
        require(verifierAddress != address(0), "Adapter: verifier zero");
        grothVerifier = IGroth16Verifier(verifierAddress);
    }

    function verifyProof(bytes calldata proof, bytes calldata publicSignals) external view override returns (bool) {
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c) =
            abi.decode(proof, (uint256[2], uint256[2][2], uint256[2]));

        PublicInputs memory inputs = abi.decode(publicSignals, (PublicInputs));

        uint256[] memory flattened = new uint256[](5);
        flattened[0] = uint256(inputs.policyId);
        flattened[1] = uint256(inputs.recoveryRequestId);
        flattened[2] = uint256(inputs.merkleRoot);
        flattened[3] = uint256(inputs.nullifier);
        flattened[4] = uint256(uint160(inputs.newOwner));

        return grothVerifier.verifyProof(a, b, c, flattened);
    }
}
