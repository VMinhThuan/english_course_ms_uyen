import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Assessment from '../models/Assessment.js';
import Question from '../models/Question.js';
import QuestionGroup from '../models/QuestionGroup.js';

const DEFAULT_ASSESSMENT_ID = '6adf895e4930e0f106ce097c';
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_STATE_FILE = path.resolve('data/toeic-translation-state.json');
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
const TARGET_FIELDS = ['explanation', 'translation', 'answerTranslation', 'audioTranslation'];

const hasCjk = (value) => CJK_RE.test(String(value || ''));
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const text = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value));
const idString = (value) => (value == null ? '' : String(value));

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [name, inlineValue] = token.slice(2).split('=', 2);
    if (inlineValue !== undefined) args.set(name, inlineValue);
    else if (argv[index + 1] && !argv[index + 1].startsWith('--')) args.set(name, argv[++index]);
    else args.set(name, true);
  }
  return args;
}

function parsePositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function targetPath(field, index = null) {
  return index == null ? field : `${field}.${index}`;
}

function getFieldValue(question, field, index = null) {
  if (index == null) return text(question[field]);
  return text(Array.isArray(question[field]) ? question[field][index] : '');
}

function setFieldValue(question, field, index, value) {
  if (index == null) return { ...question, [field]: value };
  const values = Array.isArray(question[field]) ? [...question[field]] : [];
  values[index] = value;
  return { ...question, [field]: values };
}

function preserveStructure(source, translated) {
  const sourceLines = String(source).split('\n').length;
  const translatedLines = String(translated).split('\n').length;
  if (sourceLines !== translatedLines) return false;
  const sourceTags = [...String(source).matchAll(/<\/?[a-z][^>]*>/gi)].map((match) => match[0].replace(/\s+/g, ' '));
  const translatedTags = [...String(translated).matchAll(/<\/?[a-z][^>]*>/gi)].map((match) => match[0].replace(/\s+/g, ' '));
  return JSON.stringify(sourceTags) === JSON.stringify(translatedTags);
}

function validateTranslation(source, translated) {
  const value = text(translated).trim();
  if (!value) throw new Error('TRANSLATION_EMPTY');
  if (hasCjk(value)) throw new Error('TRANSLATION_STILL_CONTAINS_CHINESE');
  if (!preserveStructure(source, value)) throw new Error('TRANSLATION_STRUCTURE_CHANGED');
  return value;
}

function providerConfig(args) {
  const provider = String(args.get('provider') || process.env.TOEIC_TRANSLATION_PROVIDER || 'openai-compatible').toLowerCase();
  const endpoint = String(args.get('endpoint') || process.env.TOEIC_TRANSLATION_API_URL || 'https://api.openai.com/v1/chat/completions');
  const apiKey = String(process.env.TOEIC_TRANSLATION_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  const model = String(args.get('model') || process.env.TOEIC_TRANSLATION_MODEL || 'gpt-4o-mini');
  return { provider, endpoint, apiKey, model };
}

async function translateBatch(items, config) {
  if (config.provider !== 'openai-compatible') {
    throw new Error(`UNSUPPORTED_TRANSLATION_PROVIDER:${config.provider}`);
  }
  if (!config.apiKey) throw new Error('TRANSLATION_PROVIDER_NOT_CONFIGURED');
  const prompt = [
    'Translate only the Chinese text inside each TOEIC editorial field into natural Vietnamese.',
    'Keep English grammar terms, answer letters, names, punctuation, Markdown/HTML tags, and line breaks unchanged.',
    'Do not translate TOEIC question stems or answer choices. Return JSON only:',
    '{"translations":[{"id":"...","text":"..."}]}',
    'Input:',
    JSON.stringify(items.map((item) => ({ id: item.translationId, text: item.sourceText }))),
  ].join('\n');
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a careful Chinese-to-Vietnamese TOEIC editor.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`TRANSLATION_PROVIDER_HTTP_${response.status}:${text(payload?.error?.message || payload?.message).slice(0, 240)}`);
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error('TRANSLATION_PROVIDER_EMPTY_RESPONSE');
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('TRANSLATION_PROVIDER_INVALID_JSON');
  }
  const translations = Array.isArray(parsed) ? parsed : parsed.translations;
  if (!Array.isArray(translations)) throw new Error('TRANSLATION_PROVIDER_MISSING_TRANSLATIONS');
  const byId = new Map(translations.map((item) => [String(item?.id || ''), item?.text]));
  return items.map((item) => ({
    ...item,
    translatedText: validateTranslation(item.sourceText, byId.get(item.translationId)),
  }));
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, filePath);
}

