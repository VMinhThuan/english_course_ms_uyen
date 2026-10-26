import assert from 'node:assert/strict';
import test from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { ensureVocabularyCatalogIndexes } from '../src/scripts/ensureVocabularyCatalogIndexes.js';

test('Vocabulary Catalog index migration detects missing indexes and applies them only on an isolated MongoDB replica set', async () => {
  const replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, ip: '127.0.0.1', dbName: 'vocabulary_catalog_index_migration_test' },
  });
  try {
    const mongoUri = replicaSet.getUri('vocabulary_catalog_index_migration_test');
    const before = await ensureVocabularyCatalogIndexes({ mongoUri, apply: false });
    assert.ok(before.some((entry) => entry.status === 'MISSING'));
    assert.ok(before.every((entry) => entry.status !== 'CONFLICT'));

    const applied = await ensureVocabularyCatalogIndexes({ mongoUri, apply: true });
    assert.ok(applied.every((entry) => entry.status === 'READY'), JSON.stringify(applied));

    const verified = await ensureVocabularyCatalogIndexes({ mongoUri, apply: false });
    assert.ok(verified.every((entry) => entry.status === 'READY'), JSON.stringify(verified));
  } finally {
    await replicaSet.stop();
  }
});
