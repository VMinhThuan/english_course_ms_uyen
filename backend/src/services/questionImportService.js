import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Question from '../models/Question.js';
import QuestionImportBatch from '../models/QuestionImportBatch.js';
import QuestionImportRow from '../models/QuestionImportRow.js';
import {
  fingerprintImportValues,
  parseToeicPart5Xlsx,
  validateImportValues,
} from './toeicPart5XlsxParser.js';

const OPERATION_LEASE_MS = 2 * 60 * 1000;
const ROW_LEASE_MS = 2 * 60 * 1000;
const MAX_DUPLICATE_BANK_SCAN = 50_000;
const DYNAMIC_DUPLICATE_ISSUES = new Set([
  'DUPLICATE_IN_WORKBOOK',
  'WORKBOOK_CONTENT_CONFLICT',
  'DUPLICATE_IN_BANK',
  'BANK_CONTENT_CONFLICT',
  'DUPLICATE_IN_PRIOR_BATCH',
  'PRIOR_BATCH_CONTENT_CONFLICT',
]);
const EDITABLE_FIELD_KEYS = ['questionText', 'optionA', 'optionB', 'optionC', 'optionD', 'correctAnswer', 'explanation'];

export class QuestionImportServiceError extends Error {
  constructor(code, message, statusCode = 400, data = undefined) {
    super(message);
    this.name = 'QuestionImportServiceError';
    this.code = code;
    this.statusCode = statusCode;
    this.data = data;
  }
}

const fail = (code, message, statusCode = 400, data) => {
  throw new QuestionImportServiceError(code, message, statusCode, data);
};

let indexSetupPromise;
const ensureImportIndexes = async () => {
  if (!indexSetupPromise) {
    indexSetupPromise = Promise.all([
      QuestionImportBatch.collection.createIndex({ fileSha256: 1 }, { unique: true, name: 'uniq_question_import_file_sha256' }),
      QuestionImportRow.collection.createIndex({ batchId: 1, rowNumber: 1 }, { unique: true, name: 'uniq_question_import_batch_row' }),
      QuestionImportRow.collection.createIndex({ stemFingerprint: 1, batchId: 1 }),
      QuestionImportRow.collection.createIndex({ stemFingerprint: 1, importState: 1 }),
      Question.collection.createIndex(
        { importStemOptionsFingerprint: 1 },
        { unique: true, sparse: true, name: 'uniq_question_import_stem_options_fingerprint' }
      ),
    ]).catch((error) => {
      indexSetupPromise = null;
      throw error;
    });
  }
  await indexSetupPromise;
};

const asPlainValues = (values) => ({
  questionText: String(values?.questionText ?? ''),
  options: Array.isArray(values?.options)
    ? values.options.map((option) => ({ id: String(option?.id ?? ''), text: String(option?.text ?? '') }))
    : [],
  correctAnswers: Array.isArray(values?.correctAnswers) ? values.correctAnswers.map((answer) => String(answer)) : [],
  explanation: String(values?.explanation ?? ''),
});

const questionToImportValues = (question) => {
  const labels = ['A', 'B', 'C', 'D'];
  const options = Array.isArray(question.options) ? question.options : [];
  const ids = options.map((option) => String(option?.id ?? ''));
  const correctAnswers = Array.isArray(question.correctAnswers) ? question.correctAnswers : [];
  const answerLabels = correctAnswers.map((answer) => {
    const index = ids.indexOf(String(answer));
    return index >= 0 && labels[index] ? labels[index] : String(answer);
  });
  return {
    questionText: String(question.questionText ?? ''),
    options: labels.map((id, index) => ({ id, text: String(options[index]?.text ?? '') })),
    correctAnswers: answerLabels,
    explanation: String(question.explanation ?? ''),
  };
};

const findPart5Questions = async () => {
  const count = await Question.countDocuments({ toeicPart: 5 });
  if (count > MAX_DUPLICATE_BANK_SCAN) {
    fail('DUPLICATE_SCAN_LIMIT', 'Part 5 bank exceeds the safe duplicate scan limit; import was not confirmed.', 503);
  }
  return Question.find({ toeicPart: 5 })
    .select('questionText options correctAnswers explanation status importBatchId importRowNumber')
    .lean();
};

