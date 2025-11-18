D1: Ví Danh tính Phi tập trung cho Chứng chỉ Xác thực (VC) 
●  Mục tiêu và Tầm nhìn: Xây dựng một ví điện tử đơn giản dưới dạng tiện ích mở rộng cho trình duyệt (ví dụ: Chrome Extension). Ví này cho phép người dùng tạo và quản lý các Định danh Phi tập trung (Decentralized Identifiers - DIDs) và lưu trữ, trình diện các Chứng chỉ Xác thực (Verifiable Credentials - VCs) theo chuẩn W3C. Dự án này giúp hiện thực hóa các khái niệm trừu tượng của Danh tính Tự chủ (SSI), cho thấy một tương lai nơi người dùng, chứ không phải các nền tảng lớn như Google hay Facebook, thực sự kiểm soát danh tính số của mình. 
●  Các Tính năng Cốt lõi: 
1.  Thiết lập Agent: Tạo một "agent" Veramo phía client, là trung tâm điều phối mọi hoạt động liên quan đến danh tính. 
2.  Quản lý DID: Cho phép người dùng tạo mới, lưu trữ và quản lý các DID. Hỗ trợ ít nhất một phương thức DID như did:key (đơn giản, dựa trên một cặp khóa) hoặc did:ethr (liên kết với một địa chỉ Ethereum). 
3.  Lưu trữ Chứng chỉ: Cung cấp chức năng để nhận và lưu trữ an toàn một VC. Nhóm cần tạo một dịch vụ "issuer" giả lập đơn giản để cấp phát VC cho ví. Sử dụng các plugin lưu trữ dữ liệu của Veramo (@veramo/data-store hoặc @veramo/data-store-json). 
4.  Trình diện Chứng chỉ: Xây dựng giao diện cho phép người dùng chọn một VC đã lưu và tạo ra một "Trình diện Xác thực" (Verifiable Presentation - VP) để gửi cho một trang web "verifier" giả lập. VP có thể chứa toàn bộ hoặc chỉ một phần thông tin từ VC gốc (selective disclosure). 
●  Công nghệ Gợi ý: React, TypeScript, Veramo SDK (bao gồm các gói @veramo/core, 
@veramo/did-manager, @veramo/credential-w3c, @veramo/key-manager, 
@veramo/kms-local). 
●  Sản phẩm Bàn giao: Một kho mã nguồn trên GitHub chứa code của tiện ích mở rộng. Một file README chi tiết hướng dẫn cài đặt và sử dụng. Một video ngắn demo toàn bộ vòng đời: tạo DID, nhận một VC từ issuer, và trình diện VC đó cho verifier.

***Final Project
- Report: Có cấu trúc như bài báo (Abstract), Introduction, Related work, Approach (Methodology), Experiment, Result, Disscusion & Limittation, Conclusion & Future work


