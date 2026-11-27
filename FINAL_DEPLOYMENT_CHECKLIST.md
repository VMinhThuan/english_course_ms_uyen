# FINAL DEPLOYMENT CONFIGURATION VERIFICATION

Ngày xác minh: 2026-11-27 (Asia/Ho_Chi_Minh)  
Repository: `/Users/vuthuan/english-course-web`  
Branch: `development`  
HEAD đã xác minh: `e8266b9424f53d7977f27dce88f5990f794981f0`  
Working tree: dirty; được bảo toàn nguyên trạng. Không reset, checkout, commit, push, deploy, truy cập production database hoặc thay đổi production ENV.

## Kết luận ngắn

### Code-level readiness

**READY WITH CONDITIONS.** Runtime đã loại bỏ Redis/Upstash. MongoDB là authority cho authentication, Active Session và rate limiting. Local unit/integration/concurrency/outage tests đã PASS theo các báo cáo trước.

### Production GO/NO-GO

**NO-GO cho strict Single Active Session ngay sau khi chỉ push/deploy.** Có thể deploy additive code để staging nếu các ENV hiện có đúng, nhưng phải kiểm tra topology, index và legacy-token behavior trước khi bật strict enforcement.

**GO có điều kiện** sau khi hoàn tất staging checklist ở dưới. Không cần thêm Redis, Upstash, Redis-compatible service, Redis credential hoặc dịch vụ bên thứ ba.

## 1. Nếu chỉ push code và deploy thì website có hoạt động không?

Không có câu trả lời unconditional.

- Nếu production đã có `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, cấu hình CORS/frontend đúng, Node `22.23.4` và MongoDB reachable, website có thể khởi động mà không có Redis/Upstash credentials.
- Rate limiter sẽ dùng MongoDB. Nếu chưa có index, request đầu tiên vẫn có thể tạo bucket bằng upsert, nhưng multi-instance correctness chưa được operationally verified; không nên coi đó là production-ready.
- `AUTH_SESSION_ENFORCEMENT_STUDENTS` và `AUTH_REFRESH_ROTATION` mặc định `false`, nên chỉ push/deploy không tự bật strict Single Active Session.
- Nếu deploy đồng thời đặt hai flag strict thành `true`, học viên đang dùng legacy token có thể bị yêu cầu đăng nhập lại. Vì vậy không bật strict chỉ bằng một code push chưa có migration/smoke test.
- Worktree hiện tại ở branch `development`; workflow production hiện chỉ trigger push trên `main` (`.github/workflows/deploy-backend.yml:3-9`). Push branch `development` không tự phát hành production qua workflow đó.

## 2. Single Active Session có tự động bật không?

Không.

Source of truth: `backend/src/security/authSession.js:6-17`.

| ENV | Khi không khai báo | Chức năng |
|---|---:|---|
| `AUTH_SESSION_ENFORCEMENT_STUDENTS` | `false` | Student access/refresh token phải khớp MongoDB `authSession.sessionId`; bật Last Login Wins enforcement |
| `AUTH_REFRESH_ROTATION` | `false` | Student refresh token rotation và reuse detection |
| `AUTH_LEGACY_JWT_MIGRATION` | `true` | Cho phép compatibility với refresh token legacy khi strict enforcement chưa bật; khi strict enforcement bật, legacy student token vẫn bị từ chối |

Admin và teacher không bị giới hạn single active session. Frontend không có feature flag riêng cho modal; UI đã xử lý response `SESSION_REPLACED` khi backend strict mode được bật.

Khuyến nghị activation:

```env
AUTH_SESSION_ENFORCEMENT_STUDENTS=true
AUTH_REFRESH_ROTATION=true
AUTH_LEGACY_JWT_MIGRATION=true
```

Chỉ đặt hai flag đầu thành `true` sau staging verification. Không bật một flag strict trong production mà chưa kiểm tra flag còn lại.

## 3. ENV production chính xác

Không có secret value nào được đọc, ghi vào báo cáo hoặc tiết lộ.

### Bắt buộc cho backend runtime

| ENV | Giá trị production | Ghi chú |
|---|---|---|
| `MONGODB_URI` | URI MongoDB production hiện có | Bắt buộc; phải trỏ đúng database production |
| `JWT_SECRET` | Secret production hiện có | Bắt buộc; không dùng giá trị mẫu |
| `JWT_REFRESH_SECRET` | Secret production hiện có, khác `JWT_SECRET` | Bắt buộc |
| `NODE_ENV` | `production` | Cần đặt để secure cookie/CORS production được áp dụng |
| `FRONTEND_URL` | Origin frontend thực tế, ví dụ `https://msuyenclass.vn` | Cần khai báo origin credentialed chính |