const findPriorImportedRows = async (rows, excludeBatchId = null) => {
  const stemFingerprints = [...new Set(rows.filter((row) => row.status !== 'INVALID').map((row) => row.stemFingerprint))];
  if (stemFingerprints.length === 0) return [];
  const filter = { stemFingerprint: { $in: stemFingerprints }, importState: 'IMPORTED' };
  if (excludeBatchId) filter.batchId = { $ne: excludeBatchId };
  const matches = await QuestionImportRow.find(filter)
    .select('batchId rowNumber values stemFingerprint stemOptionsFingerprint contentFingerprint importState')
    .limit(MAX_DUPLICATE_BANK_SCAN + 1)
    .lean();
  if (matches.length > MAX_DUPLICATE_BANK_SCAN) {
    fail('DUPLICATE_SCAN_LIMIT', 'Prior import history exceeds the safe duplicate scan limit; import was not confirmed.', 503);
  }
  return matches;
};

const addIssue = (row, issue) => {
  if (!row.issues.some((current) => current.code === issue.code && current.field === issue.field && current.message === issue.message)) {
    row.issues.push(issue);
  }
};

const markReview = (row, issue) => {
  if (row.status !== 'INVALID' && row.status !== 'DUPLICATE') row.status = 'NEEDS_REVIEW';
  addIssue(row, issue);
};

const markDuplicate = (row, issue, duplicateOfRowNumber = null) => {
  if (row.status === 'INVALID') return;
  row.status = 'DUPLICATE';
  row.importState = row.importState === 'IMPORTED' ? 'IMPORTED' : 'DUPLICATE';
  row.duplicateOfRowNumber = duplicateOfRowNumber;
  addIssue(row, issue);
};

const editedSourceField = (row, field) => {
  const edited = new Set(row.editedFields || []);
  if (field.startsWith('option')) return edited.has('options') || edited.has(field);
  if (field === 'correctAnswer') return edited.has('correctAnswers') || edited.has('correctAnswer');
  return edited.has(field);
};

const allSourceFieldsEdited = (row) => EDITABLE_FIELD_KEYS.every((field) => editedSourceField(row, field));

const sourceIssuesForValidation = (row) => (row.sourceIssues || []).filter((issue) => {
  if (DYNAMIC_DUPLICATE_ISSUES.has(issue.code)) return false;
  if (!['HEADER_NOT_FOUND', 'BLANK_ROW'].includes(issue.code) && editedSourceField(row, issue.field)) return false;
  if (['HEADER_NOT_FOUND', 'BLANK_ROW'].includes(issue.code) && allSourceFieldsEdited(row)) return false;
  return true;
});

const rowValuesFingerprint = (row) => fingerprintImportValues(asPlainValues(row.values));

const compareContent = (left, right) => {
  const a = rowValuesFingerprint(left);
  const b = rowValuesFingerprint(right);
  if (a.stemFingerprint !== b.stemFingerprint) return 'DIFFERENT';
  if (a.stemOptionsFingerprint !== b.stemOptionsFingerprint) return 'SAME_STEM_DIFFERENT_OPTIONS';
  return a.contentFingerprint === b.contentFingerprint ? 'EXACT' : 'SAME_STEM_OPTIONS_CONFLICT';
};

const isCandidateRow = (row) => row.status !== 'INVALID' && row.importState !== 'IMPORTED';

