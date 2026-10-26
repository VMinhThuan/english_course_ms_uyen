import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(frontendRoot, '..');
const requireFrontend = createRequire(path.join(frontendRoot, 'package.json'));
const { chromium } = requireFrontend('playwright');
const objectId = (value) => String(value).padStart(24, '0');
const batchId = objectId(99001);
const adminId = objectId(99101);
const mockState = { uploads: 0, uploadSucceeded: false, rejectNextUpload: false, patches: [], reviews: [], confirms: [], loseNextConfirm: false, conflictNextPatch: false };

const candidates = Array.from({ length: 22 }, (_, index) => {
  const number = index + 1;
  const word = `synthetic-${String(number).padStart(2, '0')}`;
  return {
    _id: objectId(99500 + number), batchId, sourceIdentity: `synthetic-source-${number}`,
    parserVersion: '2.1.0', schemaVersion: 'v1', version: 0, __v: 0,
    sourceMetadata: { relativePath: `TOEIC EASY START/Start ${Math.ceil(number / 10)}.docx`, fileName: `Start ${Math.ceil(number / 10)}.docx`, sourceOrdinal: number, paragraphStart: number * 3, paragraphEnd: number * 3 + 2, topicCandidate: 'TOEIC EASY START' },
    rawValues: { rawText: `${word} (noun): original source meaning\nAn original example.\n→ Ví dụ nguồn ban đầu.` },
    parsedValues: { word, partOfSpeech: ['noun'], senses: [{ partOfSpeech: ['noun'], meaning: `Nghĩa tổng hợp ${number}`, examples: [{ english: `Synthetic example ${number}.`, vietnamese: `Ví dụ tổng hợp ${number}.` }] }], notes: [`Ghi chú nguồn ${number}`] },
    editedValues: {},
    duplicateMetadata: number === 1 ? { parser: { classification: 'REPEATED_HEADING' } } : null,
    validationIssues: number === 2 ? [{ code: 'TEXT_REQUIRED', field: 'senses.0.meaning' }] : [],
    parseStatus: 'PARSED', validationStatus: number === 2 ? 'VALIDATION_FAILED' : 'VALIDATION_PASSED',
    reviewStatus: number === 3 ? 'REVIEW_APPROVED' : 'NEEDS_REVIEW',
    reviewReason: '', reviewedBy: number === 3 ? adminId : null, reviewedAt: null,
    importStatus: 'NOT_IMPORTED', importedVocabularyId: null, importedChapterId: null, importedMembershipId: null,
    publicationStatus: 'NOT_ELIGIBLE', duplicateDecision: null,
    createdAt: '2026-10-26T04:00:00.000Z', updatedAt: '2026-10-26T04:00:00.000Z',
  };
});
const audit = new Map(candidates.map((candidate) => [String(candidate._id), candidate.reviewedBy ? [{
  _id: objectId(99600), action: 'REVIEW_DECISION', decision: 'APPROVE', actorId: adminId, occurredAt: '2026-10-26T04:01:00.000Z', reason: '',
}] : []]));

const batch = {
  _id: batchId, version: 0, __v: 0, schemaVersion: 'v1', parserVersions: ['2.1.0'],
  sourceFiles: [
    { relativePath: 'TOEIC EASY START/Start 1.docx', chapterCandidate: 'Start 1', candidateCount: 11, fileSha256: 'a'.repeat(64) },
    { relativePath: 'TOEIC EASY START/Start 2.docx', chapterCandidate: 'Start 2', candidateCount: 11, fileSha256: 'b'.repeat(64) },
  ], candidateCount: candidates.length, counts: {}, duplicateGroupCount: 1, duplicateOccurrenceCount: 2,
  status: 'NEEDS_REVIEW', createdAt: '2026-10-26T04:00:00.000Z', updatedAt: '2026-10-26T04:00:00.000Z',
};