### ENV mới hoặc liên quan trực tiếp đến rollout

| ENV | Bắt buộc? | Default thực tế trong source | Giá trị production khuyến nghị |
|---|---|---|---|
| `AUTH_SESSION_ENFORCEMENT_STUDENTS` | Không ở additive rollout | `false` | `false` trước staging; `true` sau khi đủ điều kiện |
| `AUTH_REFRESH_ROTATION` | Không ở additive rollout | `false` | `false` trước staging; `true` cùng strict enforcement |
| `AUTH_LEGACY_JWT_MIGRATION` | Không | `true` nếu unset | `true` trong migration window |
| `RATE_LIMIT_NAMESPACE` | Không | `RATE_LIMIT_NAMESPACE || APP_ENV || NODE_ENV`, cuối cùng `default` | `production` |
| `TRUST_PROXY_HOPS` | Không | `0` | Số proxy hop đã xác minh; không đoán giá trị |
| `APP_ENV` | Không cho app runtime | Chỉ dùng namespace nếu có | `production` là tùy chọn; bắt buộc hữu ích cho migration guard `staging` |

### ENV existing có default

| ENV | Default source code | Production value đã xác minh/khuyến nghị |
|---|---|---|
| `JWT_EXPIRE` | `15m` | `15m` |
| `JWT_REFRESH_EXPIRE` | `7d` | `7d` |
| `JWT_ISSUER` | unset | Optional; set nếu hệ thống hiện tại đang dùng |
| `JWT_AUDIENCE` | unset | Optional; set nếu hệ thống hiện tại đang dùng |
| `PORT` | `3000` | Port do hosting cung cấp; `3000` nếu phù hợp |
| `MONGODB_TIMEOUT_MS` | `30000` ngoài test | Optional tuning |
| `MONGODB_CONNECT_TIMEOUT_MS` | `30000` ngoài test | Optional tuning |
| `MONGOOSE_AUTO_INDEX` | Không bật trong production | Không cần thêm; production luôn `autoIndex=false` |
| `FRONTEND_ORIGINS` | Empty list ngoài `FRONTEND_URL` và các origin legacy được hard-code | CSV các origin frontend bổ sung, nếu có |

`VITE_API_URL` là frontend build ENV. Source có fallback production là `https://api.msuyenclass.vn/api/v1`, nhưng nên set explicit:

```env
VITE_API_URL=https://api.msuyenclass.vn/api/v1
```

Không đưa `JWT_SECRET`, `JWT_REFRESH_SECRET`, `MONGODB_URI` hoặc bất kỳ session secret nào vào frontend ENV.

## 4. Redis/Upstash ENV có thể xóa

