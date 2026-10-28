import 'dotenv/config';
import mongoose from 'mongoose';
import seedItems from '../data/part2ChallengeSeed.json' with { type: 'json' };
import Part2ChallengeQuestion from '../models/Part2ChallengeQuestion.js';

const EXPECTED_HOST = 'cluster0.cgaadgm.mongodb.net';
const EXPECTED_DATABASE = 'english_course';
const APPLY_FLAGS = ['--apply', '--confirm-part2-challenge'];

const normalize = (item) => ({
  number: item.number,
  questionText: item.questionText,
  choices: item.choices.map(({ letter, text }) => ({ letter, text })),
  correctAnswer: item.correctAnswer,
  script: item.script,
  translation: item.translation,
  audioFilename: item.audioFilename,
  audioUrl: item.audioUrl || '',
  isVisible: true,
});

const hasSameContent = (existing, incoming) => JSON.stringify(normalize(existing)) === JSON.stringify(incoming);

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error('MONGODB_URI is required. No database changes were made.');

let target;
try {
  target = new URL(mongoUri);
} catch {
  throw new Error('MONGODB_URI is invalid. No database changes were made.');
}

const databaseName = target.pathname.replace(/^\//, '');
if (target.hostname !== EXPECTED_HOST || databaseName !== EXPECTED_DATABASE) {
  throw new Error(`Refusing to import outside ${EXPECTED_HOST}/${EXPECTED_DATABASE}. No database changes were made.`);
}

const applying = APPLY_FLAGS.every((flag) => process.argv.includes(flag));
if (!applying && !process.argv.includes('--dry-run')) {
  throw new Error(`Use --dry-run or ${APPLY_FLAGS.join(' ')}.`);
}

if (seedItems.length !== 110 || seedItems.some((item, index) => item.number !== index + 1)) {
  throw new Error('Seed must contain exactly questions 1 through 110. No database changes were made.');
}

try {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  if (mongoose.connection.name !== EXPECTED_DATABASE) {
    throw new Error('Connected database did not match the expected target.');
  }

  await Part2ChallengeQuestion.init();
  const existingItems = await Part2ChallengeQuestion.find({ number: { $in: seedItems.map(({ number }) => number) } }).lean();
  const existingByNumber = new Map(existingItems.map((item) => [item.number, item]));
  const conflicts = seedItems
    .filter((incoming) => existingByNumber.has(incoming.number))
    .filter((incoming) => !hasSameContent(existingByNumber.get(incoming.number), incoming))
    .map(({ number }) => number);
  if (conflicts.length) {
    throw new Error(`Existing Part 2 documents differ at question(s): ${conflicts.join(', ')}. No documents were changed.`);
  }

  const missing = seedItems.filter(({ number }) => !existingByNumber.has(number));
  if (applying && missing.length) {
    await Part2ChallengeQuestion.bulkWrite(seedItems.map((item) => ({
      updateOne: {
        filter: { number: item.number },
        update: { $setOnInsert: normalize(item) },
        upsert: true,
      },
    })), { ordered: true });
  }

  const [total, visible, verifiedItems] = await Promise.all([
    Part2ChallengeQuestion.countDocuments(),
    Part2ChallengeQuestion.countDocuments({ isVisible: true }),
    Part2ChallengeQuestion.find({ number: { $in: seedItems.map(({ number }) => number) } }).lean(),
  ]);
  const allVerified = verifiedItems.length === 110
    && seedItems.every((item) => hasSameContent(verifiedItems.find(({ number }) => number === item.number), item));
  if (applying && (!allVerified || total !== 110 || visible !== 110)) {
    throw new Error(`Post-import verification failed (total=${total}, visible=${visible}, verified=${verifiedItems.length}).`);
  }

  console.log(JSON.stringify({
    mode: applying ? 'apply' : 'dry-run',
    target: `${EXPECTED_HOST}/${EXPECTED_DATABASE}`,
    seedQuestions: seedItems.length,
    alreadyPresent: existingItems.length,
    wouldInsert: applying ? 0 : missing.length,
    insertedOrPresent: applying ? verifiedItems.length : existingItems.length,
    audioAvailable: seedItems.filter(({ audioUrl }) => Boolean(audioUrl)).length,
    totalDocuments: total,
    visibleDocuments: visible,
    verified: applying ? allVerified : null,
  }));
} finally {
  await mongoose.disconnect().catch(() => {});
}