const classifyRows = (rows, bankQuestions, priorImportedRows = []) => {
  const ordered = [...rows].sort((left, right) => left.rowNumber - right.rowNumber);
  const byStem = new Map();

  for (const row of ordered) {
    if (row.importState === 'IMPORTED') continue;
    const values = asPlainValues(row.values);
    const validation = validateImportValues(values, {
      formulaFields: (row.formulaFields || []).filter((field) => !editedSourceField(row, field)),
      sourceIssues: sourceIssuesForValidation(row),
    });
    row.values = values;
    row.issues = validation.issues;
    row.status = validation.status;
    row.duplicateOfRowNumber = null;
    Object.assign(row, fingerprintImportValues(values));
    if (row.status === 'VALID' && ['DUPLICATE', 'SKIPPED'].includes(row.importState)) row.importState = 'PENDING';
    if (row.status === 'INVALID') continue;
    const rowsForStem = byStem.get(row.stemFingerprint) || [];
    rowsForStem.push(row);
    byStem.set(row.stemFingerprint, rowsForStem);
  }

  for (const rowsForStem of byStem.values()) {
    if (rowsForStem.length < 2) continue;
    const canonical = rowsForStem[0];
    for (const current of rowsForStem.slice(1)) {
      const comparison = compareContent(canonical, current);
      if (comparison === 'EXACT') {
        markDuplicate(current, {
          code: 'DUPLICATE_IN_WORKBOOK',
          field: 'questionText',
          severity: 'warning',
          message: `This row duplicates worksheet row ${canonical.rowNumber}.`,
        }, canonical.rowNumber);
      } else {
        const message = comparison === 'SAME_STEM_DIFFERENT_OPTIONS'
          ? `This stem conflicts with worksheet row ${canonical.rowNumber}; options differ.`
          : `This stem/options conflict with worksheet row ${canonical.rowNumber}; answer or explanation differs.`;
        const code = 'WORKBOOK_CONTENT_CONFLICT';
        markReview(canonical, { code, field: 'questionText', severity: 'warning', message });
        markReview(current, { code, field: 'questionText', severity: 'warning', message });
      }
    }
  }

  const bankByStem = new Map();
  for (const question of bankQuestions) {
    const values = questionToImportValues(question);
    const key = fingerprintImportValues(values).stemFingerprint;
    const matches = bankByStem.get(key) || [];
    matches.push({ question, values });
    bankByStem.set(key, matches);
  }

  const priorByStem = new Map();
  for (const priorRow of priorImportedRows) {
    const values = asPlainValues(priorRow.values);
    const key = priorRow.stemFingerprint || fingerprintImportValues(values).stemFingerprint;
    const matches = priorByStem.get(key) || [];
    matches.push({ priorRow, values });
    priorByStem.set(key, matches);
  }

  for (const row of ordered) {
    if (!isCandidateRow(row)) continue;
    const matches = priorByStem.get(row.stemFingerprint) || [];
    for (const match of matches) {
      const comparison = compareContent(row, { values: match.values, rowNumber: match.priorRow.rowNumber, editedFields: [], formulaFields: [], sourceIssues: [], issues: [], status: 'VALID' });
      if (comparison === 'EXACT') {
        markDuplicate(row, {
          code: 'DUPLICATE_IN_PRIOR_BATCH',
          field: 'questionText',
          severity: 'warning',
          message: 'An identical Question was already imported from an earlier batch; this row will be skipped.',
        });
        break;
      }
      markReview(row, {
        code: 'PRIOR_BATCH_CONTENT_CONFLICT',
        field: 'questionText',
        severity: 'warning',
        message: 'An earlier imported batch contains the same stem with different options, answer, or explanation.',
      });
    }
  }

  for (const row of ordered) {
    if (!isCandidateRow(row)) continue;
    const matches = bankByStem.get(row.stemFingerprint) || [];
    let exactMatch = null;
    let conflict = false;
    for (const match of matches) {
      if (String(match.question.importBatchId || '') === String(row.batchId || '')
        && Number(match.question.importRowNumber) === Number(row.rowNumber)) continue;
      const comparison = compareContent(row, { values: match.values, rowNumber: -1, editedFields: [], formulaFields: [], sourceIssues: [], issues: [], status: 'VALID' });
      if (comparison === 'EXACT') exactMatch = match.question;
      else conflict = true;
    }
    if (exactMatch) {
      markDuplicate(row, {
        code: 'DUPLICATE_IN_BANK',
        field: 'questionText',
        severity: 'warning',
        message: 'An identical Part 5 Question already exists in the bank; it will be skipped.',
      });
    } else if (conflict) {
      markReview(row, {
        code: 'BANK_CONTENT_CONFLICT',
        field: 'questionText',
        severity: 'warning',
        message: 'A Part 5 Question with the same normalized stem already exists; review its options, answer, and explanation.',
      });
    }
  }

  for (const row of ordered) {
    if (row.importState === 'IMPORTED') continue;
    if (row.status === 'DUPLICATE') row.importState = 'DUPLICATE';
    else if (row.importState === 'FAILED' && row.status !== 'VALID') row.importState = 'PENDING';
  }

  return ordered;
};

const countBatchRows = async (batchId) => {
  const rows = await QuestionImportRow.find({ batchId }).select('status importState').lean();
  const rowCounts = { valid: 0, invalid: 0, duplicate: 0, needsReview: 0 };
  const resultCounts = { imported: 0, failed: 0 };
  for (const row of rows) {
    if (row.status === 'VALID') rowCounts.valid += 1;
    if (row.status === 'INVALID') rowCounts.invalid += 1;
    if (row.status === 'DUPLICATE') rowCounts.duplicate += 1;
    if (row.status === 'NEEDS_REVIEW') rowCounts.needsReview += 1;
    if (row.importState === 'IMPORTED') resultCounts.imported += 1;
    if (row.importState === 'FAILED') resultCounts.failed += 1;
  }
  return { rowCounts, resultCounts, totalRows: rows.length };
};

const persistBatchCounts = async (batchId) => {
  const counts = await countBatchRows(batchId);
  await QuestionImportBatch.updateOne({ _id: batchId }, { $set: counts });
  return counts;
};

