import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import connectDB from '../configs/database.js';
import Question from '../models/Question.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const dryRun = process.argv.includes('--dry-run');

const testNumber = (question) => {
  const imported = question.sourceMetadata?.bankImport || {};
  const match = `${imported.crawlerSourceId || ''} ${imported.sourceAssessmentTitle || ''}`.match(/test[-\s]*(\d+)/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};

const sourceNumber = (question) => {
  const recorded = Number(question.sourceMetadata?.bankImport?.sourceQuestionNumber);
  if (Number.isInteger(recorded) && recorded > 0) return recorded;
  const match = String(question.questionText || '').match(/^\s*(\d+)\s*[.)]/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};

const byId = (left, right) => String(left._id).localeCompare(String(right._id));

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await connectDB();
  const filter = {
    toeicPart: 5,
    status: 'published',
    bankSourceQuestionId: { $exists: false },
    bankTargetAssessmentId: { $exists: false },
  };
  const questions = await Question.find(filter)
    .select('+sourceMetadata questionText createdAt part5BankOrder')
    .lean();
  const legacy = questions
    .filter((question) => !question.sourceMetadata?.bankImport?.sourceQuestionId)
    .sort((left, right) => right.createdAt - left.createdAt || byId(right, left));
  const crawled = questions
    .filter((question) => question.sourceMetadata?.bankImport?.sourceQuestionId)
    .sort((left, right) => testNumber(left) - testNumber(right)
      || sourceNumber(left) - sourceNumber(right)
      || byId(left, right));
  const ordered = [...legacy, ...crawled];
  if (ordered.length !== questions.length || new Set(ordered.map((question) => String(question._id))).size !== questions.length) {
    throw new Error('Unable to create one unique sequence for the Part 5 bank.');
  }

  const report = {
    dryRun,
    total: ordered.length,
    legacyCount: legacy.length,
    crawledCount: crawled.length,
    changesNeeded: ordered.filter((question, index) => question.part5BankOrder !== index + 1).length,
    firstOrder: ordered.slice(0, 3).map((question, index) => ({ order: index + 1, stem: question.questionText })),
    lastOrder: ordered.slice(-3).map((question, index) => ({ order: ordered.length - 2 + index, stem: question.questionText })),
  };
  if (!dryRun) {
    await Question.bulkWrite(ordered.map((question, index) => ({
      updateOne: {
        filter: { _id: question._id },
        update: { $set: { part5BankOrder: index + 1 } },
      },
    })), { ordered: true });
  }
  console.log(JSON.stringify(report, null, 2));
}

try {
  await main();
} finally {
  await mongoose.disconnect().catch(() => {});
}
