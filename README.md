# SSI Demo Consoles

Tập hợp hai giao diện web tĩnh phục vụ quy trình Issuer và Verifier làm việc với smart contract `DIDRegistry`.

## Mở giao diện

1. Cài đặt phụ thuộc: `npm install`
2. Chạy máy chủ tĩnh để phục vụ thư mục `public/`. Ví dụ với `serve` hoặc `http-server`:
   ```bash
   npx http-server public -p 4173
   ```
3. Mở trình duyệt tới `http://localhost:4173/issuer.html` hoặc `http://localhost:4173/verifier.html` tùy vai trò.

> Bạn cũng có thể dùng lệnh `python3 -m http.server 4173 --directory public` nếu đã cài Python.

## Issuer Console (`issuer.html`)

Giao diện giúp tổ chức Issuer:

1. Kết nối ví để đăng ký DID/CID lên smart contract `DIDRegistry`.
2. Gọi Issuer Agent (Veramo) để ký Verifiable Credential (VC) và trả về cho Holder.

### Đăng ký DID/CID on-chain

1. **Connect Wallet**: Nhấn nút để cấp quyền cho MetaMask (hoặc ví EIP-1193 khác). Khi kết nối thành công sẽ hiển thị địa chỉ ví và mạng.
2. **Nhập thông tin**:
   - `Địa chỉ hợp đồng DIDRegistry`: địa chỉ triển khai `DIDRegistry` trên mạng tương ứng.
   - `Issuer DID`: DID đại diện cho tổ chức cấp phát (ví dụ `did:ethr:sepolia:0x...`).
   - `IPFS CID`: CID của DID Document hoặc metadata được lưu trên IPFS.
3. **Register Issuer Identity**: gửi giao dịch `registerDID` đến hợp đồng. Nhật ký hiển thị hash giao dịch và trạng thái xác nhận.

### Tạo Verifiable Credential bằng Veramo

1. **Issuer Agent API Endpoint**: điền địa chỉ dịch vụ backend (mặc định `http://localhost:4000`). Giá trị này được lưu vào `localStorage` để dùng lại.
2. **Holder DID / Credential Type**: nhập DID của người nhận và loại credential (ví dụ `StudentCard`).
3. **Thuộc tính Credential**: thêm/xóa các cặp key/value (họ tên, ngày sinh, trường học, ...). Có thể tùy biến tự do.
4. **Create VC**: ứng dụng gửi yêu cầu đến Issuer Agent. Kết quả trả về gồm JSON của VC và JWT ký bằng private key của Issuer.
5. Copy JWT hoặc JSON để chuyển cho Holder lưu trữ trong ví.

## Ghi chú kỹ thuật

- Giao diện sử dụng `ethers.js` (CDN) để tương tác với MetaMask và hợp đồng.
- Hỗ trợ tự động cập nhật trạng thái khi người dùng đổi tài khoản hoặc mạng.
- Nếu hợp đồng giới hạn quyền cập nhật DID, hãy dùng cùng tài khoản với ví sở hữu DID đó.
- Phần tạo VC gọi tới Issuer Agent (dịch vụ Node.js dùng Veramo) qua REST API.

## Issuer Agent (Veramo backend)

Dịch vụ `src/issuer-agent.ts` chịu trách nhiệm:

- Import private key của Issuer (xuất từ MetaMask) vào Veramo KMS.
- Tạo DID `did:ethr` tương ứng, upload DID Document lên IPFS và ghi CID vào `DIDRegistry`.
- Cấp phát VC dạng JWT qua endpoint `/issue-credential`.

### Cấu hình môi trường (`.env` ví dụ)

```env
ISSUER_WALLET_PRIVATE_KEY="0x..."   # private key của ví Issuer (MetaMask)
DID_REGISTRY_ADDRESS=0x...           # địa chỉ smart contract DIDRegistry
RPC_URL=https://...                  # RPC phù hợp mạng (vd: Sepolia hoặc zkSync Sepolia)
ETH_NETWORK_NAME=sepolia             # tên mạng cho did:ethr (fallback từ CHAIN_NAME)
IPFS_API_URL=http://127.0.0.1:5001/api/v0  # hoặc endpoint Infura, web3.storage...
IPFS_BASIC_AUTH=...                  # tuỳ chọn nếu gateway yêu cầu Basic Auth
PORT=4000                            # cổng dịch vụ
```

> Nếu đã có biến `CHAIN_NAME`, `CHAIN_ID`, `ZKSYNC_SEPOLIA_RPC` trong `.env` cũ, dịch vụ vẫn sử dụng được (có giá trị fallback).

### Khởi chạy

```bash
npm run issuer:agent
```

Dịch vụ sẽ lắng nghe `http://localhost:4000` (hoặc cổng bạn cấu hình). Endpoint chính:

- `GET /health` – trả về DID và địa chỉ ví đang sử dụng.
- `POST /issue-credential` – body:
   ```json
   {
      "holderDid": "did:example:holder-123",
      "credentialType": "StudentCard",
      "attributes": {
         "name": "Nguyễn Văn A",
         "birthdate": "2001-01-01"
      }
   }
   ```
   Response gồm `credential` (JSON-LD) và `jwt` ký bằng private key của Issuer.

## Verifier Console (`verifier.html`)

Ứng dụng dành cho Verifier: nhập địa chỉ `DIDRegistry` và dán Verifiable Presentation (VP) từ Holder để kiểm tra DID tương ứng.

### Các bước

1. **Chuẩn bị VP JSON**: Holder cung cấp VP (chứa `holder` và `verifiableCredential`).
2. **Điền địa chỉ hợp đồng**: dán địa chỉ `DIDRegistry` do Issuer công bố vào ô Contract Address.
3. **Dán VP**: dán toàn bộ nội dung VP vào ô nhập (định dạng JSON).
4. **Verify Presentation**: bấm nút để thực hiện xác thực sơ bộ.

### Kết quả hiển thị

- `Holder DID`: DID trích xuất từ VP (ưu tiên trường `holder`, fallback sang `credentialSubject.id`).
- `CID`: giá trị lấy từ on-chain thông qua `resolveDID`.
- `DID Owner`: địa chỉ sở hữu DID từ hợp đồng (nếu có).
- `Thông tin chứng chỉ`: tóm tắt nhanh danh sách VC bên trong VP.
- `Kết quả xác thực`: ✅ nếu DID tồn tại trên contract và CID không rỗng, ❌ nếu không tìm thấy.

> Lưu ý: bước này mới xác thực DID tồn tại trên chain. Để xác thực chữ ký VP/VC đầy đủ, cần tích hợp thêm Veramo verifier hoặc các thư viện của W3C VC.
