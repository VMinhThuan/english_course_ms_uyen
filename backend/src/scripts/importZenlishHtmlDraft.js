import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../configs/database.js';
import Assessment from '../models/Assessment.js';
import Question from '../models/Question.js';
import QuestionGroup from '../models/QuestionGroup.js';
import { normalizeZenlishHtmlImport } from '../services/zenlishHtmlImport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const argValue = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
};

const testPath = argValue('--test-html');
const reviewPath = argValue('--review-html');
const dryRun = process.argv.includes('--dry-run');

if (!testPath || !reviewPath) {
  console.error('Usage: node src/scripts/importZenlishHtmlDraft.js --test-html /path/to/test.html --review-html /path/to/review.html [--dry-run]');
  process.exitCode = 2;
} else {
  const normalized = normalizeZenlishHtmlImport({
    testHtml: await fs.readFile(testPath, 'utf8'),
    reviewHtml: await fs.readFile(reviewPath, 'utf8'),
  });
  const report = {
    sourceId: normalized.sourceId,
    title: normalized.title,
    questionCount: normalized.questionCount,
    countsByPart: normalized.countsByPart,
    reviewAnswerCount: normalized.reviewAnswerCount,
    groupCount: normalized.groups.length,
    media: {
      audioGroups: normalized.groups.filter((group) => group.audioUrl).length,
      imageGroups: normalized.groups.filter((group) => group.imageUrl || group.imageUrls?.length).length,
    },
  };
  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, ...report }, null, 2));
  } else {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required to create the draft.');
    await connectDB();
    let assessment = await Assessment.findOne({ crawlerSourceSystem: normalized.sourceSystem, crawlerSourceId: normalized.sourceId })
      .select('+crawlerSourceSystem +crawlerSourceId +crawlerContentHash');
    const isCompleteExistingDraft = assessment
      && assessment.crawlerContentHash === normalized.contentHash
      && assessment.questions.length === normalized.questionCount
      && assessment.questionGroups.length === normalized.groups.length;
    if (isCompleteExistingDraft) {
      console.log(JSON.stringify({ ...report, unchanged: true, testId: assessment._id, status: assessment.status }, null, 2));
    } else {
      if (assessment && assessment.status !== 'draft') throw new Error('Chỉ có thể khôi phục hoặc nhập lại đề ở trạng thái draft.');
      if (!assessment) {
        assessment = await Assessment.create({
        title: normalized.title,
        description: normalized.description,
        type: 'exam',
        examFormat: 'toeic',
        toeicMode: 'full_test',
        durationMinutes: 120,
        toeicConfig: { totalQuestions: 200, durationMinutes: 120, listeningQuestionCount: 100, readingQuestionCount: 100, scoringMode: 'estimated_toeic' },
        parts: normalized.parts,
        status: 'draft',
        crawlerSourceSystem: normalized.sourceSystem,
        crawlerSourceId: normalized.sourceId,
        crawlerContentHash: normalized.contentHash,
        crawlerSourceUrl: normalized.sourceUrl,
        crawlerLicense: 'User attested authorized use for this import.',
        });
      } else {
        const oldQuestionIds = assessment.questions.map((item) => item.question);
        await QuestionGroup.deleteMany({ assessment: assessment._id });
        if (oldQuestionIds.length) await Question.deleteMany({ _id: { $in: oldQuestionIds } });
        assessment.title = normalized.title;
        assessment.description = normalized.description;
        assessment.parts = normalized.parts;
        assessment.questions = [];
        assessment.questionGroups = [];
        assessment.crawlerContentHash = normalized.contentHash;
      }
      const createdGroups = [];
      const createdQuestions = [];
      try {
        const groups = await QuestionGroup.insertMany(normalized.groups.map(({ questions, ...groupData }) => ({ ...groupData, assessment: assessment._id, questionIds: [] })));
        createdGroups.push(...groups.map((group) => group._id));
        const questions = await Question.insertMany(normalized.groups.flatMap((groupData, index) => groupData.questions.map((questionData) => ({
          ...questionData,
          type: 'single_choice',
          score: 1,
          status: 'draft',
          questionGroup: groups[index]._id,
        }))));
        createdQuestions.push(...questions.map((question) => question._id));
        let cursor = 0;
        const groupUpdates = groups.map((group, index) => {
          const questionIds = questions.slice(cursor, cursor + normalized.groups[index].questions.length).map((question) => question._id);
          cursor += questionIds.length;
          return { updateOne: { filter: { _id: group._id }, update: { $set: { questionIds } } } };
        });
        await QuestionGroup.bulkWrite(groupUpdates);
        assessment.questions = questions.map((question) => ({ question: question._id, score: 1 }));
        assessment.questionGroups = groups.map((group) => group._id);
        await assessment.save();
        console.log(JSON.stringify({ ...report, testId: assessment._id, status: assessment.status, imported: true }, null, 2));
      } catch (error) {
        await Question.deleteMany({ _id: { $in: createdQuestions } }).catch(() => {});
        await QuestionGroup.deleteMany({ _id: { $in: createdGroups } }).catch(() => {});
        await Assessment.findByIdAndDelete(assessment._id).catch(() => {});
        throw error;
      }
    }
    await mongoose.disconnect();
  }
}