Sau khi version MongoDB-only đã được deploy và smoke test thành công, các ENV sau không còn được runtime đọc:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
RATE_LIMIT_REDIS_TIMEOUT_MS
```

Có thể xóa chúng khỏi deployment configuration sau verification. Nếu cần rollback ngay về binary cũ còn dùng Upstash, phải giữ credential cũ cho đến khi rollback window kết thúc; code hiện tại không cần chúng.

## 5. Collection rate limiting có tự tạo không?

Có, nhưng cần phân biệt:

- `RateLimitBucket` dùng collection `rate_limit_buckets` tại `backend/src/models/RateLimitBucket.js:1-48`.
- Request rate-limited đầu tiên dùng `findOneAndUpdate(..., { upsert: true })`; nếu collection chưa tồn tại, MongoDB có thể tạo collection cùng bucket document.
- Nếu chưa có request nào, collection có thể chưa tồn tại.
- Lệnh migration `rate-limit:index -- --apply` cũng tạo collection khi tạo index nếu collection chưa tồn tại.

Vì vậy collection có thể tự sinh, nhưng không nên dựa vào traffic đầu tiên để hoàn tất production migration.

## 6. Unique index và TTL index có tự tạo không?

Không tự tạo trong production.

Source `backend/src/configs/database.js:11-17` đặt:

```text
autoIndex = true chỉ khi NODE_ENV là development/test và MONGOOSE_AUTO_INDEX=true
autoIndex = false trong production
```

Schema khai báo nhưng không thay thế migration:

- unique `{ key: 1 }`, tên `rate_limit_bucket_key_unique`;
- TTL `{ expiresAt: 1 }`, `expireAfterSeconds: 0`, tên `rate_limit_bucket_expires_ttl`.

Learning Session cũng có partial unique index `learning_session_one_active_per_student`, nhưng production phải tạo bằng migration script vì autoIndex bị tắt.

## 7. Quy trình index migration an toàn

Thực hiện bằng một shell có `MONGODB_URI` của đúng target đã được export; không ghi URI hoặc password vào command history nếu hệ thống vận hành không cho phép.

### Rate-limit indexes

Check read-only:

```bash
cd /path/to/english-course-web
APP_ENV=staging npm --prefix backend run rate-limit:index
```

Apply sau backup, database-target review và staging approval:

```bash
APP_ENV=staging npm --prefix backend run rate-limit:index -- --apply
APP_ENV=staging npm --prefix backend run rate-limit:index
```

Production apply bị guard. Chỉ khi đã có operational approval rõ ràng mới dùng one-shot migration guard; đây không phải app ENV cần giữ lâu dài:

```bash
APP_ENV=production ALLOW_PRODUCTION_RATE_LIMIT_INDEXES=true \
  npm --prefix backend run rate-limit:index -- --apply
APP_ENV=production npm --prefix backend run rate-limit:index
```

### Single Active Learning Session index

Script sẽ phát hiện duplicate active rows và từ chối apply nếu có duplicate:

```bash
cd /path/to/english-course-web
APP_ENV=staging npm --prefix backend run learning-session:index
APP_ENV=staging npm --prefix backend run learning-session:index -- --apply
APP_ENV=staging npm --prefix backend run learning-session:index
```

Production command, chỉ chạy sau backup và xác nhận đúng database:

```bash
APP_ENV=production ALLOW_PRODUCTION_LEARNING_SESSION_INDEXES=true \
  npm --prefix backend run learning-session:index -- --apply
APP_ENV=production npm --prefix backend run learning-session:index
```

Quy trình bắt buộc:

1. Xác minh `MONGODB_URI` target, database name, user permission và backup/restore path.
2. Chạy check read-only.
3. Nếu có duplicate active learning rows, dừng và xử lý theo business owner; không tự động xóa hoặc backfill lịch sử.
4. Apply unique/TTL indexes trong maintenance window hoặc theo change approval.
5. Chạy check read-only lần nữa và lưu JSON output.
6. Chỉ sau đó mới bật strict flags và chạy smoke test hai thiết bị.

## 8. Single Active Session có cần replica set/transaction không?

### Authentication/session authority

Không yêu cầu transaction hoặc replica set cho các operation cốt lõi:

- Login Last Login Wins là một `User.findOneAndUpdate` atomic single-document update tại `backend/src/controllers/authController.js:205-237`.
- Refresh rotation là atomic conditional update trên cùng User document tại `backend/src/controllers/authController.js:351-440`.
- Access-token validation đọc `User.authSession.sessionId` ở mỗi protected request tại `backend/src/middlewares/auth.js:38-70`.

Các operation này cần MongoDB reachable và write consistency của single document, không cần multi-document transaction.

### Learning time/progress

Phần ghi nhận learning session/progress hiện vẫn dùng transaction path tại `backend/src/controllers/learningSessionController.js:45-72`. Trong production/staging, code fail closed nếu transaction không khả dụng và trả `503 LEARNING_SESSION_UNAVAILABLE`.

Do đó:

- **Active Session ID/refresh rotation:** không bắt buộc replica set.
- **Đầy đủ learning heartbeat/time/progress dưới production rules hiện tại:** cần MongoDB replica set hoặc MongoDB Atlas topology hỗ trợ transactions.

Đây là điều kiện production của learning flow, không phải điều kiện kỹ thuật riêng của single-document auth session.

## 9. Command kiểm tra topology, transaction support và indexes

Command dưới đây chỉ in metadata/topology và index names; transaction probe chỉ đọc một `_id` rồi abort transaction. Không chạy command này trong phiên xác minh hiện tại để tránh truy cập production.

```bash
cd /path/to/english-course-web/backend
node --input-type=module <<'NODE'
import mongoose from 'mongoose';
import RateLimitBucket from './src/models/RateLimitBucket.js';
import LearningSession from './src/models/LearningSession.js';

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
await mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  autoIndex: false,
});

