# Hướng Dẫn Testcase - Social Recovery E2EE + ZKP

## Tổng Quan
Tài liệu này hướng dẫn cách kiểm tra quy trình khôi phục xã hội với trao đổi bí mật E2EE và tính toán nullifier theo workflow ZKP.

---

## Chuẩn Bị

### Yêu cầu:
- **Mạng Blockchain:** Hardhat local hoặc testnet (Sepolia, Mumbai)
- **Ví MetaMask:** Ít nhất 4 tài khoản:
  - 1 Holder (ví X - thiết lập)
  - 1 Holder (ví Y - khôi phục)
  - 3 Guardians
- **Smart Contract:** Deploy `RecoveryContract.sol` và `MockVerifier.sol` (hoặc Verifier thật nếu có)
- **Browser:** Chrome/Firefox với MetaMask extension

### Khởi động môi trường:
```bash
# Terminal 1: Khởi động Hardhat node
npx hardhat node

# Terminal 2: Deploy contract
npx hardhat run scripts/deploy.js --network localhost

# Lưu lại địa chỉ RecoveryContract sau khi deploy
# Ví dụ: 0x5FbDB2315678afecb367f032d93F642f64180aa3
```

---

## GIAI ĐOẠN 1: THIẾT LẬP (Holder Ví X)

### Bước 1.1: Mở Holder (Ví X)
1. Mở trình duyệt: `file:///path/to/do_an/public/holder.html`
2. Kết nối MetaMask với **Ví X** (ví cũ)
3. Click **"Connect Wallet"**
4. Kiểm tra địa chỉ ví hiển thị chính xác

### Bước 1.2: Tạo Identity Key (Holder)
1. Trong panel **"Trao đổi bí mật E2EE"**
2. Click **"Tạo Holder Identity"**
3. Thấy badge hiển thị: `IK: <hex_prefix>...`
4. ✅ **Checkpoint:** Holder IK đã được tạo

### Bước 1.3: Mở Guardians (3 tabs/cửa sổ)
Mở 3 tab riêng biệt cho 3 Guardians:
- Tab 1: `file:///path/to/do_an/public/guardians.html` (Guardian 1)
- Tab 2: `file:///path/to/do_an/public/guardians.html` (Guardian 2)
- Tab 3: `file:///path/to/do_an/public/guardians.html` (Guardian 3)

Cho mỗi Guardian:
1. Kết nối MetaMask với **ví Guardian tương ứng**
2. Click **"Connect Wallet"**
3. ✅ **Checkpoint:** Địa chỉ Guardian hiển thị

### Bước 1.4: Trao đổi Bí mật (Lặp cho từng Guardian)

**Cho Guardian 1:**
1. Trong tab Guardian 1, panel **"Tạo PreKey Bundle & Handshake"**
2. Click **"Tạo PreKey Bundle"** → Bundle JSON hiển thị
3. Click **"Copy Bundle JSON"**
4. Quay lại tab Holder (Ví X)
5. Trong panel **"Trao đổi bí mật E2EE"**:
   - Nhập địa chỉ Guardian 1 vào **"Guardian Address"**
   - Paste Bundle JSON vào **"Guardian PreKey Bundle"**
6. Click **"Derive sharedSecret"**
7. Thấy **"Shared Secret"** và **"Commitment"** được điền tự động
8. Click **"Thêm vào danh sách"**
9. ✅ **Checkpoint:** Guardian 1 được thêm, danh sách commitments hiển thị 1 item

**Lặp lại bước trên cho Guardian 2 và Guardian 3**

10. ✅ **Checkpoint cuối:** Danh sách commitments hiển thị 3 items

### Bước 1.5: Lưu policyId và Commitments (Holder)
1. Trong panel **"Thiết lập khôi phục ví"**:
   - Nhập **"Label"**: `my_recovery_policy`
   - Nhập **"Threshold"**: `2` (cần 2/3 Guardian)
   - Nhập **"Tổng số Guardians"**: `3`
2. Click **"Export Commitments"** → File `commitments.json` được tải về
3. Mở file, copy nội dung (JSON array)
4. Paste vào ô **"Commitments (JSON array)"**
5. ✅ **Checkpoint:** 3 commitments hiển thị trong ô

### Bước 1.6: Tính policyId (Holder)
1. Click **"Tính policyId & merkleRoot"**
2. Thấy output:
   ```
   policyId=0x...
   merkleRoot=0x...
   count=3
   ```
3. ✅ **Checkpoint:** policyId và merkleRoot được tính

### Bước 1.7: Đăng ký Policy On-chain (Holder)
1. Nhập **"Contract Address"**: `0x5FbDB...` (địa chỉ RecoveryContract)
2. Click **"Đăng ký Policy"**
3. MetaMask popup → **Confirm transaction**
4. Đợi tx thành công
5. ✅ **Checkpoint:** Output hiển thị `Success tx=0x...`

