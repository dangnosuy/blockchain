# PowerShell script to run snarkjs Groth16 setup and export verifier
# Run from repository root (F:\NT547\ZKSRP\blockchain)

param(
    [string]$ptau = "artifacts\powersOfTau28_hez_final_15.ptau"
)

if (-not (Test-Path .\artifacts)) { New-Item -ItemType Directory -Path .\artifacts | Out-Null }
if (-not (Test-Path .\artifacts\guardian)) { New-Item -ItemType Directory -Path .\artifacts\guardian | Out-Null }

Write-Host "Using ptau: $ptau"

Write-Host "1) Running groth16 setup..."
npx snarkjs groth16 setup circuits\guardian_approval.r1cs $ptau artifacts\guardian\guardian_approval_0000.zkey

Write-Host "2) Contribute entropy (dev)..."
npx snarkjs zkey contribute artifacts\guardian\guardian_approval_0000.zkey artifacts\guardian\guardian_approval_final.zkey --name="dev contribution" -v

Write-Host "3) Export verification key..."
npx snarkjs zkey export verificationkey artifacts\guardian\guardian_approval_final.zkey artifacts\guardian\verification_key.json

Write-Host "4) Export solidity verifier to contract/GuardianVerifier.sol"
npx snarkjs zkey export solidityverifier artifacts\guardian\guardian_approval_final.zkey contract\GuardianVerifier.sol

Write-Host "Done. Artifacts are in ./artifacts/guardian and contract/GuardianVerifier.sol"
