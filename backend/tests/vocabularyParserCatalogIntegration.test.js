import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import {
  REPOSITORY_ROOT,
  loadSourceAcceptance,
} from './helpers/vocabularyParserV2SourceOracle.js';
import { adaptVocabularyParserCandidate } from '../src/services/vocabularyCatalogCandidateAdapter.js';
import { validateVocabularyCandidateEnvelope } from '../src/services/vocabularyCandidatePersistence.js';

const sourceRoot = process.env.VOCABULARY_DOCX_SOURCE_ROOT;
const referenceCsv = process.env.VOCABULARY_DOCX_REFERENCE_CSV;
const manifestCsv = process.env.VOCABULARY_DOCX_SHA256_MANIFEST;
const goldenRoot = process.env.VOCABULARY_DOCX_GOLDEN_ROOT;
const sourceReady = Boolean(sourceRoot && referenceCsv && manifestCsv);
let acceptancePromise;

function getAcceptance() {
  acceptancePromise ??= loadSourceAcceptance({ sourceRoot, referenceCsv, manifestCsv });
  return acceptancePromise;
}

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n?/gu, '\n').replace(/\s+/gu, ' ').trim();
}

function normalizeStructure(value) {
  if (Array.isArray(value)) return value.map(normalizeStructure);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeStructure(child)]));
  }
  return typeof value === 'string' ? normalizeText(value) : value;
}

function compare(expected, actual) {
  if (expected === undefined) return 'NOT_ANNOTATED';
  if (JSON.stringify(expected) === JSON.stringify(actual)) return 'EXACT_MATCH';
  if (JSON.stringify(normalizeStructure(expected)) === JSON.stringify(normalizeStructure(actual))) return 'NORMALIZATION_ONLY';
  const hasValue = (value) => Array.isArray(value)
    ? value.length > 0
    : value !== null && value !== undefined && value !== '';
  if (hasValue(expected) && !hasValue(actual)) return 'MISSING_FIELD';
  if (!hasValue(expected) && hasValue(actual)) return 'EXTRA_CONTENT';
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (actual.length < expected.length) return 'MISSING_FIELD';
    if (actual.length > expected.length) return 'EXTRA_CONTENT';
    const normalizedExpected = normalizeStructure(expected);
    const normalizedActual = normalizeStructure(actual);
    if (normalizedExpected.some((item, index) => JSON.stringify(normalizedActual[index]).includes(JSON.stringify(item)))) {
      return 'EXTRA_CONTENT';
    }
  }
  if (typeof expected === 'string' && typeof actual === 'string'
    && normalizeText(actual).includes(normalizeText(expected))) return 'EXTRA_CONTENT';
  return 'INCORRECT_MAPPING';
}

function actualGoldenFields(candidate) {
  const examples = candidate.senses.flatMap((sense, senseIndex) => sense.examples.map((example) => ({
    senseIndex,
    english: example.english,
    vietnamese: example.vietnamese,
  })));
  return {
    wordPhrase: candidate.word,
    partOfSpeech: candidate.partOfSpeech,
    meaning: candidate.senses.map((sense) => sense.meaning),
    multipleSenses: candidate.senses.map((sense) => ({
      partOfSpeech: sense.partOfSpeech,
      meaning: sense.meaning,
    })),
    englishExample: examples.map((example) => example.english),
    vietnameseExample: examples.map((example) => example.vietnamese),
    examplePairing: examples.map(({ english, vietnamese }) => ({ english, vietnamese })),
    notesUsage: [
      ...candidate.senses.flatMap((sense, senseIndex) => sense.usagePattern
        ? [{ type: 'usagePattern', senseIndex, text: sense.usagePattern }]
        : []),
      ...candidate.notes.map((note) => ({ type: 'note', senseIndex: null, text: note.text })),
    ],
    sourceOrdinal: candidate.source.sourceOrdinal,
    sourceDisplayNumber: candidate.source.sourceDisplayNumber,
    sourceParagraphLocator: {
      paragraphStart: candidate.source.paragraphStart,
      paragraphEnd: candidate.source.paragraphEnd,
    },
    chapterTopic: {
      chapterCandidate: candidate.source.chapterCandidate,
      topicCandidate: candidate.source.topicCandidate,
    },
    senseExampleAssociation: examples,
  };
}

