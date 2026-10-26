import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import VocabularyTag from '../models/VocabularyTag.js';
import VocabularyChapter from '../models/VocabularyChapter.js';
import ChapterVocabulary from '../models/ChapterVocabulary.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(scriptDir, '../..');
const repoDir = resolve(backendDir, '..');
dotenv.config({ path: join(backendDir, '.env') });

const destructiveCollections = [
  'courses', 'lessons', 'materials', 'enrollments', 'learningprogresses',
  'instructors', 'ratings', 'reviews', 'tests', 'Tests',
];
const changedCollections = [
  ...destructiveCollections,
  'assessments', 'questions', 'vocabularies', 'vocabularytags',
  'vocabularychapters', 'chaptervocabularies', 'attempts',
];
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const confirmed = args.has('--confirm-standalone-learning-data');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = resolve(process.env.STANDALONE_DATA_BACKUP_DIR
  || join(dirname(repoDir), `${basename(repoDir)}-backup`));
const backupFile = join(backupDir, `standalone-learning-data-${timestamp}.ejson.gz`);

function normalizeChapterTitle(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

async function saveAndVerifyBackup(db, databaseName) {
  const collections = {};
  for (const name of changedCollections) {
    const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();
    collections[name] = exists ? await db.collection(name).find({}).toArray() : [];
  }
  const payload = EJSON.stringify({
    format: 'canonical-extended-json-gzip',
    createdAt: new Date(),
    databaseName,
    collections,
  }, { relaxed: false });
  await mkdir(backupDir, { recursive: true });
  const temporary = `${backupFile}.tmp`;
  await writeFile(temporary, gzipSync(Buffer.from(payload, 'utf8')));
  await rename(temporary, backupFile);

  const restored = EJSON.parse(gunzipSync(await readFile(backupFile)).toString('utf8'), { relaxed: false });
  for (const name of changedCollections) {
    if (!Array.isArray(restored.collections?.[name]) || restored.collections[name].length !== collections[name].length) {
      throw new Error(`Backup verification failed for collection ${name}. No database writes were made.`);
    }
  }
  return Object.fromEntries(changedCollections.map((name) => [name, collections[name].length]));
}

async function makeLegacyCatalogMemberships({ session, db, legacyVocabulary }) {
  if (!legacyVocabulary.length) return { migratedToCatalog: 0, createdMemberships: 0 };
  const vocabularyIds = legacyVocabulary.map((item) => item._id);
  const existingMembershipIds = new Set((await db.collection('chaptervocabularies')
    .distinct('vocabularyId', { vocabularyId: { $in: vocabularyIds } }, { session }))
    .map(String));
  const unassigned = legacyVocabulary.filter((item) => !existingMembershipIds.has(String(item._id)));

  if (unassigned.length) {
    let tag = await VocabularyTag.findOne({ slug: 'legacy-lesson-vocabulary' }).session(session);
    if (!tag) {
      const baseSlug = 'legacy-lesson-vocabulary';
      let slug = baseSlug;
      let suffix = 2;
      while (await VocabularyTag.exists({ slug }).session(session)) slug = `${baseSlug}-${suffix++}`;
      [tag] = await VocabularyTag.create([{
        name: 'Từ vựng từ bài học cũ',
        slug,
        description: 'Các từ vựng được giữ lại khi gỡ cấu trúc khóa học và bài học.',
        status: 'published',
      }], { session });
    }
    if (tag.status === 'draft') { tag.status = 'published'; await tag.save({ session }); }

    const lessonIds = [...new Set(unassigned.map((item) => String(item.lesson || '')))].filter(Boolean);
    const lessons = lessonIds.length
      ? await db.collection('lessons').find({ _id: { $in: lessonIds.map((id) => new mongoose.Types.ObjectId(id)) } }, { projection: { _id: 1, title: 1 }, session }).toArray()
      : [];
    const lessonById = new Map(lessons.map((lesson) => [String(lesson._id), lesson]));
    const groups = new Map();
    for (const item of unassigned) {
      const lessonKey = String(item.lesson || 'unassigned');
      const lesson = lessonById.get(lessonKey);
      const baseTitle = String(lesson?.title || (lessonKey === 'unassigned' ? 'Từ vựng chưa phân loại' : 'Bài học đã xóa')).trim();
      const key = lessonKey;
      if (!groups.has(key)) groups.set(key, { title: baseTitle || 'Bài học cũ', items: [] });
      groups.get(key).items.push(item);
    }

    const allTagChapters = await VocabularyChapter.find({ tagId: tag._id }).select('+normalizedTitle title sortOrder').session(session).lean();
    const usedTitles = new Set(allTagChapters.map((chapter) => chapter.normalizedTitle || normalizeChapterTitle(chapter.title)));
    let sortOrder = allTagChapters.reduce((max, chapter) => Math.max(max, chapter.sortOrder || 0), 0);
    const memberships = [];
    for (const [lessonKey, group] of groups) {
      let title = group.title;
      if (usedTitles.has(normalizeChapterTitle(title))) title = `${title} · ${lessonKey === 'unassigned' ? 'cũ' : lessonKey.slice(-6)}`;
      while (usedTitles.has(normalizeChapterTitle(title))) title = `${title} (cũ)`;
      usedTitles.add(normalizeChapterTitle(title));
      sortOrder += 10;
      const [chapter] = await VocabularyChapter.create([{
        tagId: tag._id,
        title,
        description: 'Từ được chuyển khỏi dữ liệu bài học cũ.',
        sortOrder,
        status: 'published',
      }], { session });
      group.items.forEach((item, index) => memberships.push({
        chapterId: chapter._id,
        vocabularyId: item._id,
        sortOrder: (index + 1) * 10,
        sourceIdentity: `quick-docx-migration-${randomUUID()}`,
      }));
    }
    if (memberships.length) await ChapterVocabulary.insertMany(memberships, { session, ordered: true });
  }

  return { migratedToCatalog: legacyVocabulary.length, createdMemberships: unassigned.length };
}

async function run() {
  if (apply && !confirmed) throw new Error('Apply requires --confirm-standalone-learning-data.');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured in backend/.env or the environment. No database changes were made.');
  let targetHost;
  try { targetHost = new URL(uri).hostname.toLocaleLowerCase('en'); }
  catch { throw new Error('MONGODB_URI is invalid. No database changes were made.'); }
  if (targetHost !== 'cluster0.cgaadgm.mongodb.net') {
    throw new Error(`Refusing to migrate an unexpected MongoDB cluster '${targetHost}'. Expected the Atlas cluster supplied for this dataset.`);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000, bufferCommands: false });
  const db = mongoose.connection.db;
  const databaseName = mongoose.connection.name;
  if (databaseName !== 'english_course') throw new Error(`Refusing to migrate unexpected database target '${databaseName}'. Expected 'english_course'.`);

  const counts = {};
  for (const name of changedCollections) {
    const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();
    counts[name] = exists ? await db.collection(name).countDocuments() : 0;
  }
  const existingCollections = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
  const legacyVocabularyCount = await db.collection('vocabularies').countDocuments({ $or: [
    { lesson: { $exists: true, $ne: null } },
    { course: { $exists: true, $ne: null } },
  ] });
  const legacyStandardExamCount = await db.collection('assessments').countDocuments({
    type: 'exam',
    examFormat: { $ne: 'toeic' },
  });
  const plan = {
    database: databaseName,
    mode: apply ? 'apply' : 'dry-run',
    backupFile: apply ? backupFile : null,
    collections: counts,
    presentCollections: [...existingCollections].filter((name) => changedCollections.includes(name)),
    vocabularyRowsToDetachAndPreserve: legacyVocabularyCount,
    legacyStandardExamsToHideAndPreserve: legacyStandardExamCount,
    attemptsCollectionPreserved: counts.attempts,
  };
  if (!apply) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }

  const backedUpCounts = await saveAndVerifyBackup(db, databaseName);
  const session = await mongoose.startSession();
  let vocabularyPlan = { migratedToCatalog: 0, createdMemberships: 0 };
  try {
    await session.withTransaction(async () => {
      const legacyVocabulary = await db.collection('vocabularies').find({ $or: [
        { lesson: { $exists: true, $ne: null } },
        { course: { $exists: true, $ne: null } },
      ] }, { session }).toArray();
      vocabularyPlan = await makeLegacyCatalogMemberships({ session, db, legacyVocabulary });

      if (legacyVocabulary.length) {
        await db.collection('vocabularies').updateMany({ _id: { $in: legacyVocabulary.map((item) => item._id) } }, {
          $set: { catalogOnly: true, catalogStatus: 'published', status: 'published' },
          $unset: { lesson: '', course: '' },
        }, { session });
      }
      await db.collection('assessments').updateMany({}, { $unset: { course: '', lesson: '' } }, { session });
      await db.collection('assessments').updateMany({ type: 'exam', examFormat: { $ne: 'toeic' } }, { $set: { status: 'hidden' } }, { session });
      await db.collection('questions').updateMany({}, { $unset: { lesson: '' } }, { session });
      await db.collection('vocabularytags').updateMany({ status: 'draft' }, { $set: { status: 'published' } }, { session });
      await db.collection('vocabularychapters').updateMany({ status: 'draft' }, { $set: { status: 'published' } }, { session });
    }, { readPreference: 'primary' });
  } finally {
    await session.endSession();
  }

  const droppedCollections = [];
  for (const name of destructiveCollections) {
    if (!existingCollections.has(name)) continue;
    await db.dropCollection(name);
    droppedCollections.push(name);
  }
  plan.backupVerifiedCounts = backedUpCounts;
  plan.vocabularyMigration = vocabularyPlan;
  plan.deletedCollections = droppedCollections;
  plan.remainingCollections = {
    assessments: await db.collection('assessments').countDocuments(),
    questions: await db.collection('questions').countDocuments(),
    vocabularies: await db.collection('vocabularies').countDocuments(),
    chaptervocabularies: await db.collection('chaptervocabularies').countDocuments(),
    attempts: await db.collection('attempts').countDocuments(),
  };
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

run()
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => { await mongoose.disconnect(); });
