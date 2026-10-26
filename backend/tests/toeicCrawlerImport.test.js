import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToeicCrawlerExport, ToeicCrawlerImportError } from '../src/services/toeicCrawlerImport.js';

const exportPayload = () => ({
  schemaVersion: 5,
  sourceSystem: 'dautoeic',
  test: { sourceId: 'test-source-001', title: 'Authorized TOEIC sample', description: 'Sample export' },
  parts: [{
    partNumber: 1,
    title: 'Part 1',
    instructions: 'Listen carefully.',
    groups: [{
      sourceId: 'group-source-001',
      contentText: 'Look at the picture.',
      media: [{ purpose: 'audio', url: 'https://media.example.test/audio.mp3' }],
      questions: [{
        sourceId: 'question-source-001',
        questionNumber: 1,
        promptText: 'What is happening?',
        correctChoiceKey: 'B',
        choices: [
          { choiceKey: 'A', contentText: 'A meeting starts.' },
          { choiceKey: 'B', contentText: 'A person is walking.' },
          { choiceKey: 'C', contentText: 'A car is parked.' },
        ],
      }],
    }],
    standaloneQuestions: [{
      sourceId: 'question-source-002',
      questionNumber: 2,
      promptHtml: '<p>Where is the station?</p>',
      correctChoiceKey: 'A',
      choices: [
        { choiceKey: 'A', contentHtml: '<strong>Across the street</strong>' },
        { choiceKey: 'B', contentText: 'At noon' },
      ],
    }],
  }],
});

test('normalizes a schema v5 crawler export into safe TOEIC entities', () => {
  const result = normalizeToeicCrawlerExport(exportPayload());
  assert.equal(result.sourceId, 'test-source-001');
  assert.equal(result.questionCount, 2);
  assert.equal(result.parts[0].section, 'listening');
  assert.equal(result.groups.length, 2);
  assert.equal(result.groups[0].audioUrl, 'https://media.example.test/audio.mp3');
  assert.equal(result.groups[1].questions[0].questionText, 'Where is the station?');
  assert.equal(result.groups[1].questions[0].options[0].text, 'Across the street');
  assert.match(result.contentHash, /^[a-f0-9]{64}$/);
});

test('rejects a crawler export whose correct answer is absent from choices', () => {
  const payload = exportPayload();
  payload.parts[0].groups[0].questions[0].correctChoiceKey = 'D';
  assert.throws(() => normalizeToeicCrawlerExport(payload), ToeicCrawlerImportError);
});

test('only accepts the expected crawler schema and source system', () => {
  const payload = exportPayload();
  payload.schemaVersion = 4;
  assert.throws(() => normalizeToeicCrawlerExport(payload), /schemaVersion 5/);
  payload.schemaVersion = 5;
  payload.sourceSystem = 'other-source';
  assert.throws(() => normalizeToeicCrawlerExport(payload), /schemaVersion 5/);
});
