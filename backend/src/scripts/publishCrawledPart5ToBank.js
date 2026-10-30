import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import connectDB from '../configs/database.js';
import Assessment from '../models/Assessment.js';
import Question from '../models/Question.js';
import QuestionGroup from '../models/QuestionGroup.js';
import { fingerprintImportValues } from '../services/toeicPart5XlsxParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const SOURCE_SYSTEM = 'zenlish-html-authorized';
const OPTION_IDS = ['A', 'B', 'C', 'D'];

const isDryRun = process.argv.includes('--dry-run');
const actorIdIndex = process.argv.indexOf('--actor-id');
const actorId = actorIdIndex >= 0 ? process.argv[actorIdIndex + 1] : '';

const questionValues = (question) => ({
  questionText: String(question.questionText || ''),
  options: OPTION_IDS.map((id) => question.options.find((option) => option.id === id) || { id, text: '' }),
  correctAnswers: Array.isArray(question.correctAnswers) ? question.correctAnswers : [],
  explanation: String(question.explanation || ''),
});

const fingerprintsFor = (question) => fingerprintImportValues(questionValues(question));

const validCandidate = (question) => {
  const values = questionValues(question);
  return values.questionText.trim()
    && Array.isArray(question.options) && question.options.length === 4
    && values.options.length === 4
    && values.options.every((option, index) => option.id === OPTION_IDS[index] && String(option.text || '').trim())
    && values.correctAnswers.length === 1
    && OPTION_IDS.includes(values.correctAnswers[0])
    && values.explanation.trim();
};

const plainSourceMetadata = (question, sourceAssessment) => ({
  ...(question.sourceMetadata && typeof question.sourceMetadata === 'object' ? question.sourceMetadata : {}),
  bankImport: {
    sourceQuestionId: String(question._id),
    sourceAssessmentId: String(sourceAssessment._id),
    sourceAssessmentTitle: sourceAssessment.title,
    crawlerSourceSystem: SOURCE_SYSTEM,
    crawlerSourceId: question.crawlerSourceId || '',
    sourceQuestionNumber: question.questionNumber || null,
  },
});

const bankQuestionData = (question, sourceAssessment) => ({
  questionText: question.questionText,
  type: 'single_choice',
  explanation: question.explanation,
  translation: question.translation || '',
  answerTranslation: question.answerTranslation || '',
  audioText: question.audioText || '',
  audioTranslation: question.audioTranslation || '',
  audioSource: question.audioSource || '',
  audioUrl: question.audioUrl || '',
  imageUrl: question.imageUrl || '',
  imageAlt: question.imageAlt || '',
  difficulty: question.difficulty || '',
  category: question.category || '',
  tags: question.tags || [],
  sourceType: question.sourceType || 'licensed_html_import',
  sourceLabel: question.sourceLabel || 'Authorized Zenlish HTML import',
  sourceProvider: question.sourceProvider || 'Zenlish',
  sourceUrl: question.sourceUrl || '',
  sourceDetail: question.sourceDetail || '',
  sourceNote: question.sourceNote || '',
  evidence: question.evidence || '',
  evidenceLocation: question.evidenceLocation || '',
  choiceNotes: question.choiceNotes || [],
  sourceMetadata: plainSourceMetadata(question, sourceAssessment),
  options: question.options.map((option) => ({ id: option.id, text: option.text })),
  correctAnswers: [...question.correctAnswers],
  score: question.score || 1,
  topic: question.topic || 'General',
  status: 'published',
  toeicPart: 5,
  order: 1,
  ...(actorId && mongoose.isValidObjectId(actorId) ? { createdBy: actorId } : {}),
});

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await connectDB();

  const assessments = await Assessment.find({ crawlerSourceSystem: SOURCE_SYSTEM })
    .select('+crawlerSourceSystem +crawlerSourceId title')
    .lean();
  const assessmentById = new Map(assessments.map((assessment) => [String(assessment._id), assessment]));
  const groups = await QuestionGroup.find({ assessment: { $in: assessments.map((assessment) => assessment._id) }, partNumber: 5 })
    .select('_id assessment')
    .lean();
  const sourceQuestionIds = groups.map((group) => group._id);
  const candidates = await Question.find({ questionGroup: { $in: sourceQuestionIds }, toeicPart: 5 })
    .select('+crawlerSourceId +sourceMetadata questionText type explanation translation answerTranslation audioText audioTranslation audioSource audioUrl imageUrl imageAlt difficulty category tags sourceType sourceLabel sourceProvider sourceUrl sourceDetail sourceNote evidence evidenceLocation choiceNotes options correctAnswers score topic questionGroup questionNumber')
    .lean();
  const existingBank = await Question.find({
    toeicPart: 5,
    status: 'published',
    bankSourceQuestionId: { $exists: false },
    bankTargetAssessmentId: { $exists: false },
  }).select('questionText options correctAnswers explanation').lean();

  const exactBank = new Set();
  const stemBank = new Set();
  for (const question of existingBank) {
    const fingerprints = fingerprintsFor(question);
    exactBank.add(fingerprints.stemOptionsFingerprint);
    stemBank.add(fingerprints.stemFingerprint);
  }

  const seenCandidates = new Set();
  const invalid = [];
  const exactDuplicates = [];
  const conflicts = [];
  const toInsert = [];
  for (const question of candidates) {
    const sourceAssessment = assessmentById.get(String(groups.find((group) => String(group._id) === String(question.questionGroup))?.assessment));
    if (!sourceAssessment || !validCandidate(question)) {
      invalid.push(String(question._id));
      continue;
    }
    const fingerprints = fingerprintsFor(question);
    if (seenCandidates.has(fingerprints.stemOptionsFingerprint) || exactBank.has(fingerprints.stemOptionsFingerprint)) {
      exactDuplicates.push(String(question._id));
      continue;
    }
    if (stemBank.has(fingerprints.stemFingerprint)) {
      conflicts.push(String(question._id));
      continue;
    }
    seenCandidates.add(fingerprints.stemOptionsFingerprint);
    toInsert.push(bankQuestionData(question, sourceAssessment));
  }

  const report = {
    dryRun: isDryRun,
    sourceSystem: SOURCE_SYSTEM,
    sourceAssessments: assessments.map((assessment) => ({ id: String(assessment._id), title: assessment.title })),
    candidateCount: candidates.length,
    existingBankCount: existingBank.length,
    readyToInsert: toInsert.length,
    skipped: {
      invalid: invalid.length,
      exactDuplicate: exactDuplicates.length,
      stemConflict: conflicts.length,
    },
  };
  if (invalid.length || conflicts.length) {
    throw new Error(`Stopped safely: ${invalid.length} invalid and ${conflicts.length} conflicting Part 5 source questions. ${JSON.stringify(report)}`);
  }
  if (!isDryRun && toInsert.length) {
    const inserted = await Question.insertMany(toInsert, { ordered: true });
    report.inserted = inserted.length;
    report.newBankCount = existingBank.length + inserted.length;
  } else {
    report.inserted = 0;
    report.newBankCount = existingBank.length;
  }
  console.log(JSON.stringify(report, null, 2));
}

try {
  await main();
} finally {
  await mongoose.disconnect().catch(() => {});
}
