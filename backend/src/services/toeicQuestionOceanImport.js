import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import mongoose from 'mongoose';
import Assessment from '../models/Assessment.js';
import Question from '../models/Question.js';
import QuestionGroup from '../models/QuestionGroup.js';
import { getPublicUploadDir } from '../utils/uploadConfig.js';
import { DEFAULT_TOEIC_PARTS } from '../utils/toeicHelper.js';

export const TOEIC_QUESTION_OCEAN_REPOSITORY = 'https://github.com/kdeppaei/toeic-question-ocean';
export const TOEIC_QUESTION_OCEAN_SOURCE = 'toeic-question-ocean';
export const TOEIC_QUESTION_OCEAN_LICENSE = 'MIT; Part 1 images retain repository Pexels/original provenance.';

const PARTS = new Set(['1', '2', '3', '4', '5', '6', '7']);
const LISTENING_PARTS = new Set(['1', '2', '3', '4']);
const UNVERIFIED_SOURCE_TYPES = new Set(['user']);
const text = (value) => typeof value === 'string' ? value.trim() : '';
const cleanLongText = (value) => typeof value === 'string' ? value.trim() : '';
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

export class ToeicQuestionOceanImportError extends Error {
  constructor(message, code = 'TOEIC_QUESTION_OCEAN_IMPORT_INVALID') {
    super(message);
    this.name = 'ToeicQuestionOceanImportError';
    this.code = code;
  }
}

