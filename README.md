## 🔎 Hướng dẫn nhập liệu: Holder & Guardian

Tài liệu này giải thích “người dùng cần nhập gì và để làm gì” trong 2 giao diện: `public/holder.html` (Holder) và `public/guardian.html` (Guardian). Mục tiêu là dễ hiểu, thao tác nhanh và ít sai định dạng.

Bạn chỉ cần mở file HTML trực tiếp trong trình duyệt (hoặc serve tĩnh). Đảm bảo đã chạy build trước.

```bash
npm install
npm run build
# (tuỳ chọn) chạy relay WebSocket thử nghiệm
npm run dev:relay
```

Gợi ý: Mặc định relay là `ws://localhost:8099` (có thể thay trong ô nhập).

---

## Holder (public/holder.html)

Holder là ví của bạn: lưu VC, ký VP, thiết lập kênh E2EE với Guardians, gửi “Recovery Request”, và đăng ký chính sách khôi phục on-chain.

### 1) Kết nối ví
- Nút “Connect Wallet”
	- Mục đích: Kết nối MetaMask/EIP-1193 để ký dữ liệu, gọi smart contract.
	- Kết quả: Hiển thị địa chỉ ví rút gọn và chain hiện tại.

### 2) Import VC (JSON)
- Ô “Import VC (JSON)” + nút “Lưu VC”
	- Nhập: Nội dung JSON của Verifiable Credential do Issuer cấp.
	- Mục đích: Lưu VC ở localStorage, hỗ trợ chọn claim (nếu là VC Merkle) và dùng khi ký VP.
	- Ghi chú: VC có `merkle.salts` và `proof.merkleRoot` sẽ cho phép chọn lọc claim.

### 3) VP Metadata (tùy chọn)
- Audience: Chuỗi đích (ví dụ DID, URL của Verifier). Mục đích: ràng buộc đối tượng nhận VP.
- Nonce: Chuỗi ngẫu nhiên để chống replay. Mục đích: mỗi VP là duy nhất.
- Expiry: ISO datetime. Mục đích: hạn sử dụng của VP.
- Nút “Ký VP”: Ký EIP-712 dựa trên vcRoots và metadata ở trên. Kết quả in ở “VP Output”.

### 4) Thiết lập kênh E2EE với Guardians
- Relay ws://… (id: `relayUrlHolder`)
	- Nhập: URL WebSocket của relay demo. Ví dụ `ws://localhost:8099`.
	- Mục đích: Vận chuyển tự động bundle/envelope giữa Holder và Guardians.
- Nút “Connect Relay”
	- Mục đích: Đăng ký Holder tại relay (theo địa chỉ ví), chờ nhận PreKey Bundle từ Guardians.
- Danh sách kênh (Channels)
	- Hiển thị từng Guardian đã nhận bundle: trạng thái `init` hoặc `ready` (session có/không).
	- Lưu ý: Khi bundle đến, Holder tự tạo session và gửi “hello” mã hóa.

#### Gửi Recovery Request qua tất cả kênh
- policyId (id: `rrPolicyId`)
	- Định dạng: `0x` + 32 byte hex (bytes32). Ví dụ: `0xabc...000`.
	- Mục đích: Định danh chính sách khôi phục – dùng chung giữa Holder & Guardians & Smart Contract.
- recoveryRequestID (id: `rrReqId`)
	- Định dạng: `0x` + 32 byte hex (bytes32).
	- Mục đích: Định danh “một” yêu cầu khôi phục, thường hash(policyId, nonce, newPubKey). Dùng để đếm approvals trên-chain.
- new public key (id: `rrNewKey`)
	- Định dạng: khuyến nghị public key uncompressed hex secp256k1 bắt đầu `0x04...`.
	- Mục đích: Khóa mới mà Holder muốn gắn vào DID sau khi khôi phục.
- Nút “Mã hóa & Gửi qua relay”
	- Hành vi: Mã hóa payload `{kind:'recovery-request', policyId, reqId, newKey}` và gửi tới MỌI kênh Guardian.
	- Kết quả: Log envelope ở “channelsOut”, phản hồi đã giải mã ở “incomingOut”.

### 5) On-chain Recovery Policy (RecoveryRegistry)
- RecoveryRegistry address (id: `rrContract`)
	- Nhập: Địa chỉ contract đã deploy, ví dụ `0x1234...abcd`.
	- Mục đích: Đích để gửi giao dịch đăng ký policy.
- Guardians addresses (id: `rrGuardians`)
	- Nhập: Danh sách địa chỉ Guardian theo ĐÚNG THỨ TỰ, dạng `0x..,0x..` hoặc mảng JSON `["0x..","0x.."]`.
	- Mục đích: Tạo Merkle Root on-chain. Thứ tự QUAN TRỌNG vì ảnh hưởng đến leafIndex & proofs.
- Threshold (id: `rrThreshold`)
	- Nhập: Số lượng chấp thuận tối thiểu (≤ tổng số Guardians).
	- Mục đích: Ngưỡng hoàn tất khôi phục.
- Nút “Register Policy”
	- Hành vi: Tính `leaf = keccak256(abi.encodePacked(address))`, ghép cặp `keccak256(left||right)` để ra `merkleRoot`. Gọi `registerPolicy(policyId, merkleRoot, threshold, total)`.
	- Kết quả: Hiển thị tx hash & tham số đã dùng.

### 6) Danh sách VC đã lưu
- Cho phép xem/xoá VC; nếu có Merkle, sẽ hiện danh sách claim để tick chọn.
- Ghi chú: Nếu issuer signature không hợp lệ hoặc VC legacy không có Merkle, mục chọn claim sẽ bị vô hiệu hoá.

