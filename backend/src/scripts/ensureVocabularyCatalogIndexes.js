import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { getDatabaseConnectionOptions } from '../configs/database.js';
import ChapterVocabulary from '../models/ChapterVocabulary.js';
import Vocabulary from '../models/Vocabulary.js';
import VocabularyChapter from '../models/VocabularyChapter.js';
import VocabularyImportAudit from '../models/VocabularyImportAudit.js';
import VocabularyImportBatch from '../models/VocabularyImportBatch.js';
import VocabularyImportCandidate from '../models/VocabularyImportCandidate.js';
import VocabularyImportCatalogMapping from '../models/VocabularyImportCatalogMapping.js';
import VocabularyPublicationAudit from '../models/VocabularyPublicationAudit.js';
import VocabularyTag from '../models/VocabularyTag.js';

const catalogModels = Object.freeze([
  VocabularyTag,
  VocabularyChapter,
  Vocabulary,
  ChapterVocabulary,
  VocabularyImportBatch,
  VocabularyImportCandidate,
  VocabularyImportCatalogMapping,
  VocabularyImportAudit,
  VocabularyPublicationAudit,
]);

function sameIndexKeys(left, right) {
  return JSON.stringify(Object.entries(left)) === JSON.stringify(Object.entries(right));
}

const comparableIndexOptionKeys = Object.freeze([
  'unique',
  'sparse',
  'partialFilterExpression',
  'expireAfterSeconds',
  'collation',
]);

function comparableIndexOptions(options) {
  return Object.fromEntries(comparableIndexOptionKeys
    .filter((key) => options[key] !== undefined)
    .map((key) => [key, options[key]]));
}

function sameIndexDefinition(actual, expected) {
  return sameIndexKeys(actual.key, expected.keys)
    && JSON.stringify(comparableIndexOptions(actual)) === JSON.stringify(comparableIndexOptions(expected.options));
}

function defaultIndexName(keys) {
  return Object.entries(keys).map(([field, direction]) => `${field}_${direction}`).join('_');
}

function expectedIndexes(model) {
  return model.schema.indexes().map(([keys, options]) => ({
    keys,
    options: { ...options },
    name: options.name || defaultIndexName(keys),
  }));
}

async function listIndexes(model) {
  try {
    return await model.collection.listIndexes().toArray();
  } catch (error) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
}

/**
 * Inspect, then optionally create only the Vocabulary Catalog indexes declared by
 * the schemas. This deliberately never calls syncIndexes or drops an index.
 */
export async function ensureVocabularyCatalogIndexes({ mongoUri, apply = false } = {}) {
  if (!mongoUri) throw new Error('MONGODB_URI is required for Vocabulary Catalog index inspection.');

  await mongoose.connect(mongoUri, {
    ...getDatabaseConnectionOptions({ ...process.env, MONGOOSE_AUTO_INDEX: 'false' }),
    autoIndex: false,
  });

  try {
    const report = [];
    for (const model of catalogModels) {
      const declared = expectedIndexes(model);
      let existing = await listIndexes(model);
      const missing = declared.filter((expected) => !existing.some((actual) => actual.name === expected.name));
      const conflicts = declared.filter((expected) => existing.some((actual) => actual.name === expected.name
        && !sameIndexDefinition(actual, expected)));

      if (conflicts.length > 0) {
        report.push({ model: model.modelName, status: 'CONFLICT', missing: [], conflicts: conflicts.map(({ name }) => name) });
        continue;
      }

      if (apply && missing.length > 0) {
        for (const index of missing) {
          await model.collection.createIndex(index.keys, index.options);
        }
        existing = await listIndexes(model);
      }

      const stillMissing = declared.filter((expected) => !existing.some((actual) => actual.name === expected.name));
      report.push({
        model: model.modelName,
        status: stillMissing.length === 0 ? 'READY' : 'MISSING',
        missing: stillMissing.map(({ name }) => name),
        conflicts: [],
      });
    }
    return report;
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const report = await ensureVocabularyCatalogIndexes({ mongoUri: process.env.MONGODB_URI, apply });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'check', report }, null, 2));
  if (report.some((entry) => entry.status !== 'READY')) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