function recount() {
  const counts = { parsed: candidates.length, valid: 0, invalid: 0, needsReview: 0, approved: 0, rejected: 0, importedAsDraft: 0 };
  candidates.forEach((candidate) => {
    if (candidate.validationStatus === 'VALIDATION_PASSED') counts.valid += 1;
    if (candidate.validationStatus === 'VALIDATION_FAILED') counts.invalid += 1;
    if (['NEEDS_REVIEW', 'EDITED'].includes(candidate.reviewStatus)) counts.needsReview += 1;
    if (candidate.reviewStatus === 'REVIEW_APPROVED') counts.approved += 1;
    if (candidate.reviewStatus === 'REVIEW_REJECTED') counts.rejected += 1;
    if (candidate.importStatus === 'IMPORTED_AS_DRAFT') counts.importedAsDraft += 1;
  });
  batch.counts = counts;
  batch.status = counts.importedAsDraft === candidates.length ? 'CONFIRMED_DRAFT'
    : counts.importedAsDraft ? 'PARTIALLY_CONFIRMED_DRAFT'
      : counts.needsReview ? 'NEEDS_REVIEW' : 'REVIEW_COMPLETE';
}
recount();

function effective(candidate) {
  return { ...candidate.parsedValues, ...candidate.editedValues,
    ...(candidate.editedValues.senses ? { senses: candidate.editedValues.senses.map((sense, index) => ({ ...candidate.parsedValues.senses[index], ...sense })) } : {}),
  };
}
function candidateStatus(candidate) {
  if (candidate.importStatus === 'IMPORTED_AS_DRAFT') return 'IMPORTED_AS_DRAFT';
  if (candidate.reviewStatus === 'REVIEW_APPROVED') return 'REVIEW_APPROVED';
  if (candidate.reviewStatus === 'REVIEW_REJECTED') return 'REVIEW_REJECTED';
  if (candidate.validationStatus === 'VALIDATION_FAILED') return 'INVALID';
  if (candidate.validationStatus === 'VALIDATION_PASSED') return 'VALID';
  return 'PARSED';
}
function cloneCandidate(candidate) { return { ...candidate, status: candidateStatus(candidate) }; }
function batchCopy() { return structuredClone(batch); }
function reply(route, status, data, extra = {}) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ status: status >= 400 ? 'error' : 'success', ...(status >= 400 ? data : { data }), ...extra }) });
}

function applyListFilter(url) {
  let rows = [...candidates];
  const search = url.searchParams.get('search')?.toLowerCase() || '';
  if (search) rows = rows.filter((candidate) => `${effective(candidate).word} ${candidate.sourceMetadata.relativePath}`.toLowerCase().includes(search));
  const status = url.searchParams.get('status');
  if (status === 'PARSED') rows = rows.filter((candidate) => candidate.parseStatus === 'PARSED');
  if (status === 'VALID') rows = rows.filter((candidate) => candidate.validationStatus === 'VALIDATION_PASSED');
  if (status === 'INVALID') rows = rows.filter((candidate) => candidate.validationStatus === 'VALIDATION_FAILED');
  if (status === 'NEEDS_REVIEW') rows = rows.filter((candidate) => candidate.reviewStatus === 'NEEDS_REVIEW');
  if (status === 'REVIEW_APPROVED') rows = rows.filter((candidate) => candidate.reviewStatus === 'REVIEW_APPROVED');
  if (status === 'REVIEW_REJECTED') rows = rows.filter((candidate) => candidate.reviewStatus === 'REVIEW_REJECTED');
  if (status === 'IMPORTED_AS_DRAFT') rows = rows.filter((candidate) => candidate.importStatus === 'IMPORTED_AS_DRAFT');
  const validation = url.searchParams.get('validationStatus');
  if (validation) rows = rows.filter((candidate) => candidate.validationStatus === validation);
  const review = url.searchParams.get('reviewStatus');
  if (review) rows = rows.filter((candidate) => candidate.reviewStatus === review);
  const page = Number(url.searchParams.get('page') || 1);
  const limit = Number(url.searchParams.get('limit') || 20);
  return { rows, page, limit, total: rows.length, pages: Math.ceil(rows.length / limit) || 1 };
}

