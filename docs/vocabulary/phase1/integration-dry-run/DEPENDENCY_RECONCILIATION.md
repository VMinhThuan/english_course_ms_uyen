# Dependency Reconciliation

## Scratch manifest

| Dependency | Resolved version | Decision |
|---|---:|---|
| `yauzl` | 3.4.0 | Giữ direct dependency từ baseline; Parser V2.1 dùng ZIP reader |
| `@xmldom/xmldom` | 0.8.15 | Khai báo direct dependency cho Parser V2.1 |
| `saxes` | 6.0.0 | Giữ dependency V1 hiện có |
| `fflate` | 0.8.3 | Dev dependency cho DOCX fixtures tổng hợp |
| `sanitize-html` | 2.18.1 | Giữ phiên bản baseline; package engine yêu cầu Node tối thiểu 22.12.0 |
| `body-parser` | 1.20.9 | Giữ override hiện có |
| Node.js | 22.18.0 | Runtime dùng để kiểm tra scratch |

`backend/package.json` và lockfile được hòa giải trong scratch rồi chạy `npm ci`; không chép lockfile Parser sang nguyên trạng. Lockfile giữ nguyên các phiên bản đã resolve của baseline và ghi dependency/engine additions cần thiết.

## Verification

- `npm ci`: PASS, 228 packages installed, 229 audited, 0 vulnerabilities.
- `npm ls --depth=0`: PASS; các dependency ở bảng trên resolve đúng.
- `npm ls body-parser`: PASS; `express` nhận `body-parser@1.20.9 overridden`.
- `npm audit --audit-level=low`: PASS, 0 vulnerabilities.
- Import parser, adapter, catalog service, persistence service và models: PASS; Mongoose vẫn disconnected và các biến database trong process không đổi.
- `sanitize-html` bản cài đặt cần Node `>=22.12.0`; scratch đặt `engines.node` thành `>=22.12.0 <23` để giới hạn vào dải Node 22 đã kiểm thử.

Ràng buộc Node chỉ được đổi trong scratch. Runtime deployment chưa được khảo sát hoặc thay đổi. `npm ci` có cảnh báo package `multer@1.4.5-lts.2` deprecated; audit hiện tại không báo vulnerability. Backend không khai báo build script nên không có lệnh `npm run build` để chạy.