### Bước 1.8: Cập nhật merkleRoot (Holder)
1. Nhập **"Batch ID"** (có thể để trống, sẽ tự tạo)
2. Click **"Cập nhật merkleRoot Batch"**
3. MetaMask popup → **Confirm**
4. Đợi tx thành công
5. ✅ **Checkpoint:** `RootUpdated tx=0x...`

### Bước 1.9: Chia sẻ Commitments với Guardian (Off-chain)
1. Holder copy danh sách commitments từ panel
2. Gửi cho tất cả Guardians qua **Telegram/Zalo/Email**
3. Gửi kèm **policyId**

**Cho mỗi Guardian:**
1. Nhận danh sách commitments và policyId từ Holder
2. Trong panel **"Merkle Path"**, paste commitments vào ô **"Danh sách commitments"**
3. Click **"Tính merklePath"**
4. Thấy output:
   ```json
   {
     "index": 0,
     "path": ["0x...", "0x..."],
     "root": "0x..."
   }
   ```
5. ✅ **Checkpoint:** Merkle path được tính và lưu

---

## GIAI ĐOẠN 2: KHÔI PHỤC (Holder Ví Y)

### Bước 2.1: Mở Holder (Ví Y - mới)
1. Mở trình duyệt mới (hoặc incognito): `file:///path/to/do_an/public/holder.html`
2. Kết nối MetaMask với **Ví Y** (ví mới)
3. Click **"Connect Wallet"**
4. ✅ **Checkpoint:** Địa chỉ ví Y hiển thị

### Bước 2.2: Tính recoveryRequestID (Holder Ví Y)
1. Scroll xuống panel **"Khôi phục ví (Ví mới)"**
2. Nhập:
   - **"policyId"**: Copy từ Ví X (hoặc từ blockchain event)
   - **"nonce"**: `123` (bất kỳ)
   - **"Địa chỉ chủ mới"**: Địa chỉ Ví Y
3. Click **"Tính recoveryRequestID"**
4. Thấy output: `recoveryRequestID=0x...`
5. ✅ **Checkpoint:** recoveryRequestID được tính

### Bước 2.3: Khởi phát Recovery On-chain (Holder Ví Y)
1. Nhập **"Contract Address"**: Địa chỉ RecoveryContract
2. Click **"Khởi phát Recovery"**
3. MetaMask popup → **Confirm**
4. Đợi tx thành công
5. ✅ **Checkpoint:** `Initiated. tx=0x...`

### Bước 2.4: Thông báo cho Guardians (Off-chain)
1. Holder (Ví Y) gửi cho tất cả Guardians:
   - **policyId**: `0x...`
   - **recoveryRequestID**: `0x...`
2. Guardians nhận thông tin

---

## GIAI ĐOẠN 3: GUARDIANS VOTE (ZKP)

### Bước 3.1: Tính Nullifier (Guardian 1)
1. Trong tab Guardian 1, panel **"Tính Nullifier (Helper ZKP)"**
2. Nhập **"recoveryRequestID"**: Paste từ Holder
3. Kiểm tra **"Shared Secret"** đã có (từ Giai đoạn 1)
4. Click **"Tính Nullifier"**
5. Thấy output:
   ```
   Nullifier: 0x...
   Copy giá trị này vào publicInputs. Ví dụ:
   ["0xnullifier","0xmerkleRoot"]
   ```
6. Click **"Copy Nullifier"**
7. ✅ **Checkpoint:** Nullifier được tính

### Bước 3.2: Nộp Phiếu On-chain (Guardian 1)
1. Scroll xuống panel **"Nộp Phiếu On-chain (ZKP)"**
2. Nhập:
   - **"RecoveryContract Address"**: `0x5FbDB...`
   - **"policyId"**: Paste từ Holder
   - **"recoveryRequestID"**: Paste từ Holder
   - **"Proof"**: `0x00` (mock proof cho demo, hoặc proof thật từ snarkjs)
   - **"publicInputs"**: Paste nullifier và root, ví dụ: `["0xnullifier","0xroot"]`
3. Click **"Submit Approval"**
4. MetaMask popup → **Confirm**
5. Đợi tx thành công
6. ✅ **Checkpoint:** `Success: 0x...`

### Bước 3.3: Lặp lại cho Guardian 2
- Thực hiện Bước 3.1 và 3.2 với **Guardian 2**
- ✅ **Checkpoint:** 2/3 Guardian đã vote

### Bước 3.4: (Tùy chọn) Guardian 3
- Nếu threshold = 2, không cần Guardian 3 vote
- Nếu muốn test threshold, lặp lại với Guardian 3

---

## GIAI ĐOẠN 4: HOÀN TẤT KHÔI PHỤC

### Bước 4.1: Finalize Recovery (Holder Ví Y)
1. Quay lại tab Holder (Ví Y)
2. Trong panel **"Khôi phục ví (Ví mới)"**
3. Kiểm tra đã nhập đủ:
   - **"policyId"**
   - **"nonce"**
   - **"Địa chỉ chủ mới"** (Ví Y)
   - **"Contract Address"**