async function wireMockApi(context) {
  await context.route('**/mock/admin/vocabulary-import-batches**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const root = '/mock/admin/vocabulary-import-batches';
    const suffix = url.pathname.slice(root.length).replace(/\/$/, '');
    if (suffix === '' && request.method() === 'POST') {
      mockState.uploads += 1;
      const contentType = request.headers()['content-type'] || '';
      mockState.lastUploadType = contentType;
      if (!contentType.startsWith('multipart/form-data; boundary=')) return reply(route, 415, { code: 'MULTIPART_REQUIRED', message: 'Multipart boundary required.' });
      if (mockState.rejectNextUpload) {
        mockState.rejectNextUpload = false;
        return reply(route, 400, { code: 'INVALID_DOCX', message: 'Synthetic parser unavailable; keep the selected files and try again.' });
      }
      const isRetry = request.postDataBuffer()?.toString('latin1').includes('Start 1.docx');
      const idempotent = Boolean(mockState.uploadSucceeded && isRetry);
      mockState.uploadSucceeded = true;
      return reply(route, idempotent ? 200 : 201, { batch: batchCopy(), candidates: candidates.slice(0, 20).map(cloneCandidate), idempotent });
    }
    if (suffix === `/${batchId}` && request.method() === 'GET') return reply(route, 200, batchCopy());
    if (suffix === `/${batchId}/candidates` && request.method() === 'GET') {
      const { rows, page, limit, total, pages } = applyListFilter(url);
      return reply(route, 200, { items: rows.slice((page - 1) * limit, page * limit).map(cloneCandidate), pagination: { page, limit, total, pages }, rowErrors: rows.flatMap((candidate) => candidate.validationIssues.map((issue) => ({ candidateId: candidate._id, ...issue }))) });
    }
    const candidatePath = suffix.match(new RegExp(`^/${batchId}/candidates/([a-f0-9]{24})(?:/(review))?$`));
    if (candidatePath) {
      const [, candidateId, reviewSegment] = candidatePath;
      const candidate = candidates.find((item) => String(item._id) === candidateId);
      if (!candidate) return reply(route, 404, { code: 'CANDIDATE_NOT_FOUND', message: 'Candidate not found.' });
      if (request.method() === 'GET' && !reviewSegment) return reply(route, 200, { candidate: cloneCandidate(candidate), auditHistory: structuredClone(audit.get(candidateId) || []) });
      if (request.method() === 'PATCH' && !reviewSegment) {
        const payload = request.postDataJSON();
        mockState.patches.push({ candidateId, payload: structuredClone(payload) });
        if (mockState.conflictNextPatch) {
          mockState.conflictNextPatch = false;
          return reply(route, 409, { code: 'CONCURRENT_MODIFICATION', message: 'The candidate changed. Reload it before editing.' });
        }
        Object.assign(candidate.editedValues, payload.changes);
        candidate.version += 1;
        candidate.__v = candidate.version;
        candidate.validationStatus = effective(candidate).word && effective(candidate).senses?.[0]?.meaning ? 'VALIDATION_PASSED' : 'VALIDATION_FAILED';
        candidate.validationIssues = candidate.validationStatus === 'VALIDATION_FAILED' ? [{ code: 'TEXT_REQUIRED', field: 'senses.0.meaning' }] : [];
        candidate.reviewStatus = 'NEEDS_REVIEW';
        candidate.duplicateDecision = null;
        candidate.reviewedBy = null;
        candidate.reviewedAt = null;
        candidate.updatedAt = new Date().toISOString();
        audit.get(candidateId).push({ _id: objectId(99700 + mockState.patches.length), action: 'FIELDS_EDITED', actorId: adminId, reason: payload.reason, changedFields: Object.keys(payload.changes).map((field) => ({ field })), occurredAt: candidate.updatedAt });
        batch.version += 1; batch.__v = batch.version; batch.updatedAt = candidate.updatedAt; recount();
        return reply(route, 200, cloneCandidate(candidate));
      }
      if (request.method() === 'POST' && reviewSegment) {
        const payload = request.postDataJSON();
        mockState.reviews.push({ candidateId, payload: structuredClone(payload) });
        if (payload.decision === 'APPROVE' && candidate.validationStatus !== 'VALIDATION_PASSED') return reply(route, 409, { code: 'CANDIDATE_INVALID', message: 'Only a valid candidate can be approved.' });
        if (payload.decision === 'APPROVE' && candidate.duplicateMetadata && payload.duplicateDecision !== 'KEEP_SEPARATE') return reply(route, 409, { code: 'DUPLICATE_DECISION_REQUIRED', message: 'Choose KEEP_SEPARATE.' });
        candidate.reviewStatus = payload.decision === 'APPROVE' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED';
        candidate.rejectionReason = payload.decision === 'REJECT' ? payload.reason : '';
        candidate.duplicateDecision = payload.duplicateDecision || null;
        candidate.reviewedBy = adminId;
        candidate.reviewedAt = new Date().toISOString();
        candidate.version += 1; candidate.__v = candidate.version; candidate.updatedAt = candidate.reviewedAt;
        audit.get(candidateId).push({ _id: objectId(99800 + mockState.reviews.length), action: 'REVIEW_DECISION', decision: payload.decision, duplicateDecision: payload.duplicateDecision || null, reason: payload.reason || '', actorId: adminId, occurredAt: candidate.reviewedAt });
        batch.version += 1; batch.__v = batch.version; batch.updatedAt = candidate.updatedAt; recount();
        return reply(route, 200, cloneCandidate(candidate));
      }
    }
    if (suffix === `/${batchId}/confirm` && request.method() === 'POST') {
      const payload = request.postDataJSON();
      mockState.confirms.push(structuredClone(payload));
      const selected = candidates.filter((candidate) => payload.candidateIds.includes(String(candidate._id)));
      const results = selected.map((candidate, index) => {
        if (candidate.importStatus !== 'IMPORTED_AS_DRAFT') {
          candidate.importStatus = 'IMPORTED_AS_DRAFT';
          candidate.importedVocabularyId = objectId(99900 + mockState.confirms.length * 10 + index);
          candidate.importedChapterId = objectId(99940 + mockState.confirms.length * 10 + index);
          candidate.importedMembershipId = objectId(99970 + mockState.confirms.length * 10 + index);
          candidate.version += 1; candidate.__v = candidate.version;
        }
        return { candidateId: candidate._id, status: 'IMPORTED_AS_DRAFT', vocabularyId: candidate.importedVocabularyId, chapterId: candidate.importedChapterId, membershipId: candidate.importedMembershipId };
      });
      batch.version += 1; batch.__v = batch.version; batch.updatedAt = new Date().toISOString(); recount();
      if (mockState.loseNextConfirm) {
        mockState.loseNextConfirm = false;
        return route.abort('failed');
      }
      return reply(route, 200, { batch: batchCopy(), results, rowErrors: [], idempotent: false });
    }
    return reply(route, 404, { code: 'NOT_FOUND', message: 'Mock endpoint not found.' });
  });
}

