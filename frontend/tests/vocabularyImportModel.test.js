import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateHasDuplicate, effectiveValues, editorValues, safeSourceText } from '../src/features/vocabulary-import/model.js';

test('effective editor values overlay edits while raw and parsed source remain untouched', () => {
  const source = {
    rawValues: { sourceText: 'Original Word paragraph' },
    parsedValues: { word: 'word', partOfSpeech: ['noun'], senses: [{ meaning: 'old', examples: [{ english: 'old line', vietnamese: 'dòng cũ' }] }], notes: ['source note'] },
    editedValues: { word: 'edited', senses: [{ meaning: 'new', examples: [{ english: 'new line', vietnamese: 'dòng mới' }] }] },
  };
  const rawBefore = structuredClone(source.rawValues);
  const parsedBefore = structuredClone(source.parsedValues);
  assert.equal(effectiveValues(source).word, 'edited');
  assert.equal(editorValues(source).senses[0].meaning, 'new');
  assert.equal(safeSourceText(source.rawValues), 'Original Word paragraph');
  assert.deepEqual(source.rawValues, rawBefore);
  assert.deepEqual(source.parsedValues, parsedBefore);
});

test('duplicate annotation flags only parser/source revision/catalog matches', () => {
  assert.equal(candidateHasDuplicate({ duplicateMetadata: null }), false);
  assert.equal(candidateHasDuplicate({ duplicateMetadata: { parser: { group: 'g1' } } }), true);
  assert.equal(candidateHasDuplicate({ duplicateMetadata: { sourceRevision: { revisionDetected: true } } }), true);
  assert.equal(candidateHasDuplicate({ duplicateMetadata: { catalogMatches: [{ reuseAllowed: false }] } }), true);
});
