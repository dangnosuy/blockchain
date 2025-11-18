# Guardian Approval Circuit

Circuit `guardian_approval.circom` chứng minh rằng một guardian với `guardian_address` và `shared_secret` nằm trong Merkle tree (root = `out_merkle_root`) và rằng `nullifier = Poseidon(shared_secret, recovery_request_id)`.

## Cài đặt phụ thuộc

```powershell
cd f:\NT547\ZKSRP\blockchain
npm install circomlib snarkjs
```

## Build circuit

```powershell
$env:CIRCUIT="guardian_approval"
cd circuits
circom "$env:CIRCUIT.circom" --r1cs --wasm --sym --c
```

- Kết quả: `guardian_approval.r1cs`, `guardian_approval_js/`, `guardian_approval.c`.

## Thiết lập zkey (Groth16)

```powershell
cd f:\NT547\ZKSRP\blockchain
mkdir -Force artifacts\guardian
snarkjs groth16 setup circuits\guardian_approval.r1cs powersOfTau28_hez_final_15.ptau artifacts\guardian\guardian_approval_0000.zkey
snarkjs zkey contribute artifacts\guardian\guardian_approval_0000.zkey artifacts\guardian\guardian_approval_final.zkey
snarkjs zkey export verificationkey artifacts\guardian\guardian_approval_final.zkey artifacts\guardian\verification_key.json
```

> Thay `powersOfTau28_hez_final_15.ptau` bằng ptau phù hợp; có thể tải từ https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_15.ptau.

## Sinh verifier Solidity

```powershell
snarkjs zkey export solidityverifier artifacts\guardian\guardian_approval_final.zkey contracts\GuardianVerifier.sol
```

File `contracts\GuardianVerifier.sol` là Groth16 verifier chuẩn. Giữ lại cho bước adapter.

## Tạo witness/proof mẫu

```powershell
# Chuẩn bị input JSON
node circuits\guardian_approval_js\generate_witness.js circuits\guardian_approval_js\guardian_approval.wasm input.json artifacts\guardian\witness.wtns
snarkjs groth16 prove artifacts\guardian\guardian_approval_final.zkey artifacts\guardian\witness.wtns artifacts\guardian\proof.json artifacts\guardian\public.json
```

`public.json` phải trả về 5 phần tử theo thứ tự: `policy_id`, `recovery_request_id`, `merkle_root`, `nullifier`, `new_owner`.

## Adapter ABI (tùy chọn)

Sau khi có `GuardianVerifier.sol`, dùng `snarkjs zkey export soliditycalldata` để lấy calldata mẫu:

```powershell
snarkjs zkey export soliditycalldata artifacts\guardian\proof.json artifacts\guardian\public.json
```

Chuỗi trả về gồm `[a, b, c, input]`. Lưu lại để dùng trong adapter Solidity tương thích với interface `IProofVerifier`.