const client = mongoose.connection.getClient();
const admin = client.db('admin');
const hello = await admin.command({ hello: 1 });
const topology = hello.msg === 'isdbgrid'
  ? 'sharded-mongos'
  : (hello.setName ? 'replicaSet' : 'standalone');

const list = async (model) => {
  try { return await model.collection.listIndexes().toArray(); }
  catch (error) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
};

const rateIndexes = await list(RateLimitBucket);
const learningIndexes = await list(LearningSession);
let transactionProbe = 'NOT_RUN';
const session = client.startSession();
try {
  session.startTransaction();
  await mongoose.connection.db.collection('users').findOne(
    {}, { projection: { _id: 1 }, session },
  );
  await session.abortTransaction();
  transactionProbe = 'PASS_READ_ONLY_ABORTED';
} catch (error) {
  await session.abortTransaction().catch(() => {});
  transactionProbe = `FAIL:${error?.codeName || error?.name || 'Error'}`;
} finally {
  await session.endSession();
}

const hasRateUnique = rateIndexes.some((i) =>
  JSON.stringify(i.key) === JSON.stringify({ key: 1 }) && i.unique === true);
const hasRateTtl = rateIndexes.some((i) =>
  JSON.stringify(i.key) === JSON.stringify({ expiresAt: 1 }) && Number(i.expireAfterSeconds) === 0);
const hasLearningUnique = learningIndexes.some((i) =>
  i.name === 'learning_session_one_active_per_student' && i.unique === true);