### 7) VP Output
- Kết quả VP JSON, có nút Copy/Download để tiện gửi cho Verifier.

---

## Guardian (public/guardian.html)

Guardian là người giám hộ: kết nối ví, tạo & gửi PreKey Bundle, nhận “Recovery Request” qua E2EE, và gửi on-chain approval.

### 1) Kết nối & Relay
- Nút “Connect Wallet”
	- Mục đích: Lấy địa chỉ Guardian để ký bundle và gọi smart contract.
- Holder address
	- Nhập: Địa chỉ 0x… của Holder mà bạn bảo trợ.
	- Mục đích: Đăng ký (join room) đúng Holder tại relay.
- Relay ws://…
	- Nhập: URL WebSocket của relay (ví dụ `ws://localhost:8099`).
- Nút “Connect Relay”
	- Hành vi: Tự sinh PreKey Bundle (kèm chữ ký `signMessage('prekey:'+sha256(bundleJSON))`) và gửi lên relay → Holder tự động nhận.
	- Thẻ trạng thái: Ví, Relay, Bundle, Session sẽ cập nhật theo thời gian thực.

### 2) Nhật ký thông điệp
- Plaintext cuối cùng nhận được
	- Hiển thị nội dung đã giải mã (ví dụ `{kind:'recovery-request', policyId, reqId, newKey, ...}`)
	- Khi là recovery-request, UI sẽ tự điền các trường on-chain ở phần (4).

### 3) Trả lời Holder (tùy chọn)
- Reply text
	- Nhập: Nội dung plaintext bạn muốn gửi lại cho Holder. Nếu để trống, hệ thống tự gửi ACK.
- Nút “Gửi qua relay”
	- Hành vi: Mã hóa bằng session hiện tại và gửi lại cho Holder. Log envelope ở phần dưới.

### 4) On-chain Approval (RecoveryRegistry)
- RecoveryRegistry address (id: `rrContractG`)
	- Nhập: Địa chỉ contract đã deploy.
- policyId (id: `rrPolicyIdG`)
	- Định dạng: bytes32 hex `0x...`. Có thể tự động điền từ thông điệp recovery.
- recoveryRequestID (id: `rrReqIdG`)
	- Định dạng: bytes32 hex `0x...`. Có thể tự động điền từ thông điệp recovery.
- Guardians addresses (id: `rrGuardiansG`)
	- Nhập: Danh sách địa chỉ Guardians theo ĐÚNG THỨ TỰ như Holder dùng khi đăng ký policy.
	- Mục đích: Từ danh sách này, UI tính được Merkle proof cho Guardian hiện tại.
- new public key (id: `rrNewKeyG`)
	- Định dạng: `0x04...` (uncompressed secp256k1). Thường auto-fill từ thông điệp recovery.
- Nút “Submit Approval”
	- Hành vi: Tính Merkle proof (leafIndex + siblings) cho địa chỉ Guardian, gọi `submitApproval(policyId, recoveryRequestID, siblings, leafIndex, newPubKey)`.
	- Kết quả: Hiển thị tx hash; khi đủ threshold, contract sẽ phát sự kiện `RecoveryFinalized`.

---

## Định dạng & lưu ý quan trọng

- policyId & recoveryRequestID
	- Luôn là bytes32 hex (`0x` + 64 hex). Nên dùng cùng một giá trị giữa Holder ↔ Guardian ↔ Contract.
	- Gợi ý: Có thể tạo ở `public/recovery.html` rồi copy sang Holder; Guardian sẽ tự đọc từ thông điệp recovery.

- Danh sách Guardians (thứ tự)
	- Thứ tự địa chỉ cực kỳ quan trọng: phải đồng nhất giữa khi Holder đăng ký policy và khi Guardian tính proof. Nếu sai, `leafIndex` lệch → Merkle mismatch.

- Cách tính Merkle (địa chỉ Guardian)
	- Leaf: `keccak256(abi.encodePacked(address))`
	- Cặp nút: `keccak256(left || right)`; nếu lẻ, lặp right = left.

- new public key
	- Nên dùng uncompressed secp256k1 (bắt đầu `0x04...`).

- Relay URL (WebSocket)
	- Mặc định `ws://localhost:8099`. Nếu tự triển khai khác, điền lại cho đúng.

---

## Quy trình đề xuất (tổng quát)
1) Holder đăng ký policy on-chain (địa chỉ Guardians + threshold). Lưu `policyId`.
2) Guardian kết nối ví + relay, bundle tự gửi tới Holder; session E2EE được thiết lập.
3) Holder gửi “recovery-request” (gồm policyId, recoveryRequestID, newKey) tới toàn bộ Guardians qua relay.
4) Guardian nhấn “Submit Approval” để gửi chấp thuận on-chain. Khi đạt threshold, hệ thống phát sự kiện hoàn tất.

---

## Sự cố thường gặp
- Không thấy kênh nào trong Holder
	- Guardian chưa kết nối relay, hoặc Holder nhập sai Holder address ở phía Guardian.
- Submit Approval báo “Guardian address không nằm trong danh sách”
	- Địa chỉ ví hiện tại không có trong danh sách Guardians đã nhập (hoặc khác chữ hoa/thường). Kiểm tra lại.
- Merkle mismatch/leafIndex sai
	- Thứ tự danh sách Guardians không khớp giữa Holder và Guardian.
- Giao dịch lỗi (insufficient funds)
	- Ví không đủ ETH để trả phí gas.

---

MIT License – dành cho mục đích học tập / nghiên cứu.

