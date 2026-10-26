import crypto from 'node:crypto';

const PART_SECTION = (partNumber) => partNumber <= 4 ? 'listening' : 'reading';
const MAX_QUESTIONS = 200;

export class ToeicCrawlerImportError extends Error {
  constructor(message, code = 'TOEIC_CRAWLER_EXPORT_INVALID') {
    super(message);
    this.name = 'ToeicCrawlerImportError';
    this.code = code;
  }
}

const text = (value) => typeof value === 'string' ? value.trim() : '';
const sourceId = (value, label) => {
  const result = text(value);
  if (!result || result.length > 200) throw new ToeicCrawlerImportError(`${label} không hợp lệ.`);
  return result;
};
const validUrl = (value) => {
  const candidate = text(value);
  if (!candidate) return '';
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
};
const mediaUrl = (entity, purpose) => {
  if (validUrl(entity?.[`${purpose}Url`])) return validUrl(entity[`${purpose}Url`]);
  const found = Array.isArray(entity?.media) && entity.media.find((item) => item?.purpose === purpose);
  return validUrl(found?.url || found?.sourceUrl || found?.originalUrl);
};
const stripUnsafeHtml = (value) => text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const questionText = (question) => text(question?.promptText) || stripUnsafeHtml(question?.promptHtml) || text(question?.questionText);

function normalizeQuestion(question, partNumber, fallbackNumber) {
  const externalId = sourceId(question?.externalId || question?.sourceId, `Câu ${fallbackNumber}: sourceId`);
  const prompt = questionText(question);
  if (!prompt) throw new ToeicCrawlerImportError(`Câu ${fallbackNumber} không có nội dung.`);
  const choices = Array.isArray(question?.choices) ? question.choices : [];
  if (choices.length < 2 || choices.length > 6) throw new ToeicCrawlerImportError(`Câu ${fallbackNumber} phải có từ 2 đến 6 lựa chọn.`);
  const options = choices.map((choice, index) => {
    const id = text(choice?.choiceKey) || text(choice?.key) || String.fromCharCode(65 + index);
    const optionText = text(choice?.contentText) || stripUnsafeHtml(choice?.contentHtml) || text(choice?.text);
    if (!id || !optionText) throw new ToeicCrawlerImportError(`Câu ${fallbackNumber} có lựa chọn không hợp lệ.`);
    return { id, text: optionText };
  });
  const correct = text(question?.correctChoiceKey);
  if (!options.some((option) => option.id === correct)) throw new ToeicCrawlerImportError(`Câu ${fallbackNumber} thiếu hoặc sai đáp án đúng.`);
  const number = Number(question?.questionNumber);
  return {
    crawlerSourceId: externalId,
    questionText: prompt,
    options,
    correctAnswers: [correct],
    explanation: text(question?.explanationText) || stripUnsafeHtml(question?.explanationHtml),
    toeicPart: partNumber,
    questionNumber: Number.isInteger(number) && number > 0 ? number : fallbackNumber,
    order: Number.isInteger(number) && number > 0 ? number : fallbackNumber,
  };
}

function normalizeGroup(group, partNumber, order, fallbackQuestionNumber) {
  const questions = Array.isArray(group?.questions) ? group.questions : [];
  const normalizedQuestions = questions.map((question, index) => normalizeQuestion(question, partNumber, fallbackQuestionNumber + index));
  if (!normalizedQuestions.length) throw new ToeicCrawlerImportError(`Nhóm Part ${partNumber} không có câu hỏi.`);
  const audioUrl = mediaUrl(group, 'audio');
  const imageUrl = mediaUrl(group, 'image');
  const content = text(group?.contentText) || stripUnsafeHtml(group?.contentHtml);
  return {
    crawlerSourceId: sourceId(group?.sourceId || `part-${partNumber}-group-${order}`, `Nhóm Part ${partNumber}: sourceId`),
    partNumber,
    type: audioUrl && imageUrl ? 'audio_image' : audioUrl ? 'audio' : imageUrl ? 'image' : content ? 'passage' : 'single',
    title: text(group?.title) || `Part ${partNumber} - Group ${order}`,
    instructions: text(group?.instructions),
    audioUrl,
    imageUrl,
    passages: content ? [{ title: '', content, order: 1 }] : [],
    order,
    questions: normalizedQuestions,
  };
}

export function normalizeToeicCrawlerExport(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ToeicCrawlerImportError('Payload JSON không hợp lệ.');
  if (payload.schemaVersion !== 5 || payload.sourceSystem !== 'dautoeic') throw new ToeicCrawlerImportError('Chỉ hỗ trợ file export-tests schemaVersion 5 từ dautoeic.');
  const test = payload.test;
  const testSourceId = sourceId(test?.sourceId, 'test.sourceId');
  const title = text(test?.title);
  if (!title) throw new ToeicCrawlerImportError('test.title không được để trống.');
  const parts = Array.isArray(payload.parts) ? payload.parts : [];
  if (!parts.length || parts.length > 7) throw new ToeicCrawlerImportError('File export phải có từ 1 đến 7 Part.');
  let nextQuestion = 1;
  const groups = [];
  const normalizedParts = parts.map((part, partIndex) => {
    const partNumber = Number(part?.partNumber);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 7) throw new ToeicCrawlerImportError(`Part ${partIndex + 1} không hợp lệ.`);
    const partGroups = Array.isArray(part?.groups) ? part.groups : [];
    const standalone = Array.isArray(part?.standaloneQuestions) ? part.standaloneQuestions : [];
    const currentGroups = partGroups.map((group, index) => {
      const result = normalizeGroup(group, partNumber, index + 1, nextQuestion);
      nextQuestion += result.questions.length;
      return result;
    });
    standalone.forEach((question, index) => {
      const normalized = normalizeQuestion(question, partNumber, nextQuestion);
      nextQuestion += 1;
      currentGroups.push({ crawlerSourceId: `standalone-${normalized.crawlerSourceId}`, partNumber, type: 'single', title: `Part ${partNumber} - Question ${normalized.questionNumber}`, instructions: '', audioUrl: mediaUrl(question, 'audio'), imageUrl: mediaUrl(question, 'image'), passages: [], order: partGroups.length + index + 1, questions: [normalized] });
    });
    groups.push(...currentGroups);
    return { partNumber, name: text(part?.title) || `Part ${partNumber}`, section: PART_SECTION(partNumber), instructions: text(part?.instructions), order: partIndex + 1, durationMinutes: 0 };
  });
  const questionCount = groups.reduce((total, group) => total + group.questions.length, 0);
  if (!questionCount || questionCount > MAX_QUESTIONS) throw new ToeicCrawlerImportError(`Số câu hỏi phải từ 1 đến ${MAX_QUESTIONS}.`);
  const contentHash = crypto.createHash('sha256').update(JSON.stringify({ testSourceId, title, parts: normalizedParts, groups })).digest('hex');
  return { sourceSystem: 'dautoeic', sourceId: testSourceId, contentHash, title, description: text(test?.description) || `Imported from approved ${payload.sourceSystem} export`, parts: normalizedParts, groups, questionCount };
}