const batchDetail = async (batch, { inProgress = false } = {}) => {
  const rows = await QuestionImportRow.find({ batchId: batch._id }).sort({ rowNumber: 1 }).lean();
  return { batch: batch.toObject ? batch.toObject() : batch, rows, inProgress };
};

const issueSafeError = (error) => {
  const code = typeof error?.code === 'string' ? error.code.slice(0, 80) : 'IMPORT_OPERATION_FAILED';
  return { code, message: 'The operation failed. Retry this batch to recover or inspect the row result.' };
};

const setPreviewRows = async (batchId, rows) => {
  if (rows.length > 0) {
    await QuestionImportRow.bulkWrite(rows.map((row) => ({
      updateOne: {
        filter: { batchId, rowNumber: row.rowNumber },
        update: { $setOnInsert: { ...row, batchId } },
        upsert: true,
      },
    })), { ordered: true });
  }
  const counts = await persistBatchCounts(batchId);
  return counts;
};

export const createQuestionImportPreview = async ({ buffer, originalFileName, actorId }) => {
  await ensureImportIndexes();
  const parsed = await parseToeicPart5Xlsx({ buffer, originalFileName });
  const bankQuestions = await findPart5Questions();
  let rows = parsed.rows.map((row) => ({ ...row, batchId: null, editedFields: [], importState: 'PENDING' }));
  const priorImportedRows = await findPriorImportedRows(rows);
  rows = classifyRows(rows, bankQuestions, priorImportedRows);

  let batch = await QuestionImportBatch.findOne({ fileSha256: parsed.fileSha256 });
  if (batch && batch.state !== 'PREVIEW_FAILED' && batch.state !== 'PREVIEW_BUILDING') {
    return { ...(await batchDetail(batch)), reused: true };
  }
  if (batch && batch.state === 'PREVIEW_BUILDING') {
    const now = new Date();
    if (batch.activeOperationUntil > now) return { ...(await batchDetail(batch, { inProgress: true })), reused: true };
    const claimed = await QuestionImportBatch.findOneAndUpdate({
      _id: batch._id,
      state: 'PREVIEW_BUILDING',
      $or: [{ activeOperationUntil: null }, { activeOperationUntil: { $lte: now } }],
    }, {
      $set: {
        activeOperationToken: crypto.randomUUID(),
        activeOperationUntil: new Date(now.getTime() + OPERATION_LEASE_MS),
      },
    }, { new: true });
    if (!claimed) {
      const existing = await QuestionImportBatch.findOne({ fileSha256: parsed.fileSha256 });
      return { ...(await batchDetail(existing, { inProgress: true })), reused: true };
    }
    batch = claimed;
  }

  if (batch?.state === 'PREVIEW_FAILED') {
    const token = crypto.randomUUID();
    batch = await QuestionImportBatch.findOneAndUpdate(
      { _id: batch._id, state: 'PREVIEW_FAILED' },
      { $set: { state: 'PREVIEW_BUILDING', activeOperationToken: token, activeOperationUntil: new Date(Date.now() + OPERATION_LEASE_MS), lastOperationError: '' } },
      { new: true }
    );
    if (!batch) {
      const existing = await QuestionImportBatch.findOne({ fileSha256: parsed.fileSha256 });
      return { ...(await batchDetail(existing, { inProgress: existing?.state === 'PREVIEW_BUILDING' })), reused: true };
    }
  }

  if (!batch) {
    try {
      batch = await QuestionImportBatch.create({
        fileSha256: parsed.fileSha256,
        sourceFileName: parsed.sourceFileName,
        uploadedBy: actorId,
        sheetName: parsed.sheetName,
        headerRowNumber: parsed.headerRowNumber,
        totalRows: parsed.totalRows,
        state: 'PREVIEW_BUILDING',
        activeOperationToken: crypto.randomUUID(),
        activeOperationUntil: new Date(Date.now() + OPERATION_LEASE_MS),
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const existing = await QuestionImportBatch.findOne({ fileSha256: parsed.fileSha256 });
      return { ...(await batchDetail(existing, { inProgress: existing?.state === 'PREVIEW_BUILDING' })), reused: true };
    }
  }

  try {
    rows = rows.map((row) => ({ ...row, batchId: batch._id }));
    await setPreviewRows(batch._id, rows);
    const latestBankQuestions = await findPart5Questions();
    const persistedRows = await QuestionImportRow.find({ batchId: batch._id }).sort({ rowNumber: 1 });
    const latestPriorImportedRows = await findPriorImportedRows(persistedRows, batch._id);
    classifyRows(persistedRows, latestBankQuestions, latestPriorImportedRows);
    await Promise.all(persistedRows.map((row) => row.save()));
    await persistBatchCounts(batch._id);
    batch = await QuestionImportBatch.findByIdAndUpdate(batch._id, {
      $set: { state: 'PREVIEW_READY', activeOperationToken: '', activeOperationUntil: null, lastOperationError: '' },
    }, { new: true });
    return { ...(await batchDetail(batch)), reused: false };
  } catch (error) {
    await QuestionImportBatch.updateOne({ _id: batch._id }, {
      $set: { state: 'PREVIEW_FAILED', activeOperationToken: '', activeOperationUntil: null, lastOperationError: issueSafeError(error).code },
    }).catch(() => {});
    throw error;
  }
};

export const getQuestionImportPreview = async (batchId) => {
  if (!mongoose.isValidObjectId(batchId)) fail('BATCH_NOT_FOUND', 'Import batch was not found.', 404);
  const batch = await QuestionImportBatch.findById(batchId);
  if (!batch) fail('BATCH_NOT_FOUND', 'Import batch was not found.', 404);
  return batchDetail(batch, { inProgress: batch.state === 'PREVIEW_BUILDING' || batch.state === 'EDITING' || batch.state === 'CONFIRMING' });
};

const acquireBatchOperation = async (batchId, operation) => {
  if (!mongoose.isValidObjectId(batchId)) fail('BATCH_NOT_FOUND', 'Import batch was not found.', 404);
  const now = new Date();
  const token = crypto.randomUUID();
  const batch = await QuestionImportBatch.findOneAndUpdate({
    _id: batchId,
    $or: [
      { state: { $in: ['PREVIEW_READY', 'PARTIALLY_CONFIRMED'] } },
      { state: { $in: ['EDITING', 'CONFIRMING'] }, activeOperationUntil: { $lte: now } },
    ],
  }, {
    $set: {
      state: operation,
      activeOperationToken: token,
      activeOperationUntil: new Date(now.getTime() + OPERATION_LEASE_MS),
      lastOperationError: '',
    },
  }, { new: true });
  if (batch) return { batch, token };

  const existing = await QuestionImportBatch.findById(batchId);
  if (!existing) fail('BATCH_NOT_FOUND', 'Import batch was not found.', 404);
  if (['EDITING', 'CONFIRMING'].includes(existing.state) && existing.activeOperationUntil > now) {
    fail('IMPORT_OPERATION_IN_PROGRESS', 'Another operation is already working on this batch.', 409, { retryAfter: existing.activeOperationUntil });
  }
  if (existing.state === 'CONFIRMED') fail('BATCH_ALREADY_CONFIRMED', 'All eligible rows in this batch have already been processed.', 409);
  fail('BATCH_NOT_EDITABLE', 'This batch is not ready for editing or confirmation.', 409);
};

const renewBatchOperation = async (batchId, token) => {
  const result = await QuestionImportBatch.updateOne({ _id: batchId, activeOperationToken: token }, {
    $set: { activeOperationUntil: new Date(Date.now() + OPERATION_LEASE_MS) },
  });
  if (result.matchedCount !== 1) fail('IMPORT_OPERATION_LEASE_LOST', 'Batch operation lease expired; retry the operation.', 409);
};

const finishBatchOperation = async (batchId, token, state, errorCode = '') => {
  await QuestionImportBatch.updateOne({ _id: batchId, activeOperationToken: token }, {
    $set: {
      state,
      activeOperationToken: '',
      activeOperationUntil: null,
      lastOperationError: errorCode,
    },
  });
};

const stateAfterNonConfirmOperation = async (batchId) => {
  const imported = await QuestionImportRow.countDocuments({ batchId, importState: 'IMPORTED' });
  return imported > 0 ? 'PARTIALLY_CONFIRMED' : 'PREVIEW_READY';
};

const reclassifyBatch = async (batchId) => {
  const rows = await QuestionImportRow.find({ batchId }).sort({ rowNumber: 1 });
  const [bankQuestions, priorImportedRows] = await Promise.all([
    findPart5Questions(),
    findPriorImportedRows(rows, batchId),
  ]);
  classifyRows(rows, bankQuestions, priorImportedRows);
  if (rows.length) await Promise.all(rows.map((row) => row.save()));
  await persistBatchCounts(batchId);
  return rows;
};

const mapEditToSourceFields = (updates) => {
  const fields = [];
  if (Object.prototype.hasOwnProperty.call(updates, 'questionText')) fields.push('questionText');
  if (Object.prototype.hasOwnProperty.call(updates, 'options')) fields.push('options', 'optionA', 'optionB', 'optionC', 'optionD');
  if (Object.prototype.hasOwnProperty.call(updates, 'correctAnswers')) fields.push('correctAnswers', 'correctAnswer');
  if (Object.prototype.hasOwnProperty.call(updates, 'explanation')) fields.push('explanation');
  return fields;
};

export const editQuestionImportRow = async ({ batchId, rowNumber, updates }) => {
  const { batch, token } = await acquireBatchOperation(batchId, 'EDITING');
  let operationError = '';
  let editedRowNumber = rowNumber;
  try {
    const row = await QuestionImportRow.findOne({ batchId: batch._id, rowNumber });
    if (!row) fail('ROW_NOT_FOUND', `Import row ${rowNumber} was not found.`, 404);
    if (row.importState === 'IMPORTED') fail('ROW_ALREADY_IMPORTED', 'Imported rows cannot be edited.', 409);

    const editable = ['questionText', 'options', 'correctAnswers', 'explanation'];
    const unknownFields = Object.keys(updates || {}).filter((field) => !editable.includes(field));
    if (unknownFields.length > 0) fail('UNKNOWN_EDIT_FIELD', 'Only questionText, options, correctAnswers, and explanation can be edited.', 400);
    if (Object.keys(updates || {}).length === 0) fail('EMPTY_EDIT', 'At least one row value must be supplied.');

    const nextValues = asPlainValues(row.values);
    if (Object.prototype.hasOwnProperty.call(updates, 'questionText')) nextValues.questionText = String(updates.questionText ?? '');
    if (Object.prototype.hasOwnProperty.call(updates, 'options')) {
      nextValues.options = Array.isArray(updates.options)
        ? updates.options.map((option) => ({ id: String(option?.id ?? ''), text: String(option?.text ?? '') }))
        : [];
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'correctAnswers')) {
      nextValues.correctAnswers = Array.isArray(updates.correctAnswers) ? updates.correctAnswers.map((answer) => String(answer)) : [];
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'explanation')) nextValues.explanation = String(updates.explanation ?? '');

    row.values = nextValues;
    row.editedFields = [...new Set([...(row.editedFields || []), ...mapEditToSourceFields(updates)])];
    row.formulaFields = (row.formulaFields || []).filter((field) => !mapEditToSourceFields(updates).includes(field));
    if (row.importState === 'FAILED' || row.importState === 'DUPLICATE' || row.importState === 'SKIPPED') {
      row.importState = 'PENDING';
      row.resultCode = '';
      row.resultMessage = '';
    }
    await row.save();
    await reclassifyBatch(batch._id);
  } catch (error) {
    operationError = issueSafeError(error).code;
    throw error;
  } finally {
    const nextState = await stateAfterNonConfirmOperation(batch._id).catch(() => 'PREVIEW_READY');
    await finishBatchOperation(batch._id, token, nextState, operationError).catch(() => {});
  }
  const latestBatch = await QuestionImportBatch.findById(batch._id);
  const detail = await batchDetail(latestBatch);
  return { ...detail, editedRowNumber };
};

