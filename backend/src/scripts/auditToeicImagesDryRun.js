import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import mongoose from 'mongoose';
import Assessment from '../models/Assessment.js';
import Question from '../models/Question.js';
import QuestionGroup from '../models/QuestionGroup.js';

// Read-only audit. It never writes MongoDB, changes media, uploads, or deletes files.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(backendRoot, '..');
const reportDirectory = path.join(repositoryRoot, 'reports');
const ocrCacheDirectory = path.join('/private/tmp', 'toeic-image-audit-ocr-cache');
const PARTS = [1, 2, 3, 4, 5, 6, 7];
const MAX_BYTES = 20 * 1024 * 1024;
const BRAND_PATTERN = /\b(?:zen\s*lish|zenlish|zenlish\s*toeic|english\s*center|trung\s*tam\s*anh\s*ngu)\b/i;
const URL_BRAND_PATTERN = /zenlish/i;

const clean = (value) => typeof value === 'string' ? value.trim() : '';
const unique = (values) => [...new Set(values.filter(Boolean))];
const display = (value) => String(value || '').replaceAll('|', '\\|').replaceAll('\n', ' ').replace(/\s+/g, ' ').trim();
const truncate = (value, maximum = 240) => value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value;

function publicUploadPath(url) {
  const value = clean(url);
  if (!value.startsWith('/uploads/')) return null;
  const candidate = path.resolve(backendRoot, value.slice(1));
  const uploadsRoot = path.resolve(backendRoot, 'uploads');
  return candidate.startsWith(`${uploadsRoot}${path.sep}`) ? candidate : null;
}

