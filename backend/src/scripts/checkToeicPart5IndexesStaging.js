import mongoose from 'mongoose';

const EXPECTED = [
  {
    collection: 'questions',
    indexes: [
      { name: '_id_', key: { _id: 1 }, unique: true },
      { name: 'uniq_question_import_stem_options_fingerprint', key: { importStemOptionsFingerprint: 1 }, unique: true, sparse: true },
      { name: 'uniq_question_bank_source_per_assessment', key: { bankTargetAssessmentId: 1, bankSourceQuestionId: 1 }, unique: true, sparse: true },
    ],
  },
  {
    collection: 'questionimportbatches',
    indexes: [
      { name: '_id_', key: { _id: 1 }, unique: true },
      { name: 'state_1', key: { state: 1 } },
      { name: 'uniq_question_import_file_sha256', key: { fileSha256: 1 }, unique: true },
    ],
  },
  {
    collection: 'questionimportrows',
    indexes: [
      { name: '_id_', key: { _id: 1 }, unique: true },
      { name: 'importState_1', key: { importState: 1 } },
      { name: 'uniq_question_import_batch_row', key: { batchId: 1, rowNumber: 1 }, unique: true },
      { name: 'stemFingerprint_1_batchId_1', key: { stemFingerprint: 1, batchId: 1 } },
      { name: 'stemFingerprint_1_importState_1', key: { stemFingerprint: 1, importState: 1 } },
    ],
  },
  {
    collection: 'questionbankselectionbatches',
    indexes: [
      { name: '_id_', key: { _id: 1 }, unique: true },
      { name: 'assessment_1', key: { assessment: 1 } },
      { name: 'uniq_question_bank_selection_idempotency_key', key: { assessment: 1, idempotencyKey: 1 }, unique: true },
    ],
  },
  {
    collection: 'questiongroups',
    indexes: [
      { name: '_id_', key: { _id: 1 }, unique: true },
      { name: 'assessment_1_partNumber_1_order_1', key: { assessment: 1, partNumber: 1, order: 1 } },
      { name: 'uniq_question_group_bank_selection_batch', key: { bankSelectionBatchId: 1 }, unique: true, sparse: true },
    ],
  },
  {
    collection: 'assessments',
    indexes: [{ name: '_id_', key: { _id: 1 }, unique: true }],
  },
];

const sameKey = (actual, expected) => JSON.stringify(Object.entries(actual)) === JSON.stringify(Object.entries(expected));
const indexMatches = (actual, expected) => actual.name === expected.name
  && sameKey(actual.key || {}, expected.key)
  && Boolean(actual.unique) === Boolean(expected.unique)
  && Boolean(actual.sparse) === Boolean(expected.sparse);

const printUsage = () => {
  console.log('Read-only index inventory. Requires --read-only, STAGING_MONGODB_URI, and STAGING_DATABASE_NAME.');
  console.log('Example: set STAGING_MONGODB_URI and STAGING_DATABASE_NAME, then run node src/scripts/checkToeicPart5IndexesStaging.js --read-only');
  console.log('This script only lists collections and indexes. It never creates indexes or changes database data.');
};

if (process.argv.includes('--help')) {
  printUsage();
} else if (!process.argv.includes('--read-only') || !process.env.STAGING_MONGODB_URI || !process.env.STAGING_DATABASE_NAME) {
  printUsage();
  console.error('Preconditions are missing; no database connection was attempted.');
  process.exitCode = 2;
} else {
  let connection;
  try {
    connection = await mongoose.createConnection(process.env.STAGING_MONGODB_URI, {
      dbName: process.env.STAGING_DATABASE_NAME,
      readPreference: 'secondaryPreferred',
      autoIndex: false,
      maxPoolSize: 1,
      serverSelectionTimeoutMS: 7000,
    }).asPromise();

    const database = connection.db;
    const results = [];
    for (const spec of EXPECTED) {
      const collectionExists = await database.listCollections({ name: spec.collection }, { nameOnly: true }).hasNext();
      const actualIndexes = collectionExists
        ? await database.collection(spec.collection).listIndexes().toArray()
        : [];
      const missing = spec.indexes.filter((expected) => !actualIndexes.some((actual) => indexMatches(actual, expected)));
      results.push({
        collection: spec.collection,
        exists: collectionExists,
        indexes: actualIndexes.map(({ name, key, unique, sparse }) => ({ name, key, unique: Boolean(unique), sparse: Boolean(sparse) })),
        missing,
      });
    }

    const missingCount = results.reduce((sum, result) => sum + result.missing.length, 0);
    console.log(JSON.stringify({
      mode: 'read-only',
      database: process.env.STAGING_DATABASE_NAME,
      status: missingCount === 0 ? 'PASS' : 'MISSING_INDEXES',
      missingIndexCount: missingCount,
      collections: results,
    }, null, 2));
    if (missingCount > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`Index inventory failed (${error?.code || error?.name || 'unknown error'}); connection details are redacted.`);
    process.exitCode = 3;
  } finally {
    if (connection) await connection.close().catch(() => {});
  }
}