console.log(JSON.stringify({
  database: mongoose.connection.name,
  topology,
  setName: hello.setName || null,
  logicalSessionTimeoutMinutes: hello.logicalSessionTimeoutMinutes ?? null,
  transactionTopologyEligible: topology !== 'standalone',
  transactionProbe,
  rateLimitUniqueIndex: hasRateUnique,
  rateLimitTtlIndex: hasRateTtl,
  learningSessionPartialUniqueIndex: hasLearningUnique,
}));
await mongoose.disconnect();
NODE
```

Expected production result: non-standalone topology, `transactionProbe` pass, rate-limit unique/TTL indexes `true`, and learning-session partial unique index `true`.

## 10. Có cần học viên đăng nhập lại không?

| Rollout | Student re-login |
|---|---|
| Deploy code với cả hai strict flags `false` | Không bắt buộc; legacy access/refresh compatibility vẫn còn |
| Bật strict enforcement lần đầu | Có, với học viên còn dùng legacy access/refresh token không có `sid`/session binding |
| Học viên đã login bằng code mới trước khi bật strict | Thường không cần; token đã có session binding và `authSession` |
| Admin/teacher | Không bị single-session enforcement |

Frontend sẽ nhận `SESSION_REPLACED`, dừng refresh tự động, xóa access token cũ và hiển thị modal yêu cầu đăng nhập lại. Không nên dùng `AUTH_LEGACY_JWT_MIGRATION=true` để hiểu rằng strict mode sẽ tiếp tục chấp nhận legacy student access token; source explicitly rejects it khi strict enforcement bật.

## 11. Thứ tự deployment và activation

1. **Staging:** deploy backend additive với `AUTH_SESSION_ENFORCEMENT_STUDENTS=false`, `AUTH_REFRESH_ROTATION=false`, `AUTH_LEGACY_JWT_MIGRATION=true`.
2. Chạy rate-limit index check/apply và learning-session duplicate/index check/apply trên đúng staging DB.
3. Kiểm tra `/health`, `/ready`, login, refresh, heartbeat, learning write và hai backend instances nếu staging có nhiều instance.
4. Deploy frontend tương thích với `SESSION_REPLACED` modal và cross-tab synchronization.
5. Smoke test laptop/phone và nhiều tab.
6. Khi staging đạt, bật đồng thời:

   ```env
   AUTH_SESSION_ENFORCEMENT_STUDENTS=true
   AUTH_REFRESH_ROTATION=true
   ```

   restart backend; không cần rebuild frontend chỉ để bật hai backend flags.
7. Theo dõi `SESSION_REPLACED`, `REFRESH_REUSE`, `503`, heartbeat, learning write và login success rate.
8. Production áp dụng cùng thứ tự; không xóa Redis variables trước khi version mới đã verified nếu vẫn cần rollback binary cũ.

## 12. Laptop/điện thoại smoke test

### Student

- [ ] Laptop đăng nhập thành công; access token và HttpOnly refresh cookie hoạt động.
- [ ] Mở hai tab trên laptop; cả hai tab vẫn dùng được, không bị coi là hai session.
- [ ] Điện thoại đăng nhập cùng student account.
- [ ] Trong tối đa một chu kỳ heartbeat hiện tại (15 giây), laptop nhận modal “tài khoản vừa được đăng nhập trên thiết bị khác”.
- [ ] Laptop không tự refresh lại sau `SESSION_REPLACED`.
- [ ] Laptop cũ không thể gọi protected API, start/heartbeat/end learning session, làm bài hoặc ghi nhận study time.
- [ ] Laptop/phone mới vẫn gọi được `/auth/me`, heartbeat, lesson progress và protected API.
- [ ] Logout từ thiết bị cũ không xóa session mới; conditional logout chỉ clear matching active session.
- [ ] Refresh đồng thời ở hai tab không tạo `REFRESH_REUSE` giả và không logout tab hợp lệ.
- [ ] Đóng/mở lại tab và kiểm tra cross-tab access-token synchronization.

### Admin/teacher

- [ ] Đăng nhập cùng tài khoản trên laptop và điện thoại.
- [ ] Cả hai session vẫn hoạt động; không xuất hiện student replacement modal.

### Mongo/rate limiting

- [ ] `/health` trả liveness; `/ready` trả database ready.
- [ ] Kiểm tra rate-limit indexes bằng script read-only.
- [ ] Trong outage test staging, backend trả 503 fail-closed; frontend không logout vì lỗi transient database.

## 13. Rollback strategy

1. Nếu lỗi sau strict activation, tắt `AUTH_SESSION_ENFORCEMENT_STUDENTS` và `AUTH_REFRESH_ROTATION`, restart backend; không xóa `authSession`, learning history hoặc indexes.
2. Nếu cần, rollback backend/frontend về known-good artifact sau khi flags đã ở trạng thái additive.
3. Giữ các field `User.authSession`, `rate_limit_buckets` và indexes; đây là dữ liệu/schema additive và không cần destructive rollback.
4. Nếu rollback về binary cũ còn dùng Redis/Upstash, chỉ khi đó mới cần khôi phục Redis ENV cũ; không xóa dữ liệu Mongo business.
5. Sau rollback, kiểm tra login, refresh, `/ready`, learning heartbeat/progress và CORS.
6. Không drop unique index hoặc xóa learning/session history như phản ứng khẩn cấp.

## 14. Runtime không có Redis/Upstash credentials

Đã xác minh code-level:

- `backend/src/middlewares/rateLimit.js` chỉ import `RateLimitBucket` và không import Redis client.
- `backend/package.json`/lockfile không còn `@upstash/redis`, `uncrypto` hoặc Redis dependency.
- app import test với ba Redis ENV unset đã PASS.
- runtime/config/workflow scan không còn Redis/Upstash references; các từ khóa còn lại chỉ nằm trong báo cáo lịch sử/migration.

Vì vậy runtime hiện tại không cần Redis/Upstash credentials. Điều kiện còn lại là MongoDB URI, JWT secrets, CORS và indexes/topology nêu trên.

## 15. MongoDB rate-limiter performance

### Concurrency test khác sustained load

Đã chạy **burst concurrency test** trên disposable loopback MongoDB: nhiều request đồng thời cùng tạo/cập nhật bucket trong một đợt ngắn. Đây không phải sustained load test và không mô phỏng đầy đủ API, network, Atlas, heartbeat mix, write concern hoặc nhiều phút/giờ tải liên tục.

Kết quả store-level local measurement đã ghi nhận:

| Concurrent requests | Throughput | p50 | p95 | p99 | Atomic bucket writes |
|---:|---:|---:|---:|---:|---:|
| 10 | 1,736.88 req/s | 4.44 ms | 5.65 ms | 5.65 ms | 10 |
| 50 | 2,939.59 req/s | 10.83 ms | 15.73 ms | 16.43 ms | 50 |
| 100 | 3,152.25 req/s | 22.71 ms | 29.28 ms | 30.66 ms | 100 |
| 500 | 2,993.63 req/s | 105.72 ms | 160.41 ms | 161.27 ms | 500 |

Pool size local test: `100`; collection growth: `660` documents across the disposable benchmark.

Các số liệu trên **không chứng minh hệ thống hỗ trợ 500 học viên online**. Chưa chạy sustained load production-like. Staging cần đo full API latency, heartbeat cadence, Mongo CPU/memory, connection pool saturation, write concern, network latency, error rate và duration thực tế trước khi đặt capacity target.

## 16. Final checklist

- [ ] Existing required production ENV đã được xác minh bởi operator, không tiết lộ secret.
- [ ] Không còn Redis/Upstash dependency hoặc runtime credential requirement.
- [ ] MongoDB topology phù hợp; transaction probe pass cho learning flow.
- [ ] `rate_limit_buckets` unique + TTL indexes verified.
- [ ] `learning_session_one_active_per_student` verified sau duplicate check.
- [ ] Backend additive deploy và frontend deploy đã smoke test trên staging.
- [ ] Legacy-token impact và re-login plan đã được thông báo.
- [ ] Hai strict flags chỉ được bật cùng nhau sau staging approval.
- [ ] Laptop/phone/two-tab/admin-teacher/outage smoke tests pass.
- [ ] Rollback artifact và rollback ENV plan đã sẵn sàng.
- [ ] Không đánh dấu production PASS khi chưa có staging/production operational evidence.

## 17. Database preparation verification performed

- Current local `backend/.env` was inspected by key names only. It contains the existing Mongo/JWT/CORS basics, but no session flags, `RATE_LIMIT_NAMESPACE`, `TRUST_PROXY_HOPS`, or Redis/Upstash variables. Effective local defaults are session enforcement/rotation `false`, legacy migration `true`, proxy hops `0`, and rate-limit namespace `development`.
- Disposable MongoDB replica-set rehearsal: rate-limit check/apply/check passed; required unique and TTL indexes were present after apply.
- Disposable learning-session rehearsal: duplicate active-row guard passed; after cleanup, partial unique index apply and post-check passed.
- `ensureSingleActiveLearningSessionIndex.js` does not handle `NamespaceNotFound` in check mode when `learningsessions` does not yet exist. The rehearsal therefore required an explicitly created empty disposable collection. Staging must verify that the existing collection is present before using the current script; do not create a production collection without an approved database operation.
- A 100-request disposable burst with rate-limit indexes absent produced one bucket and count 100 in that run. This is not a guarantee: the runtime does not fail closed merely because a required index is missing, so the unique index remains a hard precondition before multi-instance release. Missing TTL affects cleanup/storage hygiene rather than the expiry comparison used for correctness.
- The current execution shell reports Node `v20.18.0`; repository CI/deployment target is Node `22.23.4`. The disposable rehearsal emitted the MongoDB-memory-server compatibility warning under Node 20 and must not replace the Node 22 CI/staging verification.
- No production MongoDB connection, topology probe, index check, duplicate scan, backup, migration or ENV change was performed.

## 18. Final release fixes verification

The following release fixes were applied without changing authentication or business rules:

- `backend/src/middlewares/rateLimit.js` now checks the required unique key and TTL indexes before every real Mongo-backed rate-limit increment. Missing indexes fail closed with `503 RATE_LIMIT_INDEXES_UNAVAILABLE`, `Retry-After: 5`, missing index names and an operator migration command.
- `/ready` now returns the same 503 readiness result when MongoDB rate-limit indexes are missing. Startup logs the missing-index condition while keeping the process available for readiness diagnostics.
- `backend/src/scripts/ensureSingleActiveLearningSessionIndex.js` now treats `NamespaceNotFound` as a read-only missing-index state. Dry-run does not create `learningsessions`; apply remains the only mode that creates the index/collection.
- Node `22.23.4` targeted verification: rate limiter unit **4/4**, Mongo rate limiter **7/7**, auth-session **3/3**, database readiness **7/7**, Single Active Session integration **3/3**, replica-set integration **1/1**.
- Node `22.23.4` disposable migration rehearsal: rate-limit idempotency **PASS**, learning-session idempotency **PASS**, empty-namespace dry-run no-write **PASS**, duplicate active-row guard **PASS**.
- Node `22.23.4` legacy JWT probe: legacy access and refresh tokens both returned `SESSION_REPLACED`; the current session remained HTTP 200.
- The exact full `npm ci`/CI and browser verification remains represented by the earlier reports; no unrelated full suite was repeated because no business/authentication refactor was made.

## 19. Round 2 Vercel preparation verification

The operator identified `https://english-course-ms-uyen.vercel.app` and `https://frontend-ru4l.vercel.app` as the Round 2 deployment pair. Read-only checks performed against those public URLs returned:

