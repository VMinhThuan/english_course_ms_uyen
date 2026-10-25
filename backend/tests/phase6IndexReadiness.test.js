import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { getDatabaseConnectionOptions } from '../src/configs/database.js';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Question from '../src/models/Question.js';
import QuestionImportBatch from '../src/models/QuestionImportBatch.js';
import QuestionImportRow from '../src/models/QuestionImportRow.js';
import QuestionBankSelectionBatch from '../src/models/QuestionBankSelectionBatch.js';
import QuestionGroup from '../src/models/QuestionGroup.js';
import Assessment from '../src/models/Assessment.js';

const unique = randomUUID().replaceAll('-', '');

const expectIndex = (indexes, { name, key, unique: uniqueExpected = false, sparse = false }) => {
  const match = indexes.find((index) => index.name === name);
  assert.ok(match, `missing index ${name}`);
  assert.deepEqual(match.key, key, `${name} key mismatch`);
  assert.equal(Boolean(match.unique), uniqueExpected, `${name} unique mismatch`);
  assert.equal(Boolean(match.sparse), sparse, `${name} sparse mismatch`);
  return match;
};

const expectDuplicateKey = async (collection, document) => {
  await collection.insertOne({ _id: new mongoose.Types.ObjectId(), ...document });
  await assert.rejects(
    collection.insertOne({ _id: new mongoose.Types.ObjectId(), ...document }),
    (error) => error?.code === 11000,
    `duplicate insert into ${collection.collectionName} should fail with E11000`
  );
};

