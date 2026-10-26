import { createHash } from 'node:crypto';

export const VOCABULARY_CATALOG_CANDIDATE_SCHEMA_VERSION = '1.0.0';

function requireRelativeSourcePath(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError('Parser candidate source.relativePath is required.');
  }
  const path = value.trim().replace(/\\/g, '/');
  if (path.startsWith('/') || /^[a-z]:/i.test(path)) {
    throw new TypeError('Parser candidate source.relativePath must be relative.');
  }
  const parts = path.split('/').filter((part) => part && part !== '.');
  if (!parts.length || parts.some((part) => part === '..')) {
    throw new TypeError('Parser candidate source.relativePath must not escape its source root.');
  }
  return parts.join('/');
}

function copy(value) {
  return value === undefined ? null : structuredClone(value);
}

function requireLocator(value, name) {
  if (value !== null && value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw new TypeError('Parser candidate source.' + name + ' must be a non-negative integer or null.');
  }
  return value ?? null;
}

export function computeVocabularyCandidateSourceIdentity({
  schemaVersion = VOCABULARY_CATALOG_CANDIDATE_SCHEMA_VERSION,
  relativePath,
  fileSha256,
  sourceOrdinal,
  paragraphStart,
  paragraphEnd,
}) {
  const normalizedPath = requireRelativeSourcePath(relativePath);
  if (!/^[a-f\d]{64}$/i.test(String(fileSha256 || ''))) {
    throw new TypeError('Source fileSha256 must be a SHA-256 hex digest.');
  }
  if (!Number.isInteger(sourceOrdinal) || sourceOrdinal < 1) {
    throw new TypeError('Source sourceOrdinal must be a positive integer.');
  }
  const start = requireLocator(paragraphStart, 'paragraphStart');
  const end = requireLocator(paragraphEnd, 'paragraphEnd');
  if (start !== null && end !== null && end < start) {
    throw new TypeError('Source paragraphEnd must not precede paragraphStart.');
  }
  return createHash('sha256')
    .update(JSON.stringify([
      schemaVersion,
      normalizedPath,
      String(fileSha256).toUpperCase(),
      sourceOrdinal,
      start,
      end,
    ]))
    .digest('hex');
}

export function adaptVocabularyParserCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object' || !candidate.source) {
    throw new TypeError('A Parser V2.1 candidate with source metadata is required.');
  }

  const source = candidate.source;
  const sourcePath = requireRelativeSourcePath(source.relativePath);
  const fileSha256 = String(source.fileSha256 || '');
  if (!/^[a-f\d]{64}$/i.test(fileSha256)) {
    throw new TypeError('Parser candidate source.fileSha256 must be a SHA-256 hex digest.');
  }
  const parserVersion = source.parserVersion || candidate.parserVersion;
  if (typeof parserVersion !== 'string' || !parserVersion.trim()) {
    throw new TypeError('Parser candidate parserVersion is required.');
  }
  if (!Number.isInteger(source.sourceOrdinal) || source.sourceOrdinal < 1) {
    throw new TypeError('Parser candidate source.sourceOrdinal must be a positive integer.');
  }

  const paragraphStart = requireLocator(source.paragraphStart, 'paragraphStart');
  const paragraphEnd = requireLocator(source.paragraphEnd, 'paragraphEnd');
  if (paragraphStart !== null && paragraphEnd !== null && paragraphEnd < paragraphStart) {
    throw new TypeError('Parser candidate paragraphEnd must not precede paragraphStart.');
  }
  const sourceIdentity = computeVocabularyCandidateSourceIdentity({
    relativePath: sourcePath,
    fileSha256,
    sourceOrdinal: source.sourceOrdinal,
    paragraphStart,
    paragraphEnd,
  });

  return {
    schemaVersion: VOCABULARY_CATALOG_CANDIDATE_SCHEMA_VERSION,
    parserVersion: parserVersion.trim(),
    sourceIdentity,
    source: {
      relativePath: source.relativePath,
      normalizedRelativePath: sourcePath,
      fileSha256,
      parserVersion: parserVersion.trim(),
      sourceOrdinal: source.sourceOrdinal,
      sourceDisplayNumber: copy(source.sourceDisplayNumber),
      sourceDisplayLabel: copy(source.sourceDisplayLabel),
      paragraphStart,
      paragraphEnd,
      tableIndex: copy(source.tableIndex),
      rowIndex: copy(source.rowIndex),
      cellIndex: copy(source.cellIndex),
      layout: copy(source.layout),
      sourceFolder: copy(source.sourceFolder),
      chapterCandidate: copy(source.chapterCandidate),
      collectionCandidate: copy(source.collectionCandidate),
      topicCandidate: copy(source.topicCandidate),
    },
    tagCandidate: {
      sourceFolder: copy(source.sourceFolder),
      collectionCandidate: copy(source.collectionCandidate),
      reviewStatus: 'NEEDS_REVIEW',
    },
    chapterCandidate: {
      title: copy(source.chapterCandidate),
      topic: copy(source.topicCandidate),
      reviewStatus: 'NEEDS_REVIEW',
    },
    vocabularyCandidate: {
      word: copy(candidate.word),
      partOfSpeech: copy(candidate.partOfSpeech),
      rawPartOfSpeech: copy(candidate.rawPartOfSpeech),
      senses: copy(candidate.senses),
      notes: copy(candidate.notes),
      normalized: copy(candidate.normalized),
    },
    rawValues: copy(candidate.raw) || {},
    editedValues: {},
    duplicateMetadata: copy(candidate.duplicateCandidate),
    review: {
      status: 'NEEDS_REVIEW',
      parserStatus: copy(candidate.reviewStatus),
      reasons: copy(candidate.reviewReasons) || [],
      issues: copy(candidate.issues) || [],
      publicationEligible: false,
    },
  };
}

export default adaptVocabularyParserCandidate;
