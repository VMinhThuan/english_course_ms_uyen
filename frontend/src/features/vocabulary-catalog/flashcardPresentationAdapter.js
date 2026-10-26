const text = (value, max = 4000) => typeof value === 'string' ? value.slice(0, max) : '';
const textList = (value, maxItems = 30) => Array.isArray(value)
  ? value.slice(0, maxItems).filter((item) => typeof item === 'string').map((item) => text(item, 1000))
  : [];

/** Keeps the rich, student-safe Catalog sense shape intact for the shared Flashcard presentation. */
export function toCatalogFlashcardWord(word = {}) {
  const catalogSenses = Array.isArray(word.catalogSenses) ? word.catalogSenses.slice(0, 40).map((sense) => ({
    partOfSpeech: textList(sense?.partOfSpeech, 12),
    usagePattern: text(sense?.usagePattern, 500),
    meaning: text(sense?.meaning),
    examples: Array.isArray(sense?.examples) ? sense.examples.slice(0, 20).map((example) => ({
      english: text(example?.english, 2000),
      vietnamese: text(example?.vietnamese, 2000),
    })) : [],
    notes: textList(sense?.notes, 20),
  })) : [];
  const partsOfSpeech = [...new Set(catalogSenses.flatMap((sense) => sense.partOfSpeech))];
  return {
    _id: text(word._id, 100),
    word: text(word.word, 300),
    partOfSpeech: partsOfSpeech.length ? partsOfSpeech.join(', ') : text(word.partOfSpeech, 300),
    meaning: text(word.meaning),
    exampleEnglish: text(word.exampleEnglish || word.example, 2000),
    exampleVietnamese: text(word.exampleVietnamese, 2000),
    catalogSenses,
    catalogNotes: textList(word.catalogNotes, 30),
    sortOrder: Number.isFinite(Number(word.sortOrder)) ? Number(word.sortOrder) : 0,
  };
}