const findImportedQuestionByFingerprint = async (stemOptionsFingerprint) => Question.findOne({
  toeicPart: 5,
  importStemOptionsFingerprint: stemOptionsFingerprint,
}).select('+importStemOptionsFingerprint +importFingerprintVersion +importBatchId +importRowNumber');

const rowAsQuestionData = (row, actorId, batchId) => ({
  questionText: row.values.questionText,
  type: 'single_choice',
  options: ['A', 'B', 'C', 'D'].map((id) => row.values.options.find((option) => option.id === id)),
  correctAnswers: [...row.values.correctAnswers],
  explanation: row.values.explanation,
  toeicPart: 5,
  status: 'draft',
  createdBy: actorId,
  importStemOptionsFingerprint: row.stemOptionsFingerprint,
  importFingerprintVersion: row.fingerprintVersion || 1,
  importBatchId: batchId,
  importRowNumber: row.rowNumber,
});

const markQuestionCreated = async (row, question) => {
  row.status = 'VALID';
  row.importState = 'IMPORTED';
  row.questionId = question._id;
  row.claimToken = '';
  row.claimExpiresAt = null;
  row.resultCode = 'IMPORTED';
  row.resultMessage = 'Question created as draft.';
  await row.save();
  return { rowNumber: row.rowNumber, status: 'IMPORTED', questionId: String(question._id) };
};