- Backend `/health`: HTTP 200, but response reports `env: development`; production configuration is therefore not yet proven.
- Backend `/ready`: HTTP 200 on the currently deployed Vercel version. This does not replace post-deployment verification of the new index guard because the final source changes have not been deployed.
- Frontend: HTTP 200; the built bundle has `VITE_API_URL` set to `https://english-course-ms-uyen.vercel.app/api/v1`. The old `https://api.msuyenclass.vn/api/v1` remains only as a compiled fallback constant and is not selected when `VITE_API_URL` is valid.

Using the local `backend/.env` URI, with credentials omitted from output and relying on the operator's explicit Round 2 database confirmation, the read-only database probe returned:

- MongoDB database metadata: `english_course` on an Atlas SRV target; credentials were present but never printed.
- Topology: replica set; transaction probe: `PASS_READ_ONLY_ABORTED`.
- `rate_limit_buckets`: collection/unique key index/TTL index all absent.
- `learningsessions`: collection present; `learning_session_one_active_per_student` absent.
- Duplicate active learning students: `0`.
- Database writes performed: `0`.

The local URI cannot be cryptographically compared with Vercel's secret ENV from source code alone. The Round 2 identity is based on the operator confirmation; an independent non-secret database fingerprint would be required for stronger proof.

The Vercel `TRUST_PROXY_HOPS` value is not observable from the public API and was not guessed. Local `.env` omits it, so local effective default is `0`; the Vercel project must explicitly confirm its value from Vercel settings/runtime architecture before release.

