import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  importToeicQuestionOcean,
  inspectToeicQuestionOcean,
  ToeicQuestionOceanImportError,
} from '../services/toeicQuestionOceanImport.js';
import connectDB from '../configs/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

function argValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
}

function usage() {
  console.log('Usage: node src/scripts/importToeicQuestionOcean.js --repo /path/to/toeic-question-ocean [--dry-run] [--actor-id OBJECT_ID]');
}

function summarizeReport(report) {
  const skippedByPart = (report.skipped || []).reduce((counts, item) => {
    counts[item.part] = (counts[item.part] || 0) + 1;
    return counts;
  }, {});
  return {
    sourceSystem: report.sourceSystem,
    sourceRepository: 'https://github.com/kdeppaei/toeic-question-ocean',
    sourceVersion: report.sourceVersion,
    contentHash: report.contentHash,
    foundQuestionCount: report.foundQuestionCount,
    questionCount: report.questionCount,
    skippedQuestionCount: report.skippedQuestionCount,
    skippedByPart,
    countsByPart: report.countsByPart,
    groupCount: report.groups.length,
    media: report.media,
    validationErrors: report.errors.length,
    repositoryPath: report.repositoryPath,
  };
}

const args = process.argv.slice(2);
const repositoryPath = argValue(args, '--repo');
const dryRun = args.includes('--dry-run');
const actorId = argValue(args, '--actor-id') || null;

if (!repositoryPath) {
  usage();
  process.exitCode = 2;
} else {
  try {
    if (dryRun) {
      const report = await inspectToeicQuestionOcean(repositoryPath);
      console.log(JSON.stringify({ dryRun: true, ...summarizeReport(report) }, null, 2));
    } else {
      if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required for a real import.');
      await connectDB();
      const result = await importToeicQuestionOcean({ repositoryPath, actorId });
      console.log(JSON.stringify({
        dryRun: false,
        testId: result.assessment?._id,
        unchanged: result.unchanged,
        imported: result.imported,
        ...summarizeReport(result.report),
      }, null, 2));
      await mongoose.disconnect();
    }
  } catch (error) {
    if (error instanceof ToeicQuestionOceanImportError) {
      console.error(JSON.stringify({ status: 'error', code: error.code, message: error.message, details: error.details || null }, null, 2));
    } else {
      console.error(error.stack || error.message);
    }
    try { await mongoose.disconnect(); } catch {}
    process.exitCode = 1;
  }
}
