// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IProofVerifier {
    function verifyProof(bytes calldata proof, bytes calldata publicSignals) external view returns (bool);
}