const handleFingerprintCollision = async ({ row, batchId }) => {
  const existing = await findImportedQuestionByFingerprint(row.stemOptionsFingerprint);
  if (!existing) return null;
  if (String(existing.importBatchId) === String(batchId) && Number(existing.importRowNumber) === Number(row.rowNumber)) {
    return markQuestionCreated(row, existing);
  }

  const existingValues = questionToImportValues(existing);
  const comparison = compareContent(row, { values: existingValues, rowNumber: -1, editedFields: [], formulaFields: [], sourceIssues: [], issues: [], status: 'VALID' });
  row.claimToken = '';
  row.claimExpiresAt = null;
  if (comparison === 'EXACT') {
    row.status = 'DUPLICATE';
    row.importState = 'DUPLICATE';
    row.resultCode = 'DUPLICATE_DURING_CONFIRM';
    row.resultMessage = 'Another import created an identical Question first; this row was skipped.';
    addIssue(row, {
      code: 'DUPLICATE_IN_BANK', field: 'questionText', severity: 'warning',
      message: 'Another import created an identical Question first; this row was skipped.',
    });
    await row.save();
    return { rowNumber: row.rowNumber, status: 'DUPLICATE', message: row.resultMessage };
  }

  row.status = 'NEEDS_REVIEW';
  row.importState = 'PENDING';
  row.resultCode = 'BANK_CONTENT_CONFLICT';
  row.resultMessage = 'A concurrent import reserved this stem/options with different answer or explanation content.';
  addIssue(row, {
    code: 'BANK_CONTENT_CONFLICT', field: 'questionText', severity: 'warning',
    message: row.resultMessage,
  });
  await row.save();
  return { rowNumber: row.rowNumber, status: 'NEEDS_REVIEW', message: row.resultMessage };
};