async function readImage(url) {
  const localPath = publicUploadPath(url);
  if (localPath) {
    try {
      const buffer = await fs.readFile(localPath);
      return { ok: true, source: 'local', buffer, mime: '', bytes: buffer.byteLength, localPath };
    } catch (error) {
      return { ok: false, source: 'local', code: 'LOCAL_FILE_MISSING', error: error.code || error.message, localPath };
    }
  }
  if (!/^https?:\/\//i.test(url)) return { ok: false, source: 'unknown', code: 'UNSUPPORTED_URL', error: 'Only local /uploads paths and HTTP(S) URLs can be audited.' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    const contentType = clean(response.headers.get('content-type'));
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (!response.ok) return { ok: false, source: 'remote', code: `HTTP_${response.status}`, error: response.statusText, mime: contentType };
    if (contentLength > MAX_BYTES) return { ok: false, source: 'remote', code: 'TOO_LARGE', error: `${contentLength} bytes exceeds ${MAX_BYTES}.`, mime: contentType };
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) return { ok: false, source: 'remote', code: 'TOO_LARGE', error: `${buffer.byteLength} bytes exceeds ${MAX_BYTES}.`, mime: contentType };
    if (!/^image\//i.test(contentType)) return { ok: false, source: 'remote', code: 'NOT_IMAGE_CONTENT_TYPE', error: contentType || 'No image content type.', mime: contentType, bytes: buffer.byteLength };
    return { ok: true, source: 'remote', buffer, mime: contentType, bytes: buffer.byteLength };
  } catch (error) {
    return { ok: false, source: 'remote', code: error.name === 'AbortError' ? 'FETCH_TIMEOUT' : 'FETCH_FAILED', error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

function parseTsv(tsv) {
  return String(tsv || '').split(/\r?\n/).slice(1).map((line) => {
    const [level, page, block, paragraph, lineNumber, wordNumber, left, top, width, height, confidence, ...textParts] = line.split('\t');
    const text = textParts.join('\t').trim();
    return { level: Number(level), page: Number(page), block: Number(block), paragraph: Number(paragraph), line: Number(lineNumber), word: Number(wordNumber), left: Number(left), top: Number(top), width: Number(width), height: Number(height), confidence: Number(confidence), text };
  }).filter((word) => word.level === 5 && word.text);
}

function wordsFromBlocks(blocks) {
  const words = [];
  for (const block of blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        for (const word of line.words || []) {
          const bbox = word.bbox || {};
          words.push({
            text: clean(word.text), confidence: Math.round(Number(word.confidence) || 0),
            left: Number(bbox.x0) || 0, top: Number(bbox.y0) || 0,
            width: Math.max(0, (Number(bbox.x1) || 0) - (Number(bbox.x0) || 0)),
            height: Math.max(0, (Number(bbox.y1) || 0) - (Number(bbox.y0) || 0)),
          });
        }
      }
    }
  }
  return words.filter((word) => word.text);
}

async function createOcrWorker() {
  const requireFromFrontend = createRequire(path.join(repositoryRoot, 'frontend/package.json'));
  const { createWorker } = requireFromFrontend('tesseract.js');
  await fs.mkdir(ocrCacheDirectory, { recursive: true });
  return createWorker('eng', 1, { cachePath: ocrCacheDirectory, gzip: true });
}

async function ocrImage(worker, buffer) {
  try {
    const result = await worker.recognize(buffer, {}, { text: true, blocks: true });
    const words = wordsFromBlocks(result.data.blocks);
    const meaningfulWords = words.filter((word) => word.confidence >= 40 && /[A-Za-z0-9]/.test(word.text));
    const brandWords = words.filter((word) => BRAND_PATTERN.test(word.text));
    const averageConfidence = meaningfulWords.length
      ? Math.round(meaningfulWords.reduce((total, word) => total + word.confidence, 0) / meaningfulWords.length)
      : 0;
    return {
      state: 'completed',
      text: clean(result.data.text),
      confidence: Number.isFinite(result.data.confidence) ? Math.round(result.data.confidence) : averageConfidence,
      averageWordConfidence: averageConfidence,
      words: meaningfulWords.slice(0, 80),
      brandWords,
    };
  } catch (error) {
    return { state: 'failed', error: error.message, text: '', confidence: 0, averageWordConfidence: 0, words: [], brandWords: [] };
  }
}

function assessmentLabel(assessment) {
  return assessment ? `${assessment.title} (${assessment.status})` : 'Nhóm/câu hỏi TOEIC chưa liên kết Assessment';
}

function referenceLabel(reference) {
  const base = `${reference.assessmentTitle} · Part ${reference.partNumber}`;
  if (reference.kind === 'question') return `${base} · Câu ${reference.questionNumber}`;
  const questionNumbers = reference.questionNumbers.length ? ` · Câu ${reference.questionNumbers.join(', ')}` : '';
  return `${base} · Nhóm ${reference.groupId}${reference.passageIndex === null ? '' : ` · Passage ${reference.passageIndex + 1}`}${questionNumbers}`;
}

function permissionSummary(references) {
  const licenses = unique(references.flatMap((reference) => reference.imageLicenses || []));
  const explicitEditPermission = references.some((reference) => reference.explicitEditPermission === true);
  return { licenses, explicitEditPermission };
}

function classify(row) {
  if (!row.fetch.ok) return { status: 'Cần kiểm tra thủ công', reason: row.fetch.code };
  if (row.ocr.state !== 'completed') return { status: 'Cần kiểm tra thủ công', reason: 'OCR_FAILED' };
  if (row.brandDetections.length || URL_BRAND_PATTERN.test(row.url)) return { status: 'Cần kiểm tra: dấu hiệu thương hiệu', reason: row.brandDetections.length ? 'OCR_BRAND_TEXT' : 'BRAND_IN_SOURCE_URL' };
  const lowConfidenceText = row.ocr.words.length >= 3 && row.ocr.averageWordConfidence < 55;
  if (lowConfidenceText) return { status: 'Cần kiểm tra thủ công', reason: 'OCR_LOW_CONFIDENCE' };
  return { status: 'Hiển thị hợp lệ, chưa kết luận quyền sử dụng', reason: row.ocr.words.length ? 'NO_BRAND_DETECTED' : 'NO_TEXT_DETECTED' };
}

function markdownReport(report) {
  const rows = report.images.map((image, index) => {
    const ocrWords = image.ocr.words.slice(0, 24).map((word) => `${word.text} (${word.confidence}%, x:${word.left}, y:${word.top}, w:${word.width}, h:${word.height})`).join('; ');
    const brands = image.brandDetections.map((word) => `${word.text} (${word.confidence}%, x:${word.left}, y:${word.top}, w:${word.width}, h:${word.height})`).join('; ');
    return `| ${index + 1} | ${display(image.url)} | ${display(image.classification.status)} | ${display(image.classification.reason)} | ${display(brands || '—')} | ${display(truncate(image.ocr.text || image.ocr.error || '—'))} | ${display(ocrWords || '—')} | ${display(image.references.map(referenceLabel).join('<br>'))} |`;
  }).join('\n');
  return `# Báo cáo dry-run ảnh TOEIC Part 1–7\n\n` +
`- Thời điểm: ${report.generatedAt}\n` +
`- Chế độ: chỉ đọc MongoDB và media; không upload, không cập nhật URL, không xuất bản, không xóa/chỉnh sửa ảnh gốc.\n` +
`- Phạm vi MongoDB: ${report.scope.assessmentCount} assessment TOEIC, ${report.scope.groupCount} question group và ${report.scope.questionCount} question Part 1–7.\n` +
`- HTML import trong working tree: ${report.scope.htmlFiles.length ? report.scope.htmlFiles.join(', ') : 'Không có HTML đề thi nguồn; chỉ có HTML ứng dụng/fixture không chứa đề thi.'}\n\n` +
`## Tổng hợp\n\n` +
`| Chỉ số | Số lượng |\n| --- | ---: |\n` +
Object.entries(report.summary).map(([key, value]) => `| ${key} | ${value} |`).join('\n') +
`\n\n## Nguyên tắc phân loại\n\n` +
`- “Hiển thị hợp lệ…” chỉ xác nhận URL tải được và OCR không phát hiện thương hiệu; không phải xác nhận bản quyền.\n` +
`- “Cần kiểm tra: dấu hiệu thương hiệu” là OCR phát hiện tên thương hiệu, hoặc URL nguồn chứa zenlish; URL là chỉ báo nguồn mạnh nhưng không tự khẳng định watermark nhìn thấy trong ảnh.\n` +
`- “Cần kiểm tra thủ công” áp dụng khi file không tải được, không phải ảnh, OCR lỗi hoặc OCR có chữ nhưng độ tin cậy thấp.\n` +
`- Không có ảnh nào được coi là “được phép chỉnh sửa” vì dữ liệu hiện không lưu xác nhận quyền chỉnh sửa riêng biệt.\n\n` +
`## Danh mục URL và liên kết câu hỏi\n\n` +
`| # | Media URL | Phân loại | Lý do | Dấu hiệu thương hiệu + vị trí | Văn bản OCR | Từ OCR (độ tin cậy, vị trí) | Câu hỏi/nhóm liên quan |\n| ---: | --- | --- | --- | --- | --- | --- | --- |\n${rows}\n\n` +
`## Hành động đề xuất (không thực hiện trong dry-run)\n\n` +
`1. Xác minh quyền sử dụng và quyền chỉnh sửa cho từng ảnh cần kiểm tra, đặc biệt 33 URL nguồn Zenlish và các trang PDF cục bộ bị thiếu.\n` +
`2. Khi có văn bản cho phép chỉnh sửa, tạo bản dẫn xuất riêng, giữ nguyên bản gốc, rồi kiểm tra lại OCR và ảnh hưởng đến đáp án trước khi upload.\n` +
`3. Chỉ sau phê duyệt mới upload storage, cập nhật trường URL tương ứng và kiểm tra hiển thị ở trang làm bài/quản trị; không xuất bản tự động.\n`;
}

async function discoverHtmlFiles() {
  const candidates = [path.join(repositoryRoot, 'frontend', 'index.html')];
  const result = [];
  for (const file of candidates) {
    try {
      const content = await fs.readFile(file, 'utf8');
      if (/\$testParts|stm-quizzes|zenlish/i.test(content)) result.push(path.relative(repositoryRoot, file));
    } catch { /* Report absence rather than creating or changing anything. */ }
  }
  return result;
}

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required for this read-only audit.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
  try {
    const assessments = await Assessment.find({ examFormat: 'toeic' }).select('title status questionGroups').lean();
    const assessmentByGroupId = new Map();
    assessments.forEach((assessment) => (assessment.questionGroups || []).forEach((id) => assessmentByGroupId.set(String(id), assessment)));
    const groupIds = [...assessmentByGroupId.keys()];
    const [groups, questions] = await Promise.all([
      QuestionGroup.find({ _id: { $in: groupIds } }).select('+sourceMetadata assessment partNumber imageUrl imageUrls passages questionIds').lean(),
      Question.find({ toeicPart: { $in: PARTS } }).select('+sourceMetadata questionGroup toeicPart questionNumber imageUrl sourceProvider sourceLabel sourceUrl').lean(),
    ]);
    const questionsByGroupId = new Map();
    questions.forEach((question) => {
      const key = String(question.questionGroup || '');
      if (!questionsByGroupId.has(key)) questionsByGroupId.set(key, []);
      questionsByGroupId.get(key).push(question);
    });
    const records = new Map();
    const addReference = (url, reference) => {
      if (!clean(url)) return;
      if (!records.has(url)) records.set(url, { url, references: [] });
      records.get(url).references.push(reference);
    };
    questions.forEach((question) => {
      if (!clean(question.imageUrl)) return;
      const assessment = assessmentByGroupId.get(String(question.questionGroup || ''));
      const metadata = question.sourceMetadata || {};
      addReference(question.imageUrl, {
        kind: 'question', assessmentTitle: assessmentLabel(assessment), partNumber: question.toeicPart, questionNumber: question.questionNumber,
        groupId: String(question.questionGroup || 'unassigned'), questionNumbers: [question.questionNumber], passageIndex: null,
        imageLicenses: [clean(metadata.imageLicense)], explicitEditPermission: metadata.imageEditPermission === true,
      });
    });
    groups.forEach((group) => {
      const assessment = assessmentByGroupId.get(String(group._id));
      const groupQuestions = questionsByGroupId.get(String(group._id)) || [];
      const common = {
        kind: 'group', assessmentTitle: assessmentLabel(assessment), partNumber: group.partNumber, groupId: String(group._id),
        questionNumbers: unique(groupQuestions.map((question) => question.questionNumber).filter(Number.isFinite)).sort((a, b) => a - b),
        imageLicenses: [clean(group.sourceMetadata?.imageLicense)], explicitEditPermission: group.sourceMetadata?.imageEditPermission === true,
      };
      unique([group.imageUrl, ...(group.imageUrls || [])]).forEach((url) => addReference(url, { ...common, passageIndex: null }));
      (group.passages || []).forEach((passage, passageIndex) => unique([passage.imageUrl, ...(passage.imageUrls || [])]).forEach((url) => addReference(url, { ...common, passageIndex })));
    });
    let worker;
    let workerStartupError = '';
    try { worker = await createOcrWorker(); } catch (error) { workerStartupError = error.message; }
    const images = [];
    for (const record of [...records.values()].sort((left, right) => left.url.localeCompare(right.url))) {
      const fetchResult = await readImage(record.url);
      const ocr = fetchResult.ok
        ? worker ? await ocrImage(worker, fetchResult.buffer) : { state: 'failed', error: `OCR worker unavailable: ${workerStartupError}`, text: '', confidence: 0, averageWordConfidence: 0, words: [], brandWords: [] }
        : { state: 'not-run', error: '', text: '', confidence: 0, averageWordConfidence: 0, words: [], brandWords: [] };
      const brandDetections = ocr.brandWords;
      const image = {
        url: record.url, fetch: { ...fetchResult, buffer: undefined }, ocr, brandDetections,
        permissions: permissionSummary(record.references), references: record.references,
      };
      image.classification = classify(image);
      images.push(image);
    }
    if (worker) await worker.terminate();
    const summary = {
      'Ảnh URL duy nhất đã quét': images.length,
      'Lượt tham chiếu ảnh': images.reduce((total, image) => total + image.references.length, 0),
      'Tải được': images.filter((image) => image.fetch.ok).length,
      'Không tải được / file thiếu': images.filter((image) => !image.fetch.ok).length,
      'OCR hoàn tất': images.filter((image) => image.ocr.state === 'completed').length,
      'Tên trung tâm được OCR xác nhận': images.filter((image) => image.brandDetections.length > 0).length,
      'Dấu hiệu Zenlish từ URL nguồn (cần kiểm tra)': images.filter((image) => URL_BRAND_PATTERN.test(image.url)).length,
      'Được phép chỉnh sửa (xác nhận riêng trong dữ liệu)': images.filter((image) => image.permissions.explicitEditPermission).length,
      'Hiển thị hợp lệ, chưa kết luận quyền sử dụng': images.filter((image) => image.classification.status.startsWith('Hiển thị hợp lệ')).length,
      'Cần kiểm tra dấu hiệu thương hiệu': images.filter((image) => image.classification.status.includes('dấu hiệu thương hiệu')).length,
      'Cần thay thế hoặc kiểm tra thủ công': images.filter((image) => image.classification.status === 'Cần kiểm tra thủ công').length,
    };
    const report = {
      generatedAt: new Date().toISOString(), dryRun: true,
      scope: { assessmentCount: assessments.length, groupCount: groups.length, questionCount: questions.length, htmlFiles: await discoverHtmlFiles() },
      summary, images,
    };
    await fs.mkdir(reportDirectory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(reportDirectory, `toeic-image-audit-dry-run-${stamp}.json`);
    const markdownPath = path.join(reportDirectory, `toeic-image-audit-dry-run-${stamp}.md`);
    await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    await fs.writeFile(markdownPath, markdownReport(report));
    console.log(JSON.stringify({ dryRun: true, summary, jsonPath, markdownPath }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(`TOEIC image audit failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