const getPort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForVite(url, processRef) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (processRef.exitCode !== null) throw new Error(`Vite exited early (${processRef.exitCode}).`);
    try { const response = await fetch(url); if (response.ok) return; } catch { /* server is starting */ }
    await delay(150);
  }
  throw new Error('Vite did not become ready.');
}

async function main() {
  const port = await getPort();
  const viteBin = path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: frontendRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  let viteOutput = '';
  vite.stdout.on('data', (chunk) => { viteOutput += chunk.toString(); });
  vite.stderr.on('data', (chunk) => { viteOutput += chunk.toString(); });
  let browser;
  try {
    const pageUrl = `http://127.0.0.1:${port}/tests/fixtures/vocabulary-import.html`;
    await waitForVite(pageUrl, vite);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await wireMockApi(context);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(pageUrl);
    await page.getByRole('heading', { name: 'Nhập Word & kiểm duyệt' }).waitFor();

    const input = page.locator('input[type="file"]');
    await input.setInputFiles([{ name: 'wrong.docx', mimeType: 'text/plain', buffer: Buffer.from('not a word file') }]);
    await page.getByRole('alert').filter({ hasText: 'định dạng trình duyệt' }).waitFor();
    await input.setInputFiles(Array.from({ length: 6 }, (_, index) => ({ name: `too-many-${index}.docx`, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK synthetic') })));
    await page.getByRole('alert').filter({ hasText: 'tối đa 5 file DOCX' }).waitFor();
    await input.setInputFiles([{ name: 'too-large.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) }]);
    await page.getByRole('alert').filter({ hasText: 'vượt quá giới hạn' }).waitFor();
    await input.setInputFiles(Array.from({ length: 3 }, (_, index) => ({ name: `batch-too-large-${index}.docx`, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.alloc(9 * 1024 * 1024) })));
    await page.getByRole('alert').filter({ hasText: 'Tổng dung lượng batch vượt quá' }).waitFor();
    assert.equal(mockState.uploads, 0, 'invalid client uploads must not call the API');

    const validFiles = [
      { name: 'Start 1.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK synthetic fixture') },
      { name: 'Start 2.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK synthetic fixture 2') },
    ];
    await input.setInputFiles(validFiles);
    await page.locator('.vwi-field--source input').fill('TOEIC EASY START');
    mockState.rejectNextUpload = true;
    await page.getByRole('button', { name: 'Tạo batch & xem trước' }).click();
    await page.getByRole('alert').filter({ hasText: 'Synthetic parser unavailable' }).waitFor();
    assert.equal(await page.locator('.vwi-file-row').count(), 2, 'failed upload retains selected files for retry');
    assert.equal(await page.locator('.vwi-field--source input').inputValue(), 'TOEIC EASY START');
    await page.getByRole('button', { name: 'Tạo batch & xem trước' }).click();
    await page.getByRole('heading', { name: 'Các Chapter candidate' }).waitFor();
    await page.getByText('2 Chapter source').waitFor();
    assert.equal(mockState.uploads, 2);
    assert.ok(mockState.lastUploadType.startsWith('multipart/form-data; boundary='));
    assert.equal(batch.sourceFiles.length, 2, 'one uploaded DOCX is retained per Chapter source');

    await page.getByLabel('Tìm từ hoặc tên Chapter').fill('synthetic-21');
    await page.getByText('synthetic-21').first().waitFor();
    await page.locator('.vwi-filters select').nth(1).selectOption('VALIDATION_FAILED');
    await page.getByText('Không có candidate phù hợp').waitFor();
    await page.locator('.vwi-filters select').nth(1).selectOption('');
    await page.getByLabel('Tìm từ hoặc tên Chapter').fill('');
    await page.getByRole('button', { name: 'Trang sau' }).click();
    await page.getByText('Trang 2 / 2').waitFor();
    await page.getByRole('button', { name: /synthetic-21/ }).waitFor();
    await page.getByRole('button', { name: 'Trang trước' }).click();
    await page.getByText('Trang 1 / 2').waitFor();

    const firstRow = page.locator('.vwi-candidate-row').filter({ hasText: 'synthetic-01' });
    await firstRow.locator('.vwi-candidate-open').click();
    const workbench = page.locator('.vwi-workbench');
    await workbench.getByRole('heading', { name: 'synthetic-01' }).waitFor();
    await workbench.locator('.vwi-editor-form label').filter({ hasText: 'Từ / cụm từ' }).locator('input').fill('synthetic-01 edited');
    await workbench.locator('.vwi-sense label').filter({ hasText: 'Nội dung nghĩa tiếng Việt' }).locator('textarea').fill('Nghĩa đã biên tập');
    await workbench.locator('.vwi-sense label').filter({ hasText: 'Tiếng Anh' }).locator('textarea').fill('Edited synthetic example.');
    await workbench.locator('.vwi-editor-form label').filter({ hasText: 'Ghi chú' }).locator('textarea').fill('Ghi chú đã biên tập');
    await workbench.locator('.vwi-editor-form label').filter({ hasText: 'Lý do chỉnh sửa' }).locator('input').fill('Chuẩn hóa nội dung tổng hợp');
    await workbench.getByRole('button', { name: 'Lưu chỉnh sửa' }).click();
    await page.getByRole('status').filter({ hasText: 'Đã lưu thay đổi' }).waitFor();
    const patchBody = mockState.patches.at(-1).payload;
    assert.deepEqual(Object.keys(patchBody).sort(), ['changes', 'expectedVersion', 'reason']);
    assert.deepEqual(Object.keys(patchBody.changes).sort(), ['notes', 'senses', 'word']);
    assert.equal(patchBody.changes.senses[0].examples[0].english, 'Edited synthetic example.');
    assert.equal(candidates[0].reviewStatus, 'NEEDS_REVIEW', 'editing after approval/review returns the candidate to review');

    mockState.conflictNextPatch = true;
    await workbench.locator('.vwi-editor-form label').filter({ hasText: 'Từ / cụm từ' }).locator('input').fill('local unsaved version');
    const guardedSecondRow = page.locator('.vwi-candidate-row').filter({ hasText: 'synthetic-02' });
    await guardedSecondRow.locator('.vwi-candidate-open').click();
    const discardDialog = page.getByRole('dialog', { name: 'Bỏ thay đổi chưa lưu?' });
    await discardDialog.waitFor();
    await discardDialog.getByRole('button', { name: 'Ở lại chỉnh sửa' }).click();
    assert.equal(await workbench.locator('.vwi-editor-form label').filter({ hasText: 'Từ / cụm từ' }).locator('input').inputValue(), 'local unsaved version');
    await workbench.locator('.vwi-editor-form label').filter({ hasText: 'Lý do chỉnh sửa' }).locator('input').fill('Thử xung đột đồng thời');
    await workbench.getByRole('button', { name: 'Lưu chỉnh sửa' }).click();
    await workbench.getByText('Phiên bản đã thay đổi trên máy chủ').waitFor();
    assert.equal(await workbench.locator('.vwi-editor-form label').filter({ hasText: 'Từ / cụm từ' }).locator('input').inputValue(), 'local unsaved version', 'the failed save preserves the local draft');
    await workbench.getByRole('button', { name: 'Tải bản máy chủ' }).click();
    assert.equal(await workbench.locator('.vwi-editor-form label').filter({ hasText: 'Từ / cụm từ' }).locator('input').inputValue(), 'synthetic-01 edited', 'the explicit conflict resolution loads the current server copy');
    const duplicateToggle = workbench.locator('.vwi-keep-separate input');
    assert.equal(await duplicateToggle.isVisible(), true);
    assert.equal(await workbench.getByRole('button', { name: 'Duyệt candidate' }).isDisabled(), true);
    await duplicateToggle.check();
    await workbench.getByRole('button', { name: 'Duyệt candidate' }).click();
    await page.getByRole('status').filter({ hasText: 'Candidate đã được duyệt' }).waitFor();
    assert.equal(await workbench.locator('.vwi-unsaved-tag').count(), 0, 'reviewing a saved candidate must not leave a dirty editor');
    await workbench.getByText('Lịch sử kiểm duyệt').waitFor();
    assert.equal(mockState.reviews.at(-1).payload.duplicateDecision, 'KEEP_SEPARATE');
    assert.ok((audit.get(String(candidates[0]._id)) || []).some((entry) => entry.action === 'FIELDS_EDITED'));

    await workbench.locator('.vwi-editor-form label').filter({ hasText: 'Ghi chú' }).locator('textarea').fill('Chỉnh sửa sau khi đã duyệt');
    await workbench.locator('.vwi-editor-form label').filter({ hasText: 'Lý do chỉnh sửa' }).locator('input').fill('Cập nhật sau khi duyệt');
    await workbench.getByRole('button', { name: 'Lưu chỉnh sửa' }).click();
    await page.getByRole('status').filter({ hasText: 'Đã lưu thay đổi' }).waitFor();
    assert.equal(candidates[0].reviewStatus, 'NEEDS_REVIEW', 'a post-approval edit invalidates the prior approval');
    assert.equal(await workbench.locator('.vwi-keep-separate input').isChecked(), false, 'the old duplicate decision is cleared after editing');
    assert.equal(await workbench.getByRole('button', { name: 'Duyệt candidate' }).isDisabled(), true);
    await workbench.locator('.vwi-keep-separate input').check();
    await workbench.getByRole('button', { name: 'Duyệt candidate' }).click();
    await page.getByRole('status').filter({ hasText: 'Candidate đã được duyệt' }).waitFor();

    const secondRow = page.locator('.vwi-candidate-row').filter({ hasText: 'synthetic-02' });
    await secondRow.locator('.vwi-candidate-open').click();
    const invalidWorkbench = page.locator('.vwi-workbench');
    await invalidWorkbench.getByRole('heading', { name: 'synthetic-02' }).waitFor();
    await invalidWorkbench.locator('.vwi-validation-panel').waitFor();
    await invalidWorkbench.getByRole('button', { name: 'Duyệt candidate' }).waitFor();
    const invalidApproveDisabled = await invalidWorkbench.getByRole('button', { name: 'Duyệt candidate' }).isDisabled();
    assert.equal(invalidApproveDisabled, true, `Approve stays disabled for backend validation failure; candidate=${candidates[1].validationStatus}; page=${await invalidWorkbench.locator('.vwi-workbench__head').innerText()}`);
    await invalidWorkbench.locator('.vwi-review-panel label').filter({ hasText: 'Lý do từ chối' }).locator('textarea').fill('Thiếu nghĩa cần đối chiếu nguồn');
    await invalidWorkbench.getByRole('button', { name: 'Từ chối' }).click();
    await page.getByRole('status').filter({ hasText: 'Đã ghi nhận lý do từ chối' }).waitFor();
    assert.equal(mockState.reviews.at(-1).payload.reason, 'Thiếu nghĩa cần đối chiếu nguồn');

    await page.locator('.vwi-stepper__step').nth(3).click();
    const confirmFirstRow = page.locator('.vwi-candidate-row').filter({ hasText: 'synthetic-01 edited' });
    await confirmFirstRow.locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Xác nhận 1 bản nháp' }).click();
    const confirmDialog = page.getByRole('dialog', { name: 'Xác nhận tạo bản nháp?' });
    await confirmDialog.waitFor();
    await confirmDialog.getByText('Thao tác này tạo Vocabulary Draft, chưa xuất bản cho học viên.').waitFor();
    const focusedDialogId = await page.evaluate(() => document.activeElement.closest('dialog')?.getAttribute('aria-labelledby'));
    assert.equal(focusedDialogId, 'vwi-confirm-dialog-title', 'native dialog moves keyboard focus inside the modal');
    await page.keyboard.press('Escape');
    await confirmDialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Xác nhận 1 bản nháp' }).click();
    await confirmDialog.getByRole('button', { name: 'Quay lại' }).click();
    await page.getByRole('button', { name: 'Xác nhận 1 bản nháp' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm bản nháp' }).click();
    await page.getByText(/API trả về 1 kết quả/).waitFor();
    await page.locator('.vwi-candidate-row').filter({ hasText: 'synthetic-01 edited' }).getByText('Đã tạo bản nháp', { exact: true }).waitFor();
    assert.equal(candidates[0].publicationStatus, 'NOT_ELIGIBLE');
    assert.ok(!await page.getByText('Đã xuất bản', { exact: true }).count(), 'Draft state must never be labelled Published');

    await page.locator('.vwi-stepper__step').nth(2).click();
    await page.getByRole('button', { name: 'Trang sau' }).click();
    const twentyFirstRow = page.locator('.vwi-candidate-row').filter({ hasText: 'synthetic-21' });
    await twentyFirstRow.locator('.vwi-candidate-open').click();
    const twentyFirstWorkbench = page.locator('.vwi-workbench');
    await twentyFirstWorkbench.getByRole('button', { name: 'Duyệt candidate' }).click();
    await page.getByRole('status').filter({ hasText: 'Candidate đã được duyệt' }).waitFor();
    await page.locator('.vwi-stepper__step').nth(3).click();
    const approvedTwentyFirstRow = page.locator('.vwi-candidate-row').filter({ hasText: 'synthetic-21' });
    await approvedTwentyFirstRow.locator('input[type="checkbox"]').check();
    mockState.loseNextConfirm = true;
    await page.getByRole('button', { name: 'Xác nhận 1 bản nháp' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm bản nháp' }).click();
    await page.getByText(/Chưa xác định được Confirm có hoàn tất hay không/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Xác nhận 1 bản nháp' }).isDisabled(), true, 'a lost response blocks another confirmation');
    assert.equal(mockState.confirms.length, 2, 'no automatic second Confirm request was sent');
    await page.locator('.vwi-batch-footer').getByRole('button', { name: 'Tải lại trạng thái' }).click();
    await page.getByText('Đã tải lại batch. Hãy chọn lại candidate chưa tạo Draft sau khi kiểm tra trạng thái mới.').waitFor();
    assert.equal(await page.locator('.vwi-candidate-row input[type="checkbox"]:checked').count(), 0, 'recovery clears stale selection');
    assert.equal(candidates[20].importStatus, 'IMPORTED_AS_DRAFT');

    const storedId = batchId;
    await page.reload();
    assert.equal(await page.locator('.vwi-recovery-card input').inputValue(), storedId, 'the most recent Batch ID survives page reload');
    await page.getByRole('button', { name: 'Mở batch' }).click();
    await page.getByRole('status').filter({ hasText: 'Đã mở batch đã lưu' }).waitFor();
    await page.locator('.vwi-batch-footer').getByRole('button', { name: 'Batch khác' }).click();
    await input.setInputFiles(validFiles);
    await page.locator('.vwi-field--source input').fill('TOEIC EASY START');
    await page.getByRole('button', { name: 'Tạo batch & xem trước' }).click();
    await page.getByRole('status').filter({ hasText: 'Batch đã tồn tại; đã khôi phục trạng thái' }).waitFor();
    assert.equal(mockState.uploads, 3);
    await page.setViewportSize({ width: 390, height: 844 });
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    assert.ok(dimensions.width <= dimensions.viewport + 1, `mobile layout must reflow without horizontal overflow (${dimensions.width}/${dimensions.viewport})`);
    assert.deepEqual(pageErrors, [], 'fixture should not emit uncaught page errors');

    const formDataCheck = mockState.lastUploadType.startsWith('multipart/form-data; boundary=');
    assert.equal(formDataCheck, true);
    process.stdout.write(JSON.stringify({
      suite: 'mock-browser', result: 'PASS', scenarios: [
        'invalid extension/MIME', 'five-file and 10 MiB/file and 25 MiB/batch limits', 'failed upload retry keeps file and source form state', 'multi-source upload and idempotent batch reuse',
        'search/filter/server pagination', 'controlled edit for senses/examples/notes', 'validation and conflict recovery',
        'approve/reject and KEEP_SEPARATE', 'edit after approval resets review and duplicate decision', 'audit timeline', 'Confirm Draft with accessible dialog',
        'lost response blocks retry and batch reload reconciles', 'Batch ID recovery after reload', 'mobile reflow',
      ], uploadRequests: mockState.uploads, patchRequests: mockState.patches.length, reviewRequests: mockState.reviews.length,
      confirmRequests: mockState.confirms.length, viewport: dimensions,
    }, null, 2) + '\n');
    await context.close();
  } finally {
    if (browser) await browser.close();
    vite.kill();
    if (vite.exitCode === null) await new Promise((resolve) => { vite.once('exit', resolve); setTimeout(resolve, 3000); });
    if (vite.exitCode && vite.exitCode !== 0) process.stderr.write(viteOutput);
  }
}

main().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
