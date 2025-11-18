// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IVerifier {
    function verifyProof(bytes calldata _proof, uint256[] calldata _publicInputs) external view returns (bool);
}

contract MockVerifier is IVerifier {
    bool public result;
    constructor(bool _result) { result = _result; }
    function setResult(bool _r) external { result = _r; }
    function verifyProof(bytes calldata, uint256[] calldata) external view returns (bool) { return result; }
}