function expectedGoldenFields(entry) {
  const expected = entry.expected;
  const examples = expected.senses.flatMap((sense, senseIndex) => sense.examples.map((example) => ({
    senseIndex,
    english: example.english,
    vietnamese: example.vietnamese,
  })));
  return {
    wordPhrase: expected.word,
    partOfSpeech: expected.partOfSpeech,
    meaning: expected.senses.map((sense) => sense.meaning),
    multipleSenses: expected.senses.map((sense) => ({
      partOfSpeech: sense.partOfSpeech,
      meaning: sense.meaning,
    })),
    englishExample: examples.map((example) => example.english),
    vietnameseExample: examples.map((example) => example.vietnamese),
    examplePairing: examples.map(({ english, vietnamese }) => ({ english, vietnamese })),
    notesUsage: [
      ...expected.senses.flatMap((sense, senseIndex) => sense.usagePattern
        ? [{ type: 'usagePattern', senseIndex, text: sense.usagePattern }]
        : []),
      ...expected.notes.map((note) => ({
        type: 'note',
        senseIndex: null,
        text: typeof note === 'string' ? note : note.text,
      })),
    ],
    sourceOrdinal: expected.sourceOrdinal,
    sourceDisplayNumber: expected.sourceDisplayNumber,
    sourceParagraphLocator: expected.sourceParagraphLocator,
    chapterTopic: {
      chapterCandidate: expected.chapterCandidate,
      topicCandidate: expected.topicCandidate,
    },
    senseExampleAssociation: examples,
  };
}

