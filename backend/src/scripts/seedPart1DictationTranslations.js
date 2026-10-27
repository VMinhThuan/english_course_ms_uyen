import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../configs/database.js';
import Part1Dictation from '../models/Part1Dictation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const argValue = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
};

const normalizeText = (value) => String(value ?? '')
  .normalize('NFKC')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase();

const parseSource = (source) => {
  const starts = [...source.matchAll(/^Day\s+(\d+)\s*\r?\nPART 1\s*\|\s*\d+\s*câu\s*\r?\n/gmi)];
  const days = new Map();

  starts.forEach((match, index) => {
    const chunk = source.slice(match.index + match[0].length, starts[index + 1]?.index);
    const answers = [...chunk.matchAll(/^\s*(\d+)\s+(.+?)\s*\r?\nDịch:\s*(.+?)\s*$/gmi)]
      .map((answer) => ({ order: Number(answer[1]), text: answer[2].trim(), translation: answer[3].trim() }));
    days.set(Number(match[1]), answers);
  });

  return days;
};

const sourcePath = argValue('--source');
const dryRun = process.argv.includes('--dry-run');

if (!sourcePath) {
  console.error('Usage: node src/scripts/seedPart1DictationTranslations.js --source /path/to/answers.txt [--dry-run]');
  process.exitCode = 2;
} else {
  const source = await fs.readFile(sourcePath, 'utf8');
  const days = parseSource(source);
  if (days.size === 0) throw new Error('Không tìm thấy dữ liệu Day / PART 1 trong file nguồn.');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required to seed translations.');

  await connectDB();
  const report = { parsedDays: days.size, updatedDays: [], unchangedDays: [], missingDays: [], mismatches: [] };

  for (const [day, sourceAnswers] of [...days.entries()].sort(([left], [right]) => left - right)) {
    const item = await Part1Dictation.findOne({ title: new RegExp(`^Part 1 - Day ${day}$`, 'i') });
    if (!item) {
      report.missingDays.push(day);
      continue;
    }

    const databaseAnswers = [...item.answers].sort((left, right) => left.order - right.order);
    const hasMatchingAnswers = databaseAnswers.length === sourceAnswers.length
      && databaseAnswers.every((answer, index) => answer.order === sourceAnswers[index].order
        && normalizeText(answer.text) === normalizeText(sourceAnswers[index].text));
    if (!hasMatchingAnswers) {
      report.mismatches.push({
        day,
        title: item.title,
        databaseCount: databaseAnswers.length,
        sourceCount: sourceAnswers.length,
      });
      continue;
    }

    const changed = databaseAnswers.some((answer, index) => answer.translation !== sourceAnswers[index].translation);
    if (!changed) {
      report.unchangedDays.push(day);
      continue;
    }

    if (!dryRun) {
      databaseAnswers.forEach((answer, index) => { answer.translation = sourceAnswers[index].translation; });
      item.markModified('answers');
      await item.save();
    }
    report.updatedDays.push(day);
  }

  console.log(JSON.stringify({ dryRun, ...report }, null, 2));
  await mongoose.disconnect();
  if (report.missingDays.length || report.mismatches.length) process.exitCode = 1;
}