The backup command was prepared but not executed. It is read-only against the configured target, but it copies database contents to local disk and therefore requires explicit operator approval.

## 20. Round 2 approved backup and index migration result

The operator approved the Round 2 database operation. The local configured target matched the expected database name `english_course`; credentials were only checked for presence and never printed. The target was treated as Round 2 based on the operator's explicit isolation confirmation. Vercel's secret `MONGODB_URI` is not externally readable, so no independent secret-to-secret comparison was possible.

### Backup

- Node: `22.23.4`.
- `mongodump`: `100.12.0`.
- Backup: **PASS**.
- Backup directory: [`backend/data/backups/backup_2026-11-27T07-17-45-992Z`](</Users/vuthuan/english-course-web/backend/data/backups/backup_2026-11-27T07-17-45-992Z>).
- BSON collections: `41`.
- Restore verification: **PASS** into disposable MongoDB only.
- Restored sample counts: `users=226`, `learningsessions=10`, `learningprogresses=18`, `learningactivities=18`.
- No restore was directed to Round 2 or any customer website database.

### Index state and migration

Before apply:

| Target | State |
|---|---|
| `rate_limit_buckets` unique `{key:1}` | Missing |
| `rate_limit_buckets` TTL `{expiresAt:1}`, `expireAfterSeconds=0` | Missing |
| `learning_session_one_active_per_student` partial unique | Missing |
| Duplicate active learning students | `0` |

After apply:

| Target | State |
|---|---|
| `rate_limit_bucket_key_unique` | Present, unique |
| `rate_limit_bucket_expires_ttl` | Present, TTL `0` |
| `learning_session_one_active_per_student` | Present, unique partial on `status=active` |
| Duplicate active learning students | `0` |

Both migration scripts were run again with `--apply` and then read-only check mode. They remained successful and did not create duplicate indexes: **idempotency PASS**.

### Data preservation