test('actual 30-DOCX Parser V2.1 to Adapter V1 dry-run preserves all 711 occurrences', {
  skip: !sourceReady && 'Set the three VOCABULARY_DOCX_* source paths to run the real-source dry-run.',
}, async () => {
  const acceptance = await getAcceptance();
  assert.equal(acceptance.directFolders.length, 3);
  assert.equal(acceptance.files.length, 30);
  assert.equal(acceptance.allFiles.length, 30);
  assert.equal(acceptance.references.length, 711);
  assert.equal(acceptance.manifest.length, 30);
  assert.equal(acceptance.result.documents.length, 30);
  assert.equal(acceptance.result.items.length, 711);
  assert.equal(acceptance.result.summary.needsReview, 711);
  assert.equal(acceptance.result.duplicateGroups.length, 14);
  assert.equal(acceptance.result.summary.duplicateOccurrences, 29);

  const envelopes = acceptance.result.items.map(adaptVocabularyParserCandidate);
  const identities = new Set(envelopes.map((envelope) => envelope.sourceIdentity));
  assert.equal(identities.size, 711, 'every source occurrence has a distinct sourceIdentity');
  assert.deepEqual(
    envelopes.map((envelope) => envelope.sourceIdentity),
    acceptance.result.items.map((candidate) => adaptVocabularyParserCandidate(candidate).sourceIdentity),
    'adapter output retains parser order across the complete source set',
  );
  assert.ok(envelopes.every((envelope) => !Object.hasOwn(envelope, '_id')), 'adapter does not create MongoDB IDs');
  assert.ok(envelopes.every((envelope) => envelope.review.status === 'NEEDS_REVIEW'));
  assert.ok(envelopes.every((envelope) => envelope.review.publicationEligible === false));

  const originalByPathOrdinal = new Map(acceptance.result.items.map((candidate) => [
    candidate.source.relativePath + '|' + candidate.source.sourceOrdinal,
    candidate,
  ]));
  for (const envelope of envelopes) {
    const key = envelope.source.relativePath + '|' + envelope.source.sourceOrdinal;
    const original = originalByPathOrdinal.get(key);
    assert.ok(original);
    assert.equal(envelope.schemaVersion, '1.0.0');
    assert.equal(envelope.parserVersion, original.source.parserVersion);
    assert.deepEqual(envelope.rawValues, original.raw);
    assert.equal(envelope.vocabularyCandidate.word, original.word);
    assert.deepEqual(envelope.vocabularyCandidate.senses, original.senses);
    assert.deepEqual(envelope.vocabularyCandidate.partOfSpeech, original.partOfSpeech);
    assert.deepEqual(envelope.vocabularyCandidate.rawPartOfSpeech, original.rawPartOfSpeech);
    assert.deepEqual(envelope.vocabularyCandidate.notes, original.notes);
    assert.deepEqual(envelope.vocabularyCandidate.normalized, original.normalized);
    assert.deepEqual(envelope.tagCandidate, {
      sourceFolder: original.source.sourceFolder,
      collectionCandidate: original.source.collectionCandidate,
      reviewStatus: 'NEEDS_REVIEW',
    });
    assert.deepEqual(envelope.chapterCandidate, {
      title: original.source.chapterCandidate,
      topic: original.source.topicCandidate,
      reviewStatus: 'NEEDS_REVIEW',
    });
    assert.deepEqual(envelope.duplicateMetadata, original.duplicateCandidate);
    assert.deepEqual(envelope.review.reasons, original.reviewReasons);
    assert.deepEqual(envelope.review.issues, original.issues);
    assert.equal(envelope.source.normalizedRelativePath, original.source.relativePath.replace(/\\/g, '/'));
    for (const field of [
      'relativePath',
      'fileSha256',
      'parserVersion',
      'sourceOrdinal',
      'sourceDisplayNumber',
      'sourceDisplayLabel',
      'paragraphStart',
      'paragraphEnd',
      'tableIndex',
      'rowIndex',
      'cellIndex',
      'layout',
      'sourceFolder',
      'chapterCandidate',
      'collectionCandidate',
      'topicCandidate',
    ]) {
      assert.deepEqual(envelope.source[field], original.source[field] ?? null, 'source.' + field + ' is retained');
    }
    assert.equal(envelope.source.fileSha256, original.source.fileSha256);
    assert.equal(envelope.source.parserVersion, original.source.parserVersion);
    assert.equal(envelope.source.sourceOrdinal, original.source.sourceOrdinal);
    assert.equal(envelope.source.paragraphStart, original.source.paragraphStart);
    assert.equal(envelope.source.paragraphEnd, original.source.paragraphEnd);
    assert.equal(validateVocabularyCandidateEnvelope(envelope).valid, true);
  }

  const folders = new Set(envelopes.map((envelope) => envelope.source.sourceFolder));
  const chapters = new Set(envelopes.map((envelope) => envelope.source.relativePath));
  assert.equal(folders.size, 3);
  assert.equal(chapters.size, 30, 'one source DOCX remains one Chapter candidate');

  const releaseOccurrences = envelopes.filter((envelope) => envelope.vocabularyCandidate.word.toLowerCase() === 'release');
  assert.equal(releaseOccurrences.length, 2);
  assert.ok(releaseOccurrences.every((envelope) => envelope.duplicateMetadata?.merged === false));

  const sample = acceptance.result.items[0];
  const sameSourceRetry = adaptVocabularyParserCandidate(sample);
  const changedFileIdentity = adaptVocabularyParserCandidate({
    ...sample,
    source: { ...sample.source, fileSha256: 'a'.repeat(64) === sample.source.fileSha256
      ? 'b'.repeat(64)
      : 'a'.repeat(64) },
  });
  assert.equal(sameSourceRetry.sourceIdentity, envelopes[0].sourceIdentity);
  assert.notEqual(changedFileIdentity.sourceIdentity, envelopes[0].sourceIdentity);
});