async function appendFailureLog(filePath, failure) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify({ ...failure, at: new Date().toISOString() })}\n`, 'utf8');
}

function questionUnits(question) {
  const units = [];
  for (const field of TARGET_FIELDS) {
    const value = getFieldValue(question, field);
    if (value && hasCjk(value)) units.push({ field, index: null, sourceText: value });
  }
  for (let index = 0; index < (Array.isArray(question.choiceNotes) ? question.choiceNotes.length : 0); index += 1) {
    const value = getFieldValue(question, 'choiceNotes', index);
    if (value && hasCjk(value)) units.push({ field: 'choiceNotes', index, sourceText: value });
  }
  return units.map((unit) => ({
    questionId: idString(question._id),
    ...unit,
    key: `${question._id}:${targetPath(unit.field, unit.index)}`,
    sourceHash: sha256(unit.sourceText),
    translationId: `${unit.field}:${sha256(unit.sourceText).slice(0, 24)}`,
  }));
}

function groupFieldInventory(groups) {
  const fields = ['instructions', 'title', 'transcript', 'audioText'];
  const counts = Object.fromEntries(fields.map((field) => [field, groups.filter((group) => hasCjk(group[field])).length]));
  const passageCount = groups.flatMap((group) => group.passages || []).filter((passage) => hasCjk(passage.title) || hasCjk(passage.content)).length;
  return { ...counts, passages: passageCount };
}

async function buildInventory(assessmentId) {
  const assessment = await Assessment.findById(assessmentId).select('questions questionGroups title').lean();
  if (!assessment) throw new Error(`ASSESSMENT_NOT_FOUND:${assessmentId}`);
  const sourceQuestionIds = (assessment.questions || []).map((item) => item.question || item).filter(Boolean);
  const sourceGroupIds = assessment.questionGroups || [];
  const sourceQuestions = await Question.find({ _id: { $in: sourceQuestionIds } }).select('+bankSourceQuestionId +bankTargetAssessmentId').lean();
  const copies = sourceQuestionIds.length
    ? await Question.find({ bankSourceQuestionId: { $in: sourceQuestionIds } }).select('+bankSourceQuestionId +bankTargetAssessmentId').lean()
    : [];
  const allQuestionIds = [...new Set([...sourceQuestions, ...copies].map((question) => idString(question._id)))];
  const groups = sourceGroupIds.length
    ? await QuestionGroup.find({ _id: { $in: sourceGroupIds } }).select('partNumber title instructions transcript audioText passages').lean()
    : [];
  const units = [...sourceQuestions, ...copies].flatMap(questionUnits);
  return {
    assessment,
    sourceQuestions,
    copies,
    groups,
    units,
    sourceQuestionIds,
    allQuestionIds,
    groupFieldInventory: groupFieldInventory(groups),
  };
}

function summarize(inventory) {
  const byPart = {};
  for (const question of inventory.sourceQuestions) byPart[question.toeicPart] = (byPart[question.toeicPart] || 0) + 1;
  const fields = {};
  for (const unit of inventory.units) fields[unit.field] = (fields[unit.field] || 0) + 1;
  return {
    assessmentId: idString(inventory.assessment._id),
    assessmentTitle: inventory.assessment.title,
    sourceQuestionCount: inventory.sourceQuestions.length,
    sourceQuestionCountByPart: byPart,
    generatedOrBankCopyCount: inventory.copies.length,
    targetUnitCountIncludingCopies: inventory.units.length,
    targetUnitCountByField: fields,
    questionGroupCount: inventory.groups.length,
    questionGroupChineseFields: inventory.groupFieldInventory,
    unsupportedSchemaFields: ['rationale', 'analysis'],
  };
}

async function createBackup(inventory, backupDir) {
  const filePath = path.resolve(backupDir, `toeic-explanations-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeJson(filePath, {
    createdAt: new Date().toISOString(),
    assessmentId: idString(inventory.assessment._id),
    sourceQuestionIds: inventory.sourceQuestionIds.map(idString),
    questions: [...inventory.sourceQuestions, ...inventory.copies].map((question) => ({
      _id: idString(question._id),
      bankSourceQuestionId: idString(question.bankSourceQuestionId) || null,
      bankTargetAssessmentId: idString(question.bankTargetAssessmentId) || null,
      fields: Object.fromEntries(TARGET_FIELDS.concat(['choiceNotes']).map((field) => [field, question[field] ?? ''])),
    })),
  });
  return filePath;
}

