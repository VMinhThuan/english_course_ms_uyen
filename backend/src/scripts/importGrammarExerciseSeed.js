import dotenv from 'dotenv';
import { readFile } from 'fs/promises';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { resolve } from 'path';
import GrammarExerciseQuestion from '../models/GrammarExerciseQuestion.js';

dotenv.config({ path: resolve(fileURLToPath(new URL('../../.env', import.meta.url))) });

const run = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured.');
  const seed = JSON.parse(await readFile(new URL('../data/grammarExercises.seed.json', import.meta.url), 'utf8'));
  await mongoose.connect(process.env.MONGODB_URI);
  await GrammarExerciseQuestion.init();
  const operations = seed.map((item) => ({
    updateOne: {
      filter: { exerciseType: item.exerciseType, number: item.number },
      update: { $set: item },
      upsert: true,
    },
  }));
  const result = await GrammarExerciseQuestion.bulkWrite(operations, { ordered: true });
  const total = await GrammarExerciseQuestion.countDocuments({
    exerciseType: { $in: ['tense-classification', 'active-to-passive'] },
  });
  console.log(JSON.stringify({
    database: mongoose.connection.name,
    seedRecords: seed.length,
    inserted: result.upsertedCount,
    updated: result.modifiedCount,
    totalGrammarExerciseQuestions: total,
  }));
};

try {
  await run();
} catch (error) {
  console.error(`Grammar exercise import failed (${error.name || 'Error'}).`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