const claimRow = async (batchId, rowNumber, token) => {
  const now = new Date();
  return QuestionImportRow.findOneAndUpdate({
    batchId,
    rowNumber,
    status: 'VALID',
    $or: [
      { importState: { $in: ['PENDING', 'FAILED', 'DUPLICATE', 'SKIPPED'] } },
      { importState: 'CLAIMED', claimExpiresAt: { $lte: now } },
    ],
  }, {
    $set: {
      importState: 'CLAIMED',
      claimToken: token,
      claimExpiresAt: new Date(now.getTime() + ROW_LEASE_MS),
      resultCode: '',
      resultMessage: '',
    },
    $inc: { attemptCount: 1 },
  }, { new: true });
};

const updateRowFailure = async (batchId, rowNumber, token, error) => {
  const safe = issueSafeError(error);
  await QuestionImportRow.updateOne({ batchId, rowNumber, claimToken: token }, {
    $set: {
      importState: 'FAILED',
      claimToken: '',
      claimExpiresAt: null,
      resultCode: safe.code,
      resultMessage: safe.message,
    },
  });
  return { rowNumber, status: 'FAILED', code: safe.code, message: safe.message };
};

const finalizeBatchState = async (batchId) => {
  const [remainingValid, imported, failed, unresolvedReviewRows] = await Promise.all([
    QuestionImportRow.countDocuments({ batchId, status: 'VALID', importState: { $in: ['PENDING', 'FAILED', 'CLAIMED'] } }),
    QuestionImportRow.countDocuments({ batchId, importState: 'IMPORTED' }),
    QuestionImportRow.countDocuments({ batchId, importState: 'FAILED' }),
    QuestionImportRow.countDocuments({ batchId, status: { $in: ['INVALID', 'NEEDS_REVIEW'] } }),
  ]);
  if (remainingValid > 0 || failed > 0 || unresolvedReviewRows > 0) return imported > 0 ? 'PARTIALLY_CONFIRMED' : 'PREVIEW_READY';
  return 'CONFIRMED';
};

const previouslyProcessedResults = async (batchId, rowNumbers) => {
  const rows = await QuestionImportRow.find({ batchId, rowNumber: { $in: rowNumbers } }).sort({ rowNumber: 1 }).lean();
  const byNumber = new Map(rows.map((row) => [row.rowNumber, row]));
  return rowNumbers.map((rowNumber) => {
    const row = byNumber.get(rowNumber);
    if (!row) return { rowNumber, status: 'ROW_NOT_FOUND' };
    if (row.importState === 'IMPORTED') return { rowNumber, status: 'ALREADY_IMPORTED', questionId: String(row.questionId) };
    return { rowNumber, status: row.status, issues: row.issues };
  });
};