test('application startup only enables auto-index for an explicit local/test opt-in', () => {
  assert.equal(getDatabaseConnectionOptions({}).autoIndex, false);
  assert.equal(getDatabaseConnectionOptions({ NODE_ENV: 'development' }).autoIndex, false);
  assert.equal(getDatabaseConnectionOptions({ NODE_ENV: 'development', MONGOOSE_AUTO_INDEX: 'true' }).autoIndex, true);
  assert.equal(getDatabaseConnectionOptions({ NODE_ENV: 'test', MONGOOSE_AUTO_INDEX: 'true' }).autoIndex, true);
  assert.equal(getDatabaseConnectionOptions({ NODE_ENV: 'staging', MONGOOSE_AUTO_INDEX: 'true' }).autoIndex, false);
  assert.equal(getDatabaseConnectionOptions({ NODE_ENV: 'production', MONGOOSE_AUTO_INDEX: 'true' }).autoIndex, false);
});
test('Phase 6A.1 index definitions and unique constraints on an isolated MongoDB database', {
  timeout: 120_000,
}, async () => {
  assert.equal(mongoose.connection.readyState, 0, 'index test must not reuse an application database connection');
  const databaseName = `phase6_indexes_${unique}`;
  const mongoServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName: databaseName } });

  try {
    const mongoUri = mongoServer.getUri(databaseName);
    assert.equal(new URL(mongoUri).hostname, '127.0.0.1');
    assert.equal(new URL(mongoUri).pathname.replaceAll('/', ''), databaseName);
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000, autoIndex: true });
    await Assessment.createCollection();

    // `init()` awaits model index builds; any index conflict/build error fails the test here.
    await Promise.all([
      Question.init(), QuestionImportBatch.init(), QuestionImportRow.init(),
      QuestionBankSelectionBatch.init(), QuestionGroup.init(), Assessment.init(),
    ]);

    const [questionIndexes, batchIndexes, rowIndexes, selectionIndexes, groupIndexes, assessmentIndexes] = await Promise.all([
      Question.collection.indexes(),
      QuestionImportBatch.collection.indexes(),
      QuestionImportRow.collection.indexes(),
      QuestionBankSelectionBatch.collection.indexes(),
      QuestionGroup.collection.indexes(),
      Assessment.collection.indexes(),
    ]);

    expectIndex(questionIndexes, {
      name: 'uniq_question_import_stem_options_fingerprint',
      key: { importStemOptionsFingerprint: 1 }, unique: true, sparse: true,
    });
    expectIndex(questionIndexes, {
      name: 'uniq_question_bank_source_per_assessment',
      key: { bankTargetAssessmentId: 1, bankSourceQuestionId: 1 }, unique: true, sparse: true,
    });
    expectIndex(batchIndexes, {
      name: 'uniq_question_import_file_sha256', key: { fileSha256: 1 }, unique: true,
    });
    expectIndex(batchIndexes, { name: 'state_1', key: { state: 1 } });
    expectIndex(rowIndexes, {
      name: 'uniq_question_import_batch_row', key: { batchId: 1, rowNumber: 1 }, unique: true,
    });
    expectIndex(rowIndexes, { name: 'importState_1', key: { importState: 1 } });
    expectIndex(rowIndexes, { name: 'stemFingerprint_1_batchId_1', key: { stemFingerprint: 1, batchId: 1 } });
    expectIndex(rowIndexes, { name: 'stemFingerprint_1_importState_1', key: { stemFingerprint: 1, importState: 1 } });
    expectIndex(selectionIndexes, { name: 'assessment_1', key: { assessment: 1 } });
    expectIndex(selectionIndexes, {
      name: 'uniq_question_bank_selection_idempotency_key',
      key: { assessment: 1, idempotencyKey: 1 }, unique: true,
    });
    expectIndex(groupIndexes, { name: 'assessment_1_partNumber_1_order_1', key: { assessment: 1, partNumber: 1, order: 1 } });
    expectIndex(groupIndexes, {
      name: 'uniq_question_group_bank_selection_batch', key: { bankSelectionBatchId: 1 }, unique: true, sparse: true,
    });
    assert.ok(
      assessmentIndexes.some((index) => index.name === '_id_' && JSON.stringify(Object.entries(index.key || {})) === JSON.stringify([['_id', 1]])),
      `Assessment collection should expose its built-in _id index: ${JSON.stringify(assessmentIndexes)}`
    );

    const assessmentId = new mongoose.Types.ObjectId();
    const sourceQuestionId = new mongoose.Types.ObjectId();
    const batchId = new mongoose.Types.ObjectId();
    const selectionBatchId = new mongoose.Types.ObjectId();
    await expectDuplicateKey(Question.collection, { importStemOptionsFingerprint: `fp-${unique}` });
    await expectDuplicateKey(Question.collection, { bankTargetAssessmentId: assessmentId, bankSourceQuestionId: sourceQuestionId });
    await expectDuplicateKey(QuestionImportBatch.collection, { fileSha256: 'a'.repeat(64) });
    await expectDuplicateKey(QuestionImportRow.collection, { batchId, rowNumber: 2 });
    await expectDuplicateKey(QuestionBankSelectionBatch.collection, { assessment: assessmentId, idempotencyKey: `key-${unique}` });
    await expectDuplicateKey(QuestionGroup.collection, { bankSelectionBatchId: selectionBatchId });

    // Exercise the selection-batch unique key under simultaneous competing inserts.
    const raceAssessmentId = new mongoose.Types.ObjectId();
    const raceKey = `race-${unique}`;
    const raceRows = await Promise.allSettled([
      QuestionBankSelectionBatch.collection.insertOne({ _id: new mongoose.Types.ObjectId(), assessment: raceAssessmentId, idempotencyKey: raceKey }),
      QuestionBankSelectionBatch.collection.insertOne({ _id: new mongoose.Types.ObjectId(), assessment: raceAssessmentId, idempotencyKey: raceKey }),
    ]);
    assert.equal(raceRows.filter((result) => result.status === 'fulfilled').length, 1);
    const duplicateRace = raceRows.find((result) => result.status === 'rejected');
    assert.equal(duplicateRace?.reason?.code, 11000);
    assert.equal(await QuestionBankSelectionBatch.countDocuments({ assessment: raceAssessmentId, idempotencyKey: raceKey }), 1);

    console.log(JSON.stringify({
      status: 'PASS',
      database: databaseName,
      bind: '127.0.0.1 MongoMemoryServer',
      modelsInitialized: ['Question', 'QuestionImportBatch', 'QuestionImportRow', 'QuestionBankSelectionBatch', 'QuestionGroup', 'Assessment'],
      indexesEnumerated: questionIndexes.length + batchIndexes.length + rowIndexes.length + selectionIndexes.length + groupIndexes.length + assessmentIndexes.length,
      namedConstraintsAsserted: 6,
      duplicateKeyRejections: 6,
      concurrentUniqueKeyWinners: 1,
    }));
  } finally {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
    await mongoServer.stop();
  }
});