test('90-entry independent expanded goldens compare without writing source text', {
  skip: !goldenRoot && 'Set VOCABULARY_DOCX_GOLDEN_ROOT to the existing private golden-evidence directory.',
}, async () => {
  const acceptance = await getAcceptance();
  const goldenPath = path.join(goldenRoot, 'INDEPENDENT_GOLDEN_REFERENCE.json');
  const evidencePath = path.join(goldenRoot, 'raw-ooxml-sample-evidence.json');
  const [golden, evidence] = await Promise.all([
    readFile(goldenPath, 'utf8').then(JSON.parse),
    readFile(evidencePath, 'utf8').then(JSON.parse),
  ]);
  assert.equal(golden.entries.length, 90);

  const candidates = new Map(acceptance.result.items.map((candidate) => [
    candidate.source.relativePath + '|' + candidate.source.sourceOrdinal,
    candidate,
  ]));
  const rawEvidence = new Map(evidence.entries.map((row) => [
    row.sourcePath + '|' + row.sourceOrdinal,
    row,
  ]));
  const fields = [
    'wordPhrase',
    'partOfSpeech',
    'meaning',
    'multipleSenses',
    'englishExample',
    'vietnameseExample',
    'examplePairing',
    'notesUsage',
    'sourceOrdinal',
    'sourceDisplayNumber',
    'sourceParagraphLocator',
    'chapterTopic',
    'senseExampleAssociation',
    'rawSourcePreserved',
  ];
  const totals = Object.fromEntries([
    'EXACT_MATCH',
    'NORMALIZATION_ONLY',
    'MISSING_FIELD',
    'INCORRECT_MAPPING',
    'EXTRA_CONTENT',
    'AMBIGUOUS_SOURCE',
    'NOT_ANNOTATED',
  ].map((status) => [status, 0]));
  const fieldTotals = Object.fromEntries(fields.map((field) => [field, Object.fromEntries(
    Object.keys(totals).map((status) => [status, 0]),
  )]));
  let sourceHashMatches = 0;
  let needsReviewCount = 0;

  for (const entry of golden.entries) {
    const key = entry.sourcePath + '|' + entry.sourceOrdinal;
    const candidate = candidates.get(key);
    const sourceRow = rawEvidence.get(key);
    assert.ok(candidate, 'golden source occurrence must exist in Parser output');
    assert.ok(sourceRow, 'golden raw-source evidence must exist');
    if (candidate.source.fileSha256.toLowerCase() === entry.sourceSha256.toLowerCase()) sourceHashMatches += 1;
    if (candidate.reviewStatus === 'NEEDS_REVIEW') needsReviewCount += 1;

    const actual = actualGoldenFields(candidate);
    const expected = expectedGoldenFields(entry);
    actual.rawSourcePreserved = candidate.raw.paragraphs
      .filter((paragraph) => paragraph.text.trim())
      .map((paragraph) => paragraph.text)
      .join('\n');
    expected.rawSourcePreserved = sourceRow.rawParagraphs
      .filter((paragraph) => paragraph.rawText.trim())
      .map((paragraph) => paragraph.rawText)
      .join('\n');

    for (const field of fields) {
      let status;
      if ((entry.ambiguity || []).includes(field)) {
        status = 'AMBIGUOUS_SOURCE';
      } else if (field === 'senseExampleAssociation'
        && (entry.ambiguity || []).some((item) => ['exampleSenseAssociation', 'vietnameseExample', 'examplePairing'].includes(item))) {
        status = 'AMBIGUOUS_SOURCE';
      } else {
        status = compare(expected[field], actual[field]);
      }
      totals[status] += 1;
      fieldTotals[field][status] += 1;
    }
  }

  assert.equal(sourceHashMatches, 90);
  assert.equal(needsReviewCount, 90);
  assert.equal(totals.EXACT_MATCH, 1254, JSON.stringify({ totals, fieldTotals }));
  assert.equal(totals.AMBIGUOUS_SOURCE, 6);
  assert.equal(totals.NORMALIZATION_ONLY, 0);
  assert.equal(totals.MISSING_FIELD, 0);
  assert.equal(totals.INCORRECT_MAPPING, 0);
  assert.equal(totals.EXTRA_CONTENT, 0);
  assert.equal(totals.NOT_ANNOTATED, 0);
});