async function exportTranslationBatches(inventory, outputDir, batchSize) {
  const unique = new Map();
  for (const unit of inventory.units) {
    const existing = unique.get(unit.translationId);
    if (existing) existing.occurrences.push({ questionId: unit.questionId, field: unit.field, index: unit.index, key: unit.key });
    else unique.set(unit.translationId, {
      translationId: unit.translationId,
      sourceHash: unit.sourceHash,
      sourceText: unit.sourceText,
      occurrences: [{ questionId: unit.questionId, field: unit.field, index: unit.index, key: unit.key }],
    });
  }
  const entries = [...unique.values()];
  await fs.mkdir(outputDir, { recursive: true });
  const batches = [];
  for (let index = 0; index < entries.length; index += batchSize) {
    const batchNumber = Math.floor(index / batchSize) + 1;
    const fileName = `batch-${String(batchNumber).padStart(4, '0')}.json`;
    const filePath = path.join(outputDir, fileName);
    const batch = { version: 1, batchNumber, totalBatches: Math.ceil(entries.length / batchSize), entries: entries.slice(index, index + batchSize) };
    await writeJson(filePath, batch);
    batches.push({ batchNumber, fileName, entryCount: batch.entries.length });
  }
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    assessmentId: idString(inventory.assessment._id),
    sourceQuestionCount: inventory.sourceQuestions.length,
    copyCount: inventory.copies.length,
    uniqueEntryCount: entries.length,
    batchSize,
    batches,
  };
  await writeJson(path.join(outputDir, 'manifest.json'), manifest);
  return manifest;
}

