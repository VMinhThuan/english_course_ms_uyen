import { startVocabularyPublicationV5aHarness } from './helpers/vocabularyPublicationV5aHarness.js';

const port = Number(process.env.VOCAB_PUBLICATION_V5A_HARNESS_PORT || 43193);
const frontendOrigin = process.env.VOCAB_PUBLICATION_V5A_FRONTEND_ORIGIN || 'http://127.0.0.1:5173';
const databaseName = 'vocabulary_publication_v5a_browser_test';
let harness;
let closing = false;

async function shutdown() {
  if (closing) return;
  closing = true;
  await harness?.close();
}

process.once('SIGINT', () => shutdown().finally(() => process.exit(0)));
process.once('SIGTERM', () => shutdown().finally(() => process.exit(0)));

try {
  harness = await startVocabularyPublicationV5aHarness({ port, frontendOrigin, databaseName });
  process.stdout.write(`VOCAB_PUBLICATION_V5A_HARNESS_READY ${harness.baseUrl} ${databaseName}\n`);
} catch (error) {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
}