function repositoryVersion(repositoryPath) {
  try {
    return execFileSync('git', ['-C', repositoryPath, 'rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'working-tree';
  }
}

function loadScript(context, repositoryPath, relativePath) {
  const absolutePath = path.join(repositoryPath, relativePath);
  if (!fs.existsSync(absolutePath)) throw new ToeicQuestionOceanImportError(`Thiếu file ${relativePath}.`);
  vm.runInContext(fs.readFileSync(absolutePath, 'utf8'), context, { filename: relativePath });
}

function questionBankFiles(repositoryPath) {
  return fs.readdirSync(repositoryPath)
    .filter((file) => /^question-bank.*\.js$/.test(file))
    .sort((left, right) => left === 'question-bank.js' ? -1 : right === 'question-bank.js' ? 1 : left.localeCompare(right));
}

/**
 * Loads the same release composition used by the source repository's validator:
 * base bank, version append files, and the two exercise-bank modules.
 */
export function loadToeicQuestionOceanBank(repositoryPath) {
  const root = path.resolve(repositoryPath || '');
  if (!root || !fs.existsSync(path.join(root, 'question-bank.js'))) {
    throw new ToeicQuestionOceanImportError('Repository path không chứa question-bank.js.');
  }
  const context = { window: {} };
  vm.createContext(context);
  questionBankFiles(root).forEach((file) => loadScript(context, root, file));
  [
    'modules/part5-exercise-guides.js',
    'modules/toeic-learning-hub.js',
    'modules/part5-exercise-bank.js',
    'modules/reading-exercise-guides.js',
    'modules/reading-exercise-bank.js',
    'question-annotations-v31.js',
    'modules/question-provenance.js',
    'modules/legal-practice-sources.js',
  ].forEach((file) => loadScript(context, root, file));
  const bank = context.window.BUILTIN_BANK;
  if (!Array.isArray(bank)) throw new ToeicQuestionOceanImportError('Không đọc được window.BUILTIN_BANK.');
  return {
    repositoryPath: root,
    version: repositoryVersion(root),
    bank,
    provenance: context.window.TOEIC_QUESTION_PROVENANCE || null,
  };
}

function imageRelativePath(question) {
  const value = text(question?.image);
  if (!value) return '';
  const normalized = value.replaceAll('\\', '/');
  if (!/^assets\/part1\/[a-z0-9-]+\.(?:jpg|png|webp)$/i.test(normalized)) {
    throw new ToeicQuestionOceanImportError(`${question.id}: đường dẫn ảnh Part 1 không an toàn.`);
  }
  return normalized;
}

function sourceFingerprint(question) {
  return hash(JSON.stringify({
    part: question.part,
    prompt: question.prompt,
    choices: question.choices,
    answer: question.answer,
    passage: question.passage,
  }));
}

function provenanceFor(question, resolver) {
  const resolved = resolver?.resolve?.(question) || {};
  return {
    type: text(question.sourceType) || text(resolved.type) || 'original',
    label: text(question.sourceLabel) || text(resolved.label) || 'TOEIC Question Ocean original simulation',
    provider: text(question.sourceProvider) || text(resolved.provider) || 'TOEIC Question Ocean',
    url: text(question.sourceUrl) || text(resolved.url),
    detail: text(question.sourceDetail) || text(question.sourceNote) || text(resolved.detail),
  };
}

function validateQuestion(question, repositoryPath, seenIds, seenFingerprints) {
  const id = text(question?.id);
  const part = String(question?.part || '');
  const choices = Array.isArray(question?.choices) ? question.choices : [];
  const errors = [];
  if (!id) errors.push('missing id');
  if (!PARTS.has(part)) errors.push('invalid part');
  if (!text(question?.prompt)) errors.push('missing prompt');
  if (!text(question?.explanation)) errors.push('missing explanation');
  if (choices.length < 2 || choices.length > 4) errors.push('choices must contain 2-4 items');
  if (!Number.isInteger(question?.answer) || question.answer < 0 || question.answer >= choices.length) errors.push('invalid answer index');
  if (id && seenIds.has(id)) errors.push('duplicate source id');
  const fingerprint = sourceFingerprint(question);
  if (seenFingerprints.has(fingerprint)) errors.push('duplicate normalized content');
  if (part === '1') {
    try {
      const relative = imageRelativePath(question);
      const absolute = path.resolve(repositoryPath, relative);
      const root = path.resolve(repositoryPath, 'assets', 'part1');
      if (!absolute.startsWith(`${root}${path.sep}`) || !fs.existsSync(absolute)) errors.push('missing or unsafe Part 1 image');
      if (!text(question.imageLicense)) errors.push('missing image license');
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { id, part, fingerprint, errors };
}

function questionNumber(question, counters) {
  const part = String(question.part);
  counters[part] = (counters[part] || 0) + 1;
  return counters[part];
}

function publicSourceMetadata(question, provenance, version) {
  return {
    repository: TOEIC_QUESTION_OCEAN_REPOSITORY,
    version,
    sourceId: text(question.id),
    sourceType: provenance.type,
    sourceLabel: provenance.label,
    sourceProvider: provenance.provider,
    sourceUrl: provenance.url,
    sourceDetail: provenance.detail,
    sourceNote: text(question.sourceNote),
    imageOrigin: text(question.imageOrigin),
    imageGenerator: text(question.imageGenerator),
    imageLicense: text(question.imageLicense),
    imageLicenseUrl: text(question.imageLicenseUrl),
    imageCredit: text(question.imageCredit),
    imageSource: text(question.imageSource),
    formatType: text(question.formatType),
    exerciseSet: question.exerciseSet ?? null,
    evidence: text(question.evidence),
    evidenceLocation: text(question.evidenceLocation),
    choiceNotes: Array.isArray(question.choiceNotes) ? question.choiceNotes : [],
  };
}

function normalizeBank(loaded) {
  const seenIds = new Set();
  const seenFingerprints = new Set();
  const errors = [];
  const skipped = [];
  const valid = [];
  for (const question of loaded.bank) {
    if (UNVERIFIED_SOURCE_TYPES.has(text(question?.sourceType).toLowerCase())) {
      skipped.push({
        sourceId: text(question?.id) || null,
        part: text(question?.part) || null,
        reason: 'UNVERIFIED_SOURCE_PERMISSION',
      });
      continue;
    }
    const result = validateQuestion(question, loaded.repositoryPath, seenIds, seenFingerprints);
    if (result.errors.length) {
      errors.push({ sourceId: result.id || null, part: result.part || null, errors: result.errors });
      continue;
    }
    seenIds.add(result.id);
    seenFingerprints.add(result.fingerprint);
    valid.push({ ...question, _sourceFingerprint: result.fingerprint });
  }
  const counters = {};
  const groups = new Map();
  const normalizedQuestions = valid.map((question) => {
    const part = String(question.part);
    const source = provenanceFor(question, loaded.provenance);
    const audioText = cleanLongText(question.audioText);
    const imagePath = imageRelativePath(question);
    const normalized = {
      sourceId: text(question.id),
      sourceFingerprint: question._sourceFingerprint,
      partNumber: Number(part),
      questionNumber: questionNumber(question, counters),
      questionText: cleanLongText(question.prompt),
      options: question.choices.map((choice, index) => ({ id: String.fromCharCode(65 + index), text: cleanLongText(choice) })),
      correctAnswers: [String.fromCharCode(65 + Number(question.answer))],
      explanation: cleanLongText(question.explanation),
      translation: cleanLongText(question.translation || question.promptZh),
      answerTranslation: cleanLongText(question.answerTranslation),
      audioText,
      audioTranslation: cleanLongText(question.audioTranslation),
      audioSource: audioText && LISTENING_PARTS.has(part) ? 'browser-tts' : '',
      imagePath,
      imageAlt: cleanLongText(question.imageAlt),
      difficulty: cleanLongText(question.difficulty),
      category: cleanLongText(question.category),
      tags: Array.isArray(question.tags) ? question.tags.map(text).filter(Boolean) : [],
      sourceType: source.type,
      sourceLabel: source.label,
      sourceProvider: source.provider,
      sourceUrl: source.url,
      sourceDetail: source.detail,
      sourceNote: cleanLongText(question.sourceNote),
      evidence: cleanLongText(question.evidence),
      evidenceLocation: cleanLongText(question.evidenceLocation),
      choiceNotes: Array.isArray(question.choiceNotes) ? question.choiceNotes.map(text) : [],
      sourceMetadata: publicSourceMetadata(question, source, loaded.version),
      raw: question,
    };
    const groupKey = text(question.groupId) || `P${part}-${question.id}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { key: groupKey, partNumber: Number(part), questions: [], source: question });
    groups.get(groupKey).questions.push(normalized);
    return normalized;
  });

  const normalizedGroups = [...groups.values()].map((group, index) => {
    const part = String(group.partNumber);
    const questions = group.questions;
    const passages = [...new Set(questions.map((question) => cleanLongText(question.raw.passage)).filter(Boolean))]
      .map((content, passageIndex) => ({ title: '', content, order: passageIndex + 1 }));
    const audioTexts = [...new Set(questions.map((question) => question.audioText).filter(Boolean))];
    const imagePaths = [...new Set(questions.map((question) => question.imagePath).filter(Boolean))];
    const groupTags = questions.flatMap((question) => question.tags);
    const isMultiPassage = part === '7' && /(double|triple|multi)-passage/i.test(groupTags.join(' '));
    const type = passages.length ? (isMultiPassage ? 'multi_passage' : 'passage') : imagePaths.length ? 'image' : LISTENING_PARTS.has(part) ? 'audio' : 'single';
    const groupId = group.key;
    return {
      sourceId: groupId,
      partNumber: group.partNumber,
      type,
      title: groupId,
      instructions: '',
      imagePaths,
      audioText: audioTexts.join('\n\n'),
      audioSource: audioTexts.length && LISTENING_PARTS.has(part) ? 'browser-tts' : '',
      transcript: audioTexts.join('\n\n'),
      passages,
      order: index + 1,
      questions,
      sourceMetadata: { repository: TOEIC_QUESTION_OCEAN_REPOSITORY, version: loaded.version, sourceId: groupId },
    };
  });
  const countsByPart = Object.fromEntries([...PARTS].map((part) => {
    const rows = normalizedQuestions.filter((question) => String(question.partNumber) === part);
    return [part, rows.length];
  }));
  const contentHash = hash(JSON.stringify(normalizedQuestions.map((question) => ({
    sourceId: question.sourceId,
    sourceFingerprint: question.sourceFingerprint,
  }))));
  return {
    sourceSystem: TOEIC_QUESTION_OCEAN_SOURCE,
    sourceId: loaded.version,
    sourceVersion: loaded.version,
    contentHash,
    questions: normalizedQuestions,
    groups: normalizedGroups,
    errors,
    skipped,
    foundQuestionCount: loaded.bank.length,
    skippedQuestionCount: skipped.length,
    eligibleQuestionCount: normalizedQuestions.length,
    countsByPart,
    questionCount: normalizedQuestions.length,
    media: {
      audioStored: 0,
      audioTts: normalizedQuestions.filter((question) => question.audioSource === 'browser-tts').length,
      audioMissing: normalizedQuestions.filter((question) => LISTENING_PARTS.has(String(question.partNumber)) && !question.audioText).length,
      images: normalizedQuestions.filter((question) => question.imagePath).length,
    },
  };
}

async function prepareMedia(loaded) {
  const attribution = path.join(loaded.repositoryPath, 'assets', 'part1', 'ATTRIBUTION.md');
  if (!fs.existsSync(attribution)) throw new ToeicQuestionOceanImportError('Thiếu ATTRIBUTION.md của media Part 1.');
  const destinationRoot = path.join(getPublicUploadDir(), 'toeic-question-ocean', 'part1');
  await fsp.mkdir(destinationRoot, { recursive: true });
  await fsp.copyFile(attribution, path.join(destinationRoot, 'ATTRIBUTION.md'));
  const copied = new Map();
  for (const question of loaded.bank) {
    const relative = imageRelativePath(question);
    if (!relative || copied.has(relative)) continue;
    const source = path.resolve(loaded.repositoryPath, relative);
    const target = path.join(destinationRoot, path.basename(relative));
    await fsp.copyFile(source, target);
    copied.set(relative, `/uploads/public/toeic-question-ocean/part1/${path.basename(relative)}`);
  }
  return copied;
}

function assessmentPayload(normalized, actorId, mediaMap) {
  const questions = normalized.questions.map((question) => ({
    questionText: question.questionText,
    type: 'single_choice',
    explanation: question.explanation,
    translation: question.translation,
    answerTranslation: question.answerTranslation,
    audioText: question.audioText,
    audioTranslation: question.audioTranslation,
    audioSource: question.audioSource,
    options: question.options,
    correctAnswers: question.correctAnswers,
    score: 1,
    status: 'draft',
    toeicPart: question.partNumber,
    questionNumber: question.questionNumber,
    order: question.questionNumber,
    difficulty: question.difficulty,
    category: question.category,
    tags: question.tags,
    imageUrl: mediaMap.get(question.imagePath) || '',
    imageAlt: question.imageAlt,
    sourceType: question.sourceType,
    sourceLabel: question.sourceLabel,
    sourceProvider: question.sourceProvider,
    sourceUrl: question.sourceUrl,
    sourceDetail: question.sourceDetail,
    sourceNote: question.sourceNote,
    evidence: question.evidence,
    evidenceLocation: question.evidenceLocation,
    choiceNotes: question.choiceNotes,
    sourceMetadata: question.sourceMetadata,
    crawlerSourceId: question.sourceId,
  }));
  const groups = normalized.groups.map((group) => ({
    assessment: null,
    partNumber: group.partNumber,
    type: group.type,
    title: group.title,
    instructions: group.instructions,
    imageUrl: mediaMap.get(group.imagePaths[0]) || '',
    imageUrls: group.imagePaths.map((image) => mediaMap.get(image)).filter(Boolean),
    audioText: group.audioText,
    audioSource: group.audioSource,
    transcript: group.transcript,
    passages: group.passages,
    order: group.order,
    crawlerSourceId: group.sourceId,
    sourceRepository: TOEIC_QUESTION_OCEAN_REPOSITORY,
    sourceVersion: normalized.sourceVersion,
    sourceMetadata: group.sourceMetadata,
    questions: group.questions,
  }));
  return { questions, groups, actorId };
}

async function writeImport(normalized, mediaMap, actorId, session) {
  let assessment = await Assessment.findOne({
    crawlerSourceSystem: normalized.sourceSystem,
    crawlerSourceId: normalized.sourceId,
  }).select('+crawlerSourceSystem +crawlerSourceId +crawlerContentHash +crawlerSourceUrl +crawlerLicense').session(session);
  if (assessment?.crawlerContentHash === normalized.contentHash) {
    const completeQuestionCount = await Question.countDocuments({
      questionGroup: { $in: assessment.questionGroups || [] },
      toeicPart: { $exists: true },
    }).session(session);
    const completeImageCount = await Question.countDocuments({
      questionGroup: { $in: assessment.questionGroups || [] },
      imageUrl: { $ne: '' },
    }).session(session);
    const groupedRows = await Question.aggregate([
      { $match: { questionGroup: { $in: assessment.questionGroups || [] } } },
      { $group: { _id: '$questionGroup' } },
      { $count: 'groups' },
    ]).session(session);
    const completeGroupCount = groupedRows[0]?.groups || 0;
    if (completeQuestionCount === normalized.questionCount
      && completeImageCount === normalized.media.images
      && completeGroupCount === normalized.groups.length) {
      return { assessment, unchanged: true, imported: 0 };
    }
  }
  if (!assessment) {
    assessment = new Assessment({
      title: `TOEIC Question Ocean · ${normalized.sourceVersion}`,
      description: `Ngân hàng TOEIC-style original từ ${TOEIC_QUESTION_OCEAN_REPOSITORY}. Bản nháp chờ admin kiểm tra. License: ${TOEIC_QUESTION_OCEAN_LICENSE}`,
      type: 'exam',
      examFormat: 'toeic',
      toeicMode: 'practice',
      durationMinutes: 120,
      toeicConfig: {
        totalQuestions: normalized.questionCount,
        durationMinutes: 120,
        listeningQuestionCount: ['1', '2', '3', '4'].reduce((sum, part) => sum + normalized.countsByPart[part], 0),
        readingQuestionCount: ['5', '6', '7'].reduce((sum, part) => sum + normalized.countsByPart[part], 0),
      },
      parts: DEFAULT_TOEIC_PARTS,
      status: 'draft',
      createdBy: actorId || undefined,
    });
  } else {
    const oldGroupIds = assessment.questionGroups || [];
    const oldQuestionIds = oldGroupIds.length
      ? await Question.find({ questionGroup: { $in: oldGroupIds } }).select('_id').session(session).lean()
      : [];
    if (oldQuestionIds.length) await Question.deleteMany({ _id: { $in: oldQuestionIds.map((item) => item._id) } }).session(session);
    if (oldGroupIds.length) await QuestionGroup.deleteMany({ _id: { $in: oldGroupIds } }).session(session);
    assessment.questions = [];
    assessment.questionGroups = [];
  }
  const prepared = assessmentPayload(normalized, actorId, mediaMap);
  // Insert the groups and questions in bulk. Sequential create/save
  // calls exceed Atlas transaction lifetime for this bank.
  const groupDocs = prepared.groups.map((groupData) => ({
    assessment: assessment._id,
    partNumber: groupData.partNumber,
    type: groupData.type,
    title: groupData.title,
    instructions: groupData.instructions,
    imageUrl: groupData.imageUrl,
    imageUrls: groupData.imageUrls,
    audioText: groupData.audioText,
    audioSource: groupData.audioSource,
    transcript: groupData.transcript,
    passages: groupData.passages,
    order: groupData.order,
    crawlerSourceId: groupData.crawlerSourceId,
    sourceRepository: groupData.sourceRepository,
    sourceVersion: groupData.sourceVersion,
    sourceMetadata: groupData.sourceMetadata,
  }));
  const createdGroups = await QuestionGroup.insertMany(groupDocs, { session });
  const groupBySourceId = new Map(createdGroups.map((group, index) => [prepared.groups[index].crawlerSourceId, group]));
  const groupSourceIdByQuestionSourceId = new Map();
  normalized.groups.forEach((group) => {
    group.questions.forEach((question) => {
      groupSourceIdByQuestionSourceId.set(question.sourceId, group.sourceId);
    });
  });
  const questionDocs = prepared.questions.map((question) => {
    const group = groupBySourceId.get(groupSourceIdByQuestionSourceId.get(question.crawlerSourceId));
    if (!group) throw new ToeicQuestionOceanImportError(`Không tìm thấy nhóm cho ${question.crawlerSourceId}.`);
    return {
      questionText: question.questionText,
      type: 'single_choice',
      explanation: question.explanation,
      translation: question.translation,
      answerTranslation: question.answerTranslation,
      audioText: question.audioText,
      audioTranslation: question.audioTranslation,
      audioSource: question.audioSource,
      options: question.options,
      correctAnswers: question.correctAnswers,
      score: 1,
      status: 'draft',
      toeicPart: question.toeicPart,
      questionNumber: question.questionNumber,
      order: question.questionNumber,
      difficulty: question.difficulty,
      category: question.category,
      tags: question.tags,
      imageUrl: question.imageUrl || '',
      imageAlt: question.imageAlt,
      sourceType: question.sourceType,
      sourceLabel: question.sourceLabel,
      sourceProvider: question.sourceProvider,
      sourceUrl: question.sourceUrl,
      sourceDetail: question.sourceDetail,
      sourceNote: question.sourceNote,
      evidence: question.evidence,
      evidenceLocation: question.evidenceLocation,
      choiceNotes: question.choiceNotes,
      sourceMetadata: question.sourceMetadata,
      crawlerSourceId: question.sourceId,
      questionGroup: group._id,
      createdBy: actorId || undefined,
    };
  });
  const createdQuestions = await Question.insertMany(questionDocs, { session });
  const questionRefs = createdQuestions.map((question) => ({ question: question._id, score: 1 }));
  const questionIdsByGroup = new Map();
  createdQuestions.forEach((question) => {
    const key = String(question.questionGroup);
    if (!questionIdsByGroup.has(key)) questionIdsByGroup.set(key, []);
    questionIdsByGroup.get(key).push(question._id);
  });
  await QuestionGroup.bulkWrite(createdGroups.map((group) => ({
    updateOne: {
      filter: { _id: group._id },
      update: { $set: { questionIds: questionIdsByGroup.get(String(group._id)) || [] } },
    },
  })), { session });
  const groupRefs = createdGroups.map((group) => group._id);
  assessment.questions = questionRefs;
  assessment.questionGroups = groupRefs;
  assessment.crawlerSourceSystem = normalized.sourceSystem;
  assessment.crawlerSourceId = normalized.sourceId;
  assessment.crawlerContentHash = normalized.contentHash;
  assessment.crawlerSourceUrl = TOEIC_QUESTION_OCEAN_REPOSITORY;
  assessment.crawlerLicense = TOEIC_QUESTION_OCEAN_LICENSE;
  assessment.status = 'draft';
  await assessment.save({ session });
  return { assessment, unchanged: false, imported: questionRefs.length };
}

export async function inspectToeicQuestionOcean(repositoryPath) {
  const loaded = loadToeicQuestionOceanBank(repositoryPath);
  const normalized = normalizeBank(loaded);
  return { ...normalized, version: loaded.version, repositoryPath: loaded.repositoryPath };
}

export async function importToeicQuestionOcean({ repositoryPath, actorId = null, dryRun = false } = {}) {
  const inspected = await inspectToeicQuestionOcean(repositoryPath);
  if (inspected.errors.length) {
    throw new ToeicQuestionOceanImportError(`Có ${inspected.errors.length} câu không hợp lệ; không thực hiện import.`, 'TOEIC_QUESTION_OCEAN_VALIDATION_FAILED');
  }
  if (dryRun) return { report: inspected, dryRun: true };
  const mediaMap = await prepareMedia({ repositoryPath: inspected.repositoryPath, bank: loadToeicQuestionOceanBank(inspected.repositoryPath).bank });
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await writeImport(inspected, mediaMap, actorId, session);
    });
  } finally {
    await session.endSession();
  }
  return { report: inspected, ...result, dryRun: false };
}
