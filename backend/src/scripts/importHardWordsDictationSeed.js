import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import HardWordsDictation from '../models/HardWordsDictation.js';
import User from '../models/User.js';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const DATABASE_NAME = 'english_course';
const seedPath = fileURLToPath(new URL('../../../frontend/src/data/hardWordsDictationSeed.json', import.meta.url));
const seedItems = JSON.parse(await readFile(seedPath, 'utf8'));
const applyChanges = process.argv.includes('--apply');
const targetConfirmed = process.argv.includes(`--target=${DATABASE_NAME}`);

const validateSeed = (items) => {
  if (!Array.isArray(items) || items.length !== 16) throw new Error('Seed phải có đủ 16 mục.');
  const keys = new Set();
  for (const item of items) {
    if (!/^hard-words-test-(7|8)-section-(0[1-9]|1[0-6])$/.test(item.sourceKey || '')
      || keys.has(item.sourceKey)
      || ![7, 8].includes(item.testNumber)
      || !Number.isInteger(item.sectionNumber)
      || !Number.isInteger(item.firstWord)
      || !Number.isInteger(item.lastWord)
      || !item.title?.trim()
      || !/^Muc_\d{2}_Test_(7|8)\.mp3$/i.test(item.audioFilename || '')
      || !Array.isArray(item.answers)
      || item.answers.length !== 10
      || item.answers.some((answer) => !answer.text?.trim() || !answer.translation?.trim())) {
      throw new Error(`Dữ liệu seed không hợp lệ: ${item.sourceKey || '(không có sourceKey)'}`);
    }
    keys.add(item.sourceKey);
  }
  if (items.reduce((count, item) => count + item.answers.length, 0) !== 160) {
    throw new Error('Seed phải có đúng 160 từ.');
  }
};

validateSeed(seedItems);
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI chưa được cấu hình trong backend/.env.');
if (applyChanges && !targetConfirmed) {
  throw new Error(`Xác nhận đích bằng cả --apply và --target=${DATABASE_NAME}.`);
}

try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  if (mongoose.connection.db.databaseName !== DATABASE_NAME) {
    throw new Error(`Database hiện tại không phải ${DATABASE_NAME}; đã dừng trước khi ghi.`);
  }

  const admin = await User.findOne({ role: 'admin', isActive: true }).select('_id').lean();
  if (!admin) throw new Error('Không tìm thấy tài khoản admin đang hoạt động để gắn quyền sở hữu dữ liệu.');

  const sourceKeys = seedItems.map((item) => item.sourceKey);
  const existing = await HardWordsDictation.find({ sourceKey: { $in: sourceKeys } }).select('sourceKey audioUrl').lean();
  const existingKeys = new Set(existing.map((item) => item.sourceKey));
  const existingWithAudio = existing.filter((item) => Boolean(item.audioUrl)).length;
  const operations = seedItems.map((item) => ({
    updateOne: {
      filter: { sourceKey: item.sourceKey },
      update: {
        $set: {
          title: item.title,
          sourceWorkbook: item.sourceWorkbook,
          testNumber: item.testNumber,
          sectionNumber: item.sectionNumber,
          firstWord: item.firstWord,
          lastWord: item.lastWord,
          audioFilename: item.audioFilename,
          answers: item.answers,
        },
        $setOnInsert: {
          sourceKey: item.sourceKey,
          audioUrl: '',
          isVisible: false,
          createdBy: admin._id,
        },
      },
      upsert: true,
    },
  }));

  console.log(JSON.stringify({
    database: mongoose.connection.db.databaseName,
    mode: applyChanges ? 'apply' : 'dry-run',
    groups: seedItems.length,
    words: seedItems.reduce((count, item) => count + item.answers.length, 0),
    existingGroups: existingKeys.size,
    groupsWithoutAudio: seedItems.length - existingWithAudio,
    writesPerformed: applyChanges,
  }));

  if (applyChanges) {
    const result = await HardWordsDictation.bulkWrite(operations, { ordered: true });
    console.log(JSON.stringify({ created: result.upsertedCount, updated: result.modifiedCount }));
  }
} finally {
  await mongoose.disconnect();
}
