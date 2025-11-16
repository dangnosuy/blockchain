<div align="center">

# 🔐 SSI Merkle VC Demo

Gồm 3 console web tĩnh: **Issuer**, **Holder**, **Verifier** minh họa quy trình cấp phát & trình diễn Verifiable Credential với **Selective Disclosure** dựa trên **Merkle Tree + EIP-712** trên Ethereum.

</div>

## 1. Mục tiêu

Cho phép Issuer ký một VC duy nhất (không phải ký lại cho từng trường) nhưng Holder vẫn có thể chọn lọc từng claim (thuộc tính) để trình diện. Tránh:
- VC-per-claim (nhiều chữ ký, quản lý khó),
- Giải pháp phức tạp/BBS+ chưa sẵn sàng trên MetaMask.

Chúng ta dùng: **Salted Merkle Tree** + **EIP-712 typed data signature**.

## 2. Thuật toán & Mô hình mật mã

| Thành phần | Thuật toán / Chuẩn | Vai trò |
|------------|--------------------|--------|
| Hash lá & nút | `keccak256` | Băm giá trị claim + salt, ghép hai nút -> hash cặp |
| Salt | 16 bytes ngẫu nhiên (hex) | Chống đoán giá trị, ngăn rainbow/linkability |
| Cây Merkle | Sắp xếp key tăng dần, ghép cặp; nếu lẻ thì duplicate node cuối | Tạo `merkleRoot` duy nhất |
| Chữ ký VC | EIP-712 `VerifiableCredentialRoot` | Ràng buộc: issuer, issuanceDate, holder, merkleRoot, algo |
| Chữ ký VP | EIP-712 `VP` | Ràng buộc: holder DID + danh sách tất cả `vcRoots` + metadata (aud, nonce, exp) |
| Proof mỗi claim | Danh sách siblings (hash + vị trí) | Cho phép Verifier xây lại root |

### Leaf Encoding
Mỗi lá: `JSON.stringify({ k, v, salt })` rồi `keccak256(toUtf8Bytes(...))`.

### Tính toàn vẹn
Issuer ký `merkleRoot`. Holder tiết lộ subset claim + salt + sibling path. Verifier băm lại => so sánh với root đã được Issuer ký. Không cần chữ ký mới cho từng claim.

### Tính riêng tư
Salt đảm bảo hai VC khác nhau với cùng giá trị claim tạo khác hash (ngăn liên kết). Không tiết lộ salt của claim không trình diện.

### Hạn chế
1. Chỉ xử lý các giá trị primitive/lá JSON; nested object chưa canonical hóa sâu.
2. Không chống chứng minh phủ định (zero-knowledge) – chỉ positive inclusion.
3. Cần re-issue nếu thay đổi bất kỳ claim.

## 3. Kiến trúc thư mục chính

```
├── DIDRegistry.sol            # Hợp đồng quản lý DID -> CID, owner
├── public/
│   ├── issuer.html            # Giao diện Issuer (đăng ký DID + tạo Merkle VC)
│   ├── holder.html            # Giao diện Holder (import VC, chọn claim, ký VP)
│   ├── verifier.html          # Giao diện Verifier (kiểm VC/VP + Merkle proof)
│   └── assets/*.js            # Bundle đã build từ src/web/*.ts
├── src/web/issuer.ts          # Logic tạo VC, xây Merkle tree, ký EIP-712
├── src/web/holder.ts          # Logic lưu VC, tạo Merkle proof, ký VP
├── src/web/verifier.ts?       # (nếu tách) xử lý kiểm chứng phía Verifier
├── package.json
└── README.md
```

## 4. Luồng xử lý

### 4.1 Issuance (Issuer)
1. Kết nối ví MetaMask -> có `issuerAccount` + mạng.
2. (Tuỳ chọn) Đăng ký DID/CID lên `DIDRegistry` qua hàm `registerDID`.
3. Nhập `Holder DID` + các thuộc tính (claims) -> sinh salt cho từng key.
4. Tạo Merkle tree, thu được `merkleRoot`.
5. Ký EIP-712 typed data `VerifiableCredentialRoot` với MetaMask.
6. Xuất VC JSON chứa: `credentialSubject`, `merkle.salts`, `proof.merkleRoot`, `proof.proofValue`.

### 4.2 Presentation (Holder)
1. Import VC JSON (lưu localStorage).
2. Chọn subset claims (checkbox hiển thị nếu VC có `merkle.salts`).
3. Với mỗi claim được chọn: dựng Merkle proof (siblings + salt + value).
4. Ký EIP-712 message `VP` chứa tất cả `vcRoots` + metadata.
5. Xuất VP JSON: gồm headers VC (không lộ salts không chọn), mảng `merkleProofs`, chữ ký VP.

