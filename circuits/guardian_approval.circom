pragma circom 2.0.0;

// Use circomlib's SMT (sparse merkle tree) verifier and Poseidon
include "../node_modules/circomlib/circuits/smt/smtverifier.circom";
include "../node_modules/circomlib/circuits/smt/smthash_poseidon.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

template GuardianApproval(nLevels) {
    // Private inputs from guardian
    signal input guardian_address; // used as key
    signal input shared_secret;    // used as value
    // Merkle SMT siblings (public/private depending on design)
    signal input siblings[nLevels];
    // Public inputs
    signal input policy_id;
    signal input recovery_request_id;
    signal input merkle_root;
    signal input new_owner;

    // Outputs (public signals order matters)
    signal output out_policy_id;
    signal output out_recovery_request_id;
    signal output out_merkle_root;
    signal output out_nullifier;
    signal output out_new_owner;

    // Compute nullifier = Poseidon(shared_secret, recovery_request_id)
    component nullifierHash = Poseidon(2);
    nullifierHash.inputs[0] <== shared_secret;
    nullifierHash.inputs[1] <== recovery_request_id;

    // Use SMTVerifier to check inclusion of (guardian_address, shared_secret) in root
    component smt = SMTVerifier(nLevels);
    smt.enabled <== 1;
    smt.root <== merkle_root;
    for (var i = 0; i < nLevels; i++) {
        smt.siblings[i] <== siblings[i];
    }
    // no old entry
    smt.oldKey <== 0;
    smt.oldValue <== 0;
    smt.isOld0 <== 1;
    // provide key & value
    smt.key <== guardian_address;
    smt.value <== shared_secret;
    smt.fnc <== 0; // verify inclusion

    out_policy_id <== policy_id;
    out_recovery_request_id <== recovery_request_id;
    out_merkle_root <== merkle_root;
    out_nullifier <== nullifierHash.out;
    out_new_owner <== new_owner;
}

component main = GuardianApproval(32);