async function loadManualTranslationResults(resultsDir, inventory, exportDir) {
  const expected = new Map();
  for (const unit of inventory.units) {
    if (!expected.has(unit.translationId)) {
      expected.set(unit.translationId, unit);
    }
  }
  // Keep already-applied entries verifiable on resume: the live inventory no
  // longer includes them once their Chinese source has been replaced. The
  // immutable exported batches remain the source of truth for their hashes.
  try {
    const exportedNames = (await fs.readdir(exportDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^batch-\d+\.json$/i.test(entry.name))
      .map((entry) => entry.name);
    for (const name of exportedNames) {
      const payload = JSON.parse(await fs.readFile(path.join(exportDir, name), 'utf8'));
      for (const entry of payload.entries || []) {
        if (!expected.has(entry.translationId)) expected.set(entry.translationId, {
          translationId: entry.translationId,
          sourceHash: entry.sourceHash,
          sourceText: entry.sourceText,
        });
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const names = (await fs.readdir(resultsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^batch-\d+\.json$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const translatedById = new Map();
  const errors = [];
  for (const name of names) {
    const filePath = path.join(resultsDir, name);
    let payload;
    try {
      payload = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (error) {
      errors.push({ file: name, code: 'RESULT_FILE_INVALID_JSON', message: error.message });
      continue;
    }
    if (!Array.isArray(payload?.translations)) {
      errors.push({ file: name, code: 'RESULT_FILE_MISSING_TRANSLATIONS' });
      continue;
    }
    for (const item of payload.translations) {
      const translationId = String(item?.translationId || '');
      const expectedItem = expected.get(translationId);
      if (!expectedItem) {
        errors.push({ file: name, translationId, code: 'RESULT_ID_NOT_IN_EXPORT' });
        continue;
      }
      if (String(item?.sourceHash || '') !== expectedItem.sourceHash) {
        errors.push({ file: name, translationId, code: 'RESULT_SOURCE_HASH_MISMATCH' });
        continue;
      }
      try {
        const validated = validateTranslation(expectedItem.sourceText, item.translatedText);
        const previous = translatedById.get(translationId);
        if (previous && previous !== validated) {
          errors.push({ file: name, translationId, code: 'RESULT_DUPLICATE_CONFLICT' });
          continue;
        }
        translatedById.set(translationId, validated);
      } catch (error) {
        errors.push({ file: name, translationId, code: error.message });
      }
    }
  }
  return {
    translatedById,
    expectedCount: expected.size,
    resultFileCount: names.length,
    errors,
  };
}

async function applyTranslations(inventory, translatedById, state, stateFile) {
  const updates = new Map();
  for (const question of [...inventory.sourceQuestions, ...inventory.copies]) {
    let nextQuestion = question;
    for (const unit of questionUnits(question)) {
      const translated = translatedById.get(unit.translationId);
      if (!translated) continue;
      nextQuestion = setFieldValue(nextQuestion, unit.field, unit.index, translated);
      state.entries[unit.key] = {
        status: 'confirmed',
        sourceHash: unit.sourceHash,
        translatedText: translated,
        updatedAt: new Date().toISOString(),
      };
    }
    if (nextQuestion !== question) {
      const set = {};
      for (const field of TARGET_FIELDS.concat(['choiceNotes'])) {
        if (JSON.stringify(nextQuestion[field]) !== JSON.stringify(question[field])) set[field] = nextQuestion[field];
      }
      if (Object.keys(set).length) updates.set(idString(question._id), { updateOne: { filter: { _id: question._id }, update: { $set: set } } });
    }
  }
  if (!updates.size) return 0;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Question.bulkWrite([...updates.values()], { session, ordered: true });
    });
  } finally {
    await session.endSession();
  }
  await writeJson(stateFile, state);
  return updates.size;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const assessmentId = String(args.get('assessment-id') || process.env.TOEIC_SOURCE_ASSESSMENT_ID || DEFAULT_ASSESSMENT_ID);
  const stateFile = path.resolve(String(args.get('state-file') || process.env.TOEIC_TRANSLATION_STATE_FILE || DEFAULT_STATE_FILE));
  const batchSize = parsePositiveInt(args.get('batch-size'), DEFAULT_BATCH_SIZE);
  const limit = args.has('limit') ? parsePositiveInt(args.get('limit'), 1) : Number.POSITIVE_INFINITY;
  const apply = args.has('apply');
  const jsonOutput = args.has('json');
  if (args.has('help')) {
    console.log('Usage: npm run toeic:explanations:translate -- [--json] [--export-batches DIR] [--apply-results DIR --yes] [--apply --yes] [--limit N] [--batch-size N]');
    console.log('Manual mode reads Codex-created batch-*.json files with translations[]. No API key or external provider is used.');
    return;
  }
  const config = providerConfig(args);
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    const inventory = await buildInventory(assessmentId);
    const report = summarize(inventory);
    if (args.has('export-batches')) {
      const outputDir = path.resolve(String(args.get('export-batches') === true ? 'data/toeic-translation-batches' : args.get('export-batches')));
      const manifest = await exportTranslationBatches(inventory, outputDir, batchSize);
      report.status = 'exported';
      report.batchDirectory = outputDir;
      report.manifest = manifest;
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    if (args.has('apply-results')) {
      report.mode = 'apply-results';
      const resultsDir = path.resolve(String(args.get('apply-results') === true
        ? 'data/toeic-translation-results'
        : args.get('apply-results')));
      const exportDir = path.resolve(String(args.get('export-dir') || 'data/toeic-translation-batches'));
      if (!args.has('yes')) throw new Error('APPLY_RESULTS_REQUIRES_--yes');
      const loaded = await loadManualTranslationResults(resultsDir, inventory, exportDir);
      report.resultsDirectory = resultsDir;
      report.exportDirectory = exportDir;
      report.resultFileCount = loaded.resultFileCount;
      report.translatedUniqueEntryCount = loaded.translatedById.size;
      report.pendingUniqueEntryCount = Math.max(0, loaded.expectedCount - loaded.translatedById.size);
      report.resultErrors = loaded.errors;
      if (loaded.errors.length) {
        report.status = 'blocked';
        report.code = 'INVALID_TRANSLATION_RESULTS';
        report.message = 'One or more result entries failed validation; no database changes were made.';
        console.log(JSON.stringify(report, null, 2));
        process.exitCode = 2;
        return;
      }
      if (!loaded.translatedById.size) {
        report.status = 'blocked';
        report.code = 'NO_TRANSLATION_RESULTS';
        report.message = 'No validated translation result files were found; no database changes were made.';
        console.log(JSON.stringify(report, null, 2));
        process.exitCode = 2;
        return;
      }
      const state = await readJson(stateFile, { version: 1, entries: {} });
      const backupPath = await createBackup(inventory, String(args.get('backup-dir') || path.resolve('data/backups')));
      const updatedCount = await applyTranslations(inventory, loaded.translatedById, state, stateFile);
      report.status = loaded.translatedById.size === loaded.expectedCount ? 'success' : 'partial';
      report.backupPath = backupPath;
      report.updatedQuestionCount = updatedCount;
      report.stateFile = stateFile;
      report.message = report.status === 'partial'
        ? 'Validated batches were applied; remaining batches are still pending.'
        : 'All exported translation entries were applied.';
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    report.mode = apply ? 'apply' : 'dry-run';
    report.provider = { name: config.provider, endpoint: config.endpoint, model: config.model, configured: Boolean(config.apiKey) };
    report.sample = inventory.units.slice(0, 5).map((unit) => ({ key: unit.key, field: unit.field, sourceText: unit.sourceText }));
    if (!apply) {
      if (jsonOutput) console.log(JSON.stringify(report, null, 2));
      else console.log(JSON.stringify(report, null, 2));
      return;
    }
    if (!config.apiKey) {
      report.status = 'blocked';
      report.code = 'TRANSLATION_PROVIDER_NOT_CONFIGURED';
      report.message = 'Set TOEIC_TRANSLATION_API_KEY (and optionally TOEIC_TRANSLATION_API_URL/TOEIC_TRANSLATION_MODEL) before --apply.';
      if (jsonOutput) console.log(JSON.stringify(report, null, 2));
      else console.error(JSON.stringify(report, null, 2));
      process.exitCode = 2;
      return;
    }
    if (!args.has('yes')) throw new Error('APPLY_REQUIRES_--yes');
    const state = await readJson(stateFile, { version: 1, entries: {} });
    const failureFile = path.resolve(String(args.get('failure-file') || path.resolve('data/toeic-translation-failures.jsonl')));
    const units = inventory.units.slice(0, limit);
    const unique = new Map();
    for (const unit of units) {
      const cached = state.entries[unit.key];
      if (cached?.status === 'confirmed' && cached.sourceHash === unit.sourceHash) {
        unique.set(unit.translationId, { ...unit, translatedText: validateTranslation(unit.sourceText, cached.translatedText) });
      } else if (!unique.has(unit.translationId)) unique.set(unit.translationId, unit);
    }
    const translatedById = new Map();
    let translatedCount = 0;
    const uniqueItems = [...unique.values()];
    for (let index = 0; index < uniqueItems.length; index += batchSize) {
      const batch = uniqueItems.slice(index, index + batchSize);
      const pending = batch.filter((item) => !item.translatedText);
      let translated = [];
      try {
        translated = pending.length ? await translateBatch(pending, config) : [];
      } catch (error) {
        await Promise.all(pending.map((item) => appendFailureLog(failureFile, {
          key: item.key,
          field: item.field,
          questionId: item.questionId,
          sourceHash: item.sourceHash,
          error: error.message,
        })));
        throw error;
      }
      for (const item of batch) {
        const result = item.translatedText || translated.find((entry) => entry.translationId === item.translationId)?.translatedText;
        if (!result) throw new Error(`TRANSLATION_MISSING_RESULT:${item.translationId}`);
        translatedById.set(item.translationId, result);
        translatedCount += 1;
      }
    }
    const backupPath = await createBackup(inventory, String(args.get('backup-dir') || path.resolve('data/backups')));
    const updatedCount = await applyTranslations(inventory, translatedById, state, stateFile);
    report.status = 'success';
    report.backupPath = backupPath;
    report.translatedUnitCount = translatedCount;
    report.updatedQuestionCount = updatedCount;
    report.stateFile = stateFile;
    report.failureFile = failureFile;
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'error', code: error.message, message: error.stack || error.message }, null, 2));
  process.exitCode = 1;
});