### 4.3 Verification (Verifier)
1. Dán VP.
2. Kiểm chữ ký Issuer: rebuild typed data từ VC header -> recover address.
3. Kiểm chữ ký Holder: typed data VP -> recover address Holder.
4. Với mỗi Merkle proof: băm lại leaf từ (key,value,salt) -> duyệt siblings -> khớp root.
5. Gộp kết quả: PASS nếu toàn bộ proofs khớp và chữ ký hợp lệ.

## 5. Cách chạy thử nghiệm

### 5.1 Cài đặt & Build
```bash
npm install
npm run build     # build issuer & holder bundles bằng esbuild
```

### 5.2 Serve tĩnh
```bash
npx http-server public -p 4173
# hoặc
python3 -m http.server 4173 --directory public
```

### 5.3 Quy trình demo nhanh
1. Mở `http://localhost:4173/issuer.html`.
2. Connect Wallet (Sepolia). Nhập Holder DID (ví dụ `did:ethr:sepolia:0xHolderAddress`).
3. Thêm claims (name, university, ...). Ấn "Create VC" → copy VC JSON.
4. Mở `holder.html` → dán VC → Lưu VC.
5. Tick các claim muốn tiết lộ → Connect Wallet → Ký VP.
6. Copy VP JSON → mở `verifier.html` → dán VP → Verify → xem báo cáo.

### 5.4 Thay đổi mạng
Đổi chain trên MetaMask → trang tự reload để tránh mismatch `chainId` trong EIP-712 domain.

## 6. Định dạng dữ liệu chính

### 6.1 VC (rút gọn)
```json
{
  "credentialSubject": { "id": "did:ethr:sepolia:0xHolder", "name": "Alice" },
  "merkle": { "algorithm": "keccak256", "leafEncoding": "json-kv-salt", "salts": { "id": "0x...", "name": "0x..." } },
  "proof": { "merkleRoot": "0xROOT", "proofValue": "0xSIG", "eip712": { "primaryType": "VerifiableCredentialRoot" } }
}
```

### 6.2 VP (rút gọn)
```json
{
  "verifiableCredential": [ { "issuer": "did:ethr:...", "proof": { "merkleRoot": "0xROOT" } } ],
  "merkleProofs": [ { "vcIndex": 0, "key": "name", "value": "Alice", "salt": "0x...", "siblings": [ { "hash": "0x...", "position": "right" } ] } ],
  "proof": { "primaryType": "VP", "proofValue": "0xSIG" }
}
```

## 7. Kiểm thử & Debug nhanh
- Sai `merkleRoot mismatch`: Holder proof không khớp VC hoặc VC bị sửa.
- Chữ ký VP fail recover: sai domain (chainId khác), hoặc chỉnh sửa nội dung sau khi ký.
- Không hiện checkbox claim: VC thiếu `merkle.salts` (legacy) hoặc paste sai JSON.

## 8. Bảo mật & Khả năng mở rộng
| Chủ đề | Ghi chú |
|--------|--------|
| Thay đổi claim | Cần re-issue vì root đổi |
| Nested objects | Chưa canonical hóa sâu; nên flatten hoặc chuẩn hóa thêm |
| Gas | Không ảnh hưởng trực tiếp (Merkle xây client-side) |
| Privacy | Không tiết lộ claim không chọn vì không gửi salt & proof |
| Replay VP | Sử dụng `nonce` + `exp`; Verifier có thể kiểm tra hết hạn / uniqueness |

## 9. Mở rộng tương lai
- Thêm canonicalization chuẩn (RFC8785 JSON Canonicalization Scheme).
- Compress Merkle proof (bitmap vị trí, RLP hoặc CBOR).
- Hỗ trợ BBS+/SD-JWT khi ví / trình ký hỗ trợ.
- Zero-Knowledge non-membership hoặc range proof cho kiểu giá trị đặc biệt.

## 10. Câu hỏi thường gặp (FAQ)
**Tại sao không dùng nhiều VC nhỏ?** Tốn công ký & quản lý, duyệt nhiều chữ ký khi verify.

**Có thể ẩn số lượng claim?** Hiện tại Verifier suy ra số lượng claim (qua siblings). Có thể thêm padding giả.

**Có cần backend cho Issuer?** Với EIP-712 ký trực tiếp bằng MetaMask: không bắt buộc, dùng Veramo chỉ để DID tiện lợi.

---
**MIT License – dùng cho mục đích học tập/demo.**

Nếu bạn cần thêm phần nào (ví dụ script test tự động) hãy mở issue hoặc yêu cầu tiếp.

