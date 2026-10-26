import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Vocabulary from '../models/Vocabulary.js';
import LearningProgress from '../models/LearningProgress.js';

const READ_ONLY_ACK = 'I_HAVE_VERIFIED_READ_ONLY_DB_USER';

function readTargetIdentity(uri) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('INVENTORY_URI_INVALID');
  }
  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) {
    throw new Error('INVENTORY_URI_PROTOCOL_INVALID');
  }
  if (!parsed.host || parsed.host.includes(',')) {
    throw new Error('INVENTORY_URI_HOST_UNSUPPORTED');
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\//u, ''));
  } catch {
    throw new Error('INVENTORY_URI_DATABASE_INVALID');
  }
  if (!databaseName) throw new Error('INVENTORY_URI_DATABASE_REQUIRED');
  return { host: parsed.host.toLowerCase(), databaseName };
}

function readConfiguration() {
  const uri = process.env.VOCABULARY_INVENTORY_MONGODB_URI;
  const expectedHost = process.env.VOCABULARY_INVENTORY_EXPECTED_HOST?.trim().toLowerCase();
  const expectedDatabase = process.env.VOCABULARY_INVENTORY_EXPECTED_DATABASE?.trim();
  const acknowledgement = process.env.VOCABULARY_INVENTORY_READ_ONLY_ACK;
  if (!uri || !expectedHost || !expectedDatabase) throw new Error('INVENTORY_TARGET_CONFIRMATION_REQUIRED');
  if (acknowledgement !== READ_ONLY_ACK) throw new Error('READ_ONLY_CREDENTIAL_ACK_REQUIRED');

  const actual = readTargetIdentity(uri);
  if (actual.host !== expectedHost || actual.databaseName !== expectedDatabase) {
    throw new Error('INVENTORY_TARGET_IDENTITY_MISMATCH');
  }
  return { uri, ...actual };
}

export async function runVocabularyCatalogReadOnlyInventory() {
  const target = readConfiguration();
  try {
    await mongoose.connect(target.uri, {
      autoCreate: false,
      autoIndex: false,
      bufferCommands: false,
      readPreference: 'secondaryPreferred',
      serverSelectionTimeoutMS: 5000,
    });
    if (mongoose.connection.name !== target.databaseName) {
      throw new Error('CONNECTED_DATABASE_IDENTITY_MISMATCH');
    }

    const countOptions = { maxTimeMS: 5000 };
    const [vocabularyTotal, catalogVocabulary, legacyVocabulary, learningProgress] = await Promise.all([
      Vocabulary.countDocuments({}, countOptions),
      Vocabulary.countDocuments({ catalogOnly: true }, countOptions),
      Vocabulary.countDocuments({ catalogOnly: { $ne: true } }, countOptions),
      LearningProgress.countDocuments({}, countOptions),
    ]);
    return {
      host: target.host,
      database: target.databaseName,
      collections: {
        vocabulary: vocabularyTotal,
        catalogVocabulary,
        legacyVocabulary,
        learningProgress,
      },
    };
  } finally {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const inventory = await runVocabularyCatalogReadOnlyInventory();
    console.log(JSON.stringify({ status: 'READ_ONLY_INVENTORY_COMPLETE', ...inventory }));
  } catch (error) {
    console.error(JSON.stringify({ status: 'BLOCKED', code: error.message }));
    process.exitCode = 1;
  }
}