export const confirmQuestionImportBatch = async ({ batchId, rowNumbers, actorId }) => {
  if (!Array.isArray(rowNumbers) || rowNumbers.length === 0 || rowNumbers.length > 1000) {
    fail('INVALID_ROW_SELECTION', 'rowNumbers must contain between 1 and 1000 worksheet row numbers.');
  }
  if (rowNumbers.some((rowNumber) => !Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > 1020)) {
    fail('INVALID_ROW_SELECTION', 'Every row number must be a valid worksheet row number.');
  }
  if (new Set(rowNumbers).size !== rowNumbers.length) fail('DUPLICATE_ROW_SELECTION', 'rowNumbers must not contain duplicates.');
  if (!mongoose.isValidObjectId(batchId)) fail('BATCH_NOT_FOUND', 'Import batch was not found.', 404);

  const current = await QuestionImportBatch.findById(batchId);
  if (!current) fail('BATCH_NOT_FOUND', 'Import batch was not found.', 404);
  if (current.state === 'CONFIRMED') {
    return { batch: current.toObject(), results: await previouslyProcessedResults(batchId, rowNumbers) };
  }

  const { batch, token } = await acquireBatchOperation(batchId, 'CONFIRMING');
  let operationError = '';
  let results = [];
  let finalStateForRelease;
  try {
    await ensureImportIndexes();
    await renewBatchOperation(batch._id, token);
    await reclassifyBatch(batch._id);
    const selectedRows = await QuestionImportRow.find({ batchId: batch._id, rowNumber: { $in: rowNumbers } }).sort({ rowNumber: 1 });
    const selectedByNumber = new Map(selectedRows.map((row) => [row.rowNumber, row]));
    for (const rowNumber of rowNumbers) {
      await renewBatchOperation(batch._id, token);
      let row = selectedByNumber.get(rowNumber);
      if (!row) {
        results.push({ rowNumber, status: 'ROW_NOT_FOUND' });
        continue;
      }
      if (row.importState === 'IMPORTED') {
        results.push({ rowNumber, status: 'ALREADY_IMPORTED', questionId: String(row.questionId) });
        continue;
      }
      if (row.status !== 'VALID') {
        results.push({ rowNumber, status: row.status, issues: row.issues });
        continue;
      }

      row = await claimRow(batch._id, rowNumber, token);
      if (!row) {
        const currentRow = await QuestionImportRow.findOne({ batchId: batch._id, rowNumber }).lean();
        if (currentRow?.importState === 'IMPORTED') {
          results.push({ rowNumber, status: 'ALREADY_IMPORTED', questionId: String(currentRow.questionId) });
        } else {
          results.push({ rowNumber, status: 'ROW_IN_PROGRESS' });
        }
        continue;
      }

      try {
        const [bankQuestions, priorImportedRows] = await Promise.all([
          findPart5Questions(),
          findPriorImportedRows([row], batch._id),
        ]);
        classifyRows([row], bankQuestions, priorImportedRows);
        if (row.status !== 'VALID') {
          row.claimToken = '';
          row.claimExpiresAt = null;
          if (row.status === 'DUPLICATE') row.importState = 'DUPLICATE';
          else row.importState = 'PENDING';
          await row.save();
          results.push({ rowNumber, status: row.status, issues: row.issues });
          continue;
        }

        const created = await Question.create(rowAsQuestionData(row, actorId, batch._id));
        results.push(await markQuestionCreated(row, created));
      } catch (error) {
        if (error?.code === 11000) {
          const collision = await handleFingerprintCollision({ row, batchId: batch._id });
          if (collision) {
            results.push(collision);
            continue;
          }
        }
        results.push(await updateRowFailure(batch._id, rowNumber, token, error));
      }
    }

    const finalState = await finalizeBatchState(batch._id);
    const importedCount = await QuestionImportRow.countDocuments({ batchId: batch._id, importState: 'IMPORTED' });
    await persistBatchCounts(batch._id);
    await QuestionImportBatch.updateOne({ _id: batch._id, activeOperationToken: token }, {
      $set: {
        confirmedBy: actorId,
        ...(importedCount > 0 ? { confirmedAt: new Date() } : {}),
      },
    });
    finalStateForRelease = finalState;
  } catch (error) {
    operationError = issueSafeError(error).code;
    throw error;
  } finally {
    const finalState = finalStateForRelease || await finalizeBatchState(batch._id).catch(() => 'PARTIALLY_CONFIRMED');
    await finishBatchOperation(batch._id, token, finalState, operationError).catch(() => {});
  }

  const latestBatch = await QuestionImportBatch.findById(batch._id);
  const detail = await batchDetail(latestBatch);
  return { ...detail, results };
};