4. Click **"Hoàn tất khôi phục"**
5. MetaMask popup → **Confirm**
6. Đợi tx thành công
7. ✅ **Checkpoint:** `Finalized. tx=0x...`

### Bước 4.2: Xác nhận On-chain
1. Kiểm tra blockchain:
   ```bash
   # Terminal 3
   npx hardhat console --network localhost
   ```
   ```javascript
   const Recovery = await ethers.getContractFactory("RecoveryContract");
   const rec = await Recovery.attach("0x5FbDB...");
   const owner = await rec.owner(policyId); // Giả sử có hàm owner()
   console.log("New Owner:", owner);
   // Kết quả: New Owner: <Ví Y address>
   ```
2. ✅ **Checkpoint:** Ví Y đã trở thành chủ sở hữu mới

---

## Testcase Scenarios

### ✅ TC1: Happy Path (2/3 Guardians)
- **Input:** 3 Guardians, threshold=2
- **Expected:** Recovery thành công sau 2 approval
- **Steps:** Theo GIAI ĐOẠN 1-4 như trên

### ✅ TC2: Nullifier Reuse (Chống Replay)
- **Input:** Guardian 1 vote 2 lần với cùng nullifier
- **Expected:** Lần 2 bị reject với lỗi "Nullifier used"
- **Steps:**
  1. Guardian 1 vote lần 1 (thành công)
  2. Guardian 1 vote lần 2 với cùng nullifier
  3. Contract revert với message "Nullifier used"

### ✅ TC3: Threshold Chưa Đủ
- **Input:** 3 Guardians, threshold=3, chỉ 2 Guardian vote
- **Expected:** `finalizeRecovery` bị reject
- **Steps:**
  1. Chỉ Guardian 1 và 2 vote
  2. Holder gọi `finalizeRecovery`
  3. Contract revert với message "Threshold not met"

### ✅ TC4: Merkle Path Sai
- **Input:** Guardian nhập sai commitment list
- **Expected:** Proof verification fail
- **Steps:**
  1. Guardian tính merklePath với list sai
  2. Submit approval với proof
  3. Contract revert (Verifier trả về false)

### ✅ TC5: E2EE Handshake
- **Input:** Holder và Guardian trao đổi bundle
- **Expected:** Cả hai derive được cùng sharedSecret
- **Steps:**
  1. Holder derive secret với Guardian bundle
  2. Guardian derive secret với Holder IK
  3. So sánh 2 secrets (ngoài UI, dùng console.log)
  4. Cả hai tính commitment, kết quả giống nhau

---

## Debug Tips

### Lỗi "Nullifier used"
- **Nguyên nhân:** Nullifier đã được sử dụng trước đó
- **Giải pháp:** Tạo recoveryRequestID mới (đổi nonce)

### Lỗi "Invalid proof"
- **Nguyên nhân:** Proof không hợp lệ hoặc publicInputs sai
- **Giải pháp:**
  - Kiểm tra nullifier tính đúng
  - Kiểm tra merkleRoot khớp với on-chain
  - Dùng MockVerifier (trả về true) để debug

### Lỗi "Threshold not met"
- **Nguyên nhân:** Chưa đủ số Guardian vote
- **Giải pháp:** Đợi thêm Guardian vote trước khi finalize

### Shared Secret không khớp
- **Nguyên nhân:** policyId khác nhau giữa Holder và Guardian
- **Giải pháp:** Đảm bảo cả hai dùng cùng policyId khi derive

---

## Tools Hỗ trợ

### Browser Console
Mở DevTools (F12) để xem log:
```javascript
// Trong holder.ts hoặc guardians.ts
console.log("Shared Secret:", sharedSecret);
console.log("Commitment:", commitment);
console.log("Nullifier:", nullifier);
```

### Hardhat Console
Kiểm tra state on-chain:
```javascript
const rec = await ethers.getContractAt("RecoveryContract", "0x5FbDB...");
const policy = await rec.policies(policyId);
console.log("Threshold:", policy.threshold);
console.log("MerkleRoot:", policy.merkleRoot);
const approvalCount = await rec.approvals(policyId, recoveryRequestID);
console.log("Approvals:", approvalCount);
```

### MetaMask
- Reset account nonce nếu gặp lỗi `nonce too low`
- Switch mạng đúng (localhost/testnet)

---

## Kết Luận
Hoàn thành toàn bộ testcase trên chứng tỏ hệ thống E2EE + ZKP social recovery đã hoạt động đúng theo workflow. Các bước tiếp theo:
- Tích hợp Poseidon hash thay keccak256
- Tích hợp snarkjs để tạo proof thật
- Deploy contract lên testnet
- Tối ưu UX (auto-fill, QR code)

## Liên Hệ
Nếu gặp vấn đề, tạo issue trên GitHub hoặc liên hệ team.