All `41` pre-migration backup collections were restored to a disposable database and compared with the Round 2 target after migration. There were `0` document-count mismatches. The new `rate_limit_buckets` collection is additive and was absent from the pre-migration backup. No learning history document was deleted or rewritten by the index migration.

### Remaining Vercel conditions

- Public Round 2 `/health` currently reports `env: development`, not `production`. The source reports this when Vercel `NODE_ENV` is unset or not equal to `production`; the Vercel setting must be corrected before release.
- Public Round 2 `/ready` returned 200 for the currently deployed version. It does not prove that the new source-level index guard is deployed; recheck after deploying the final backend.
- `TRUST_PROXY_HOPS` remains unverified because Vercel does not expose the value through the public endpoint. Do not guess it.
- No Vercel deployment, ENV update, commit, push or merge was performed.

## 21. Temporary Preview runtime diagnostic

Added temporarily at `backend/src/middlewares/previewRuntimeDiagnostic.js` and mounted at `/__round2/runtime-diagnostic`.

Protection and scope:

- Responds only when `VERCEL_ENV=preview`.
- Requires the Preview-only secret ENV `ROUND2_RUNTIME_DIAGNOSTIC_TOKEN` through header `X-Round2-Runtime-Diagnostic-Token`.
- Returns 404 for production, non-preview deployments, missing token and invalid token.
- Does not return URI, username, password, JWT secret, refresh token or diagnostic token.
- Performs only read operations: request metadata, MongoDB topology/transaction probe, required index checks and duplicate active-session count.
- Local disposable protection/metadata test: unauthenticated 404, authenticated Preview 200, transaction probe PASS, required-index status PASS.

The diagnostic records `req.ip`, `req.ips`, `req.socket.remoteAddress`, `X-Forwarded-For`, `X-Real-IP`, `Forwarded`, `NODE_ENV`, `VERCEL_ENV`, `TRUST_PROXY_HOPS`, database name/topology, transaction status and the three required index conditions.

### Current rewrite finding

`frontend/vercel.json` currently rewrites `/api/v1/*` to `https://api.msuyenclass.vn/api/v1/*`, which is the old customer backend. It must not be used for this diagnostic. The deployed Round 2 frontend bundle uses its explicit `VITE_API_URL=https://english-course-ms-uyen.vercel.app/api/v1` for direct API calls, but the old rewrite remains a separate unsafe path. No request was sent through that rewrite.

### Exact TRUST_PROXY_HOPS status

The exact Vercel value is **not yet determined**. The source and public endpoint cannot reveal the Preview ENV value, and no Preview deployment was performed in this turn. Do not infer `0` or `1` from Vercel's existence of a proxy.

To determine it, deploy this diagnostic only to Preview, run the same request matrix with Preview `TRUST_PROXY_HOPS=0` and then `1`, and compare:

1. A normal request from a known external client must resolve `req.ip` to the actual client identity, not the Vercel internal socket address.
2. `req.ips` and `X-Forwarded-For` must show the expected trusted chain.
3. A request containing a spoofed custom `X-Forwarded-For`/`X-Real-IP` must not make `req.ip` become the spoofed value.
4. Choose the smallest hop count satisfying all three conditions; retain the evidence JSON for release approval.

The current frontend rewrite cannot be used for this matrix without first changing the Preview-only routing target away from the old customer backend.

### Removal requirement

Before any release build:

1. Remove `backend/src/middlewares/previewRuntimeDiagnostic.js`.
2. Remove its import and `/__round2/runtime-diagnostic` route from `backend/src/app.js`.
3. Remove `ROUND2_RUNTIME_DIAGNOSTIC_TOKEN` from Vercel Preview and all local/CI environments.
4. Verify the diagnostic path returns the normal 404 and rerun the final build/deploy checks.

## Final decision

- **Code-level readiness:** READY WITH CONDITIONS.
- **Required production configuration:** MongoDB URI, JWT secrets, production Node/CORS settings; không cần Redis/Upstash; production indexes phải được verify/apply bằng migration script.
- **Remaining staging requirements:** topology/transaction probe, index state, duplicate active-row check, two-instance concurrency, legacy-token rollout, two-device smoke test, outage recovery và sustained/load observation.
- **Production GO/NO-GO:** **NO-GO cho strict enablement hiện tại; GO có điều kiện sau khi hoàn tất toàn bộ staging requirements.**
