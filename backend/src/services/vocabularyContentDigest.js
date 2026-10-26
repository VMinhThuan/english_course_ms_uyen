import { createHash } from 'node:crypto';

function plainValue(value) {
  if (value && typeof value.toObject === 'function') {
    return plainValue(value.toObject({ depopulate: true, transform: false }));
  }
  if (value && typeof value.toHexString === 'function') return value.toHexString();
  if (Array.isArray(value)) return value.map(plainValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, plainValue(value[key])]));
  }
  return value;
}

export function stableVocabularyJson(value) {
  return JSON.stringify(plainValue(value));
}

export function vocabularyContentHash(value) {
  return createHash('sha256').update(stableVocabularyJson(value)).digest('hex');
}

export function effectiveCandidateValues(candidate) {
  const parsed = candidate?.parsedValues || {};
  const edited = candidate?.editedValues || {};
  const values = { ...parsed, ...edited };
  if (Array.isArray(edited.senses) && Array.isArray(parsed.senses)) {
    values.senses = edited.senses.map((sense, index) => ({ ...(parsed.senses[index] || {}), ...sense }));
  }
  return values;
}

export function candidateEditorialSnapshot(candidate) {
  const values = effectiveCandidateValues(candidate);
  return {
    word: values.word || '',
    partOfSpeech: Array.isArray(values.partOfSpeech) ? values.partOfSpeech : [],
    senses: Array.isArray(values.senses) ? values.senses : [],
    notes: Array.isArray(values.notes) ? values.notes : [],
  };
}

export function catalogSensesFromCandidate(candidate) {
  const senses = effectiveCandidateValues(candidate).senses;
  return (Array.isArray(senses) ? senses : []).map((sense) => ({
    partOfSpeech: Array.isArray(sense.partOfSpeech) ? sense.partOfSpeech : [],
    rawPartOfSpeech: sense.rawPartOfSpeech || '',
    usagePattern: sense.usagePattern || '',
    meaning: sense.meaning,
    normalizedMeaning: sense.normalizedMeaning || sense.meaning,
    examples: (Array.isArray(sense.examples) ? sense.examples : []).map((example) => ({
      english: example.english || '',
      vietnamese: example.vietnamese || '',
    })),
    notes: Array.isArray(sense.notes) ? sense.notes : [],
    sourceLocators: Array.isArray(sense.sourceLocators) ? sense.sourceLocators : [],
  }));
}

export function candidateCatalogSnapshot(candidate) {
  const values = effectiveCandidateValues(candidate);
  const firstSense = values.senses?.[0] || {};
  const firstExample = firstSense.examples?.[0] || {};
  return {
    word: values.word || '',
    partOfSpeech: Array.isArray(values.partOfSpeech) ? values.partOfSpeech.join(', ') : '',
    meaning: firstSense.meaning || '',
    exampleEnglish: firstExample.english || '',
    exampleVietnamese: firstExample.vietnamese || '',
    catalogSenses: catalogSensesFromCandidate(candidate),
    catalogNotes: Array.isArray(values.notes) ? values.notes : [],
  };
}

export function vocabularyCatalogSnapshot(vocabulary) {
  return {
    word: vocabulary?.word || '',
    partOfSpeech: vocabulary?.partOfSpeech || '',
    meaning: vocabulary?.meaning || '',
    exampleEnglish: vocabulary?.exampleEnglish || vocabulary?.example || '',
    exampleVietnamese: vocabulary?.exampleVietnamese || '',
    catalogSenses: Array.isArray(vocabulary?.catalogSenses) ? vocabulary.catalogSenses : [],
    catalogNotes: Array.isArray(vocabulary?.catalogNotes) ? vocabulary.catalogNotes : [],
  };
}

export function publicationEntitySnapshot(entityType, entity) {
  if (entityType === 'TAG') {
    return {
      name: entity.name || '',
      slug: entity.slug || '',
      description: entity.description || '',
      sortOrder: entity.sortOrder || 0,
    };
  }
  if (entityType === 'CHAPTER') {
    return {
      tagId: String(entity.tagId || ''),
      title: entity.title || '',
      description: entity.description || '',
      chapterNumber: entity.chapterNumber ?? null,
      sortOrder: entity.sortOrder || 0,
    };
  }
  if (entityType === 'VOCABULARY') return vocabularyCatalogSnapshot(entity);
  throw new TypeError(`Unsupported publication entity type: ${entityType}`);
}
