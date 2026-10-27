import crypto from 'node:crypto';
import { DEFAULT_TOEIC_PARTS } from '../utils/toeicHelper.js';

const REQUIRED_PART_COUNTS = Object.freeze({ 1: 6, 2: 25, 3: 39, 4: 30, 5: 30, 6: 16, 7: 54 });

export class ZenlishHtmlImportError extends Error {
  constructor(message, code = 'ZENLISH_HTML_IMPORT_INVALID') {
    super(message);
    this.name = 'ZenlishHtmlImportError';
    this.code = code;
  }
}

const clean = (value) => typeof value === 'string' ? value.trim() : '';

const decodeHtml = (value) => clean(value)
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : parseInt(code, 10)))
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#0*39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>');

const textFromHtml = (value) => decodeHtml(String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));

const imageUrls = (html) => [...String(html || '').matchAll(/<img\b[^>]*\bsrc=(?:"([^"]+)"|'([^']+)')/gi)]
  .map((match) => decodeHtml(match[1] || match[2]))
  .filter((url) => /^https?:\/\//i.test(url));

const partNumberFromName = (value) => {
  const match = clean(value).match(/part\s*(\d)/i);
  return match ? Number(match[1]) : 0;
};

const questionNumberFromTitle = (value) => {
  const match = clean(value).match(/^(\d+)\s*[.]/);
  return match ? Number(match[1]) : 0;
};

function parseTestParts(html) {
  const source = String(html || '');
  const declaration = source.search(/(?:let|var|const)\s+\$testParts\s*=/);
  const openingQuote = declaration >= 0 ? source.indexOf("'", declaration) : -1;
  // Zenlish terminates this large string with `.replace(/\n|\r|\t|\\/g, "")`.
  // This delimiter is safe even when a question itself contains apostrophes.
  const closingQuote = openingQuote >= 0 ? source.indexOf("'.replace(/", openingQuote) : -1;
  if (openingQuote < 0 || closingQuote < 0) throw new ZenlishHtmlImportError('Không tìm thấy biến $testParts trong HTML làm bài.');
  try {
    return JSON.parse(source.slice(openingQuote + 1, closingQuote));
  } catch (error) {
    throw new ZenlishHtmlImportError(`Không đọc được JSON $testParts: ${error.message}`);
  }
}

function parseReviewAnswers(html) {
  const source = String(html || '');
  const starts = [...source.matchAll(/\bdata-question-number="(\d+)"/gi)];
  if (!starts.length) throw new ZenlishHtmlImportError('Không tìm thấy đáp án trong HTML lịch sử.');
  const reviewByNumber = new Map();
  starts.forEach((match, index) => {
    const section = source.slice(match.index, starts[index + 1]?.index || source.length);
    const correct = section.match(/zen-history-review-choice\s+is-correct-choice[\s\S]*?zen-history-review-choice-marker">\s*([^<\s])/i);
    if (!correct) throw new ZenlishHtmlImportError(`Không tìm thấy đáp án đúng của câu ${match[1]}.`);
    const explanation = section.match(/zen-history-explanation">([\s\S]*?)<\/div>/i);
    reviewByNumber.set(Number(match[1]), {
      correctChoice: clean(correct[1]).toUpperCase(),
      explanation: explanation ? textFromHtml(explanation[1]) : '',
    });
  });
  return reviewByNumber;
}

function sourceIdFromTitle(html) {
  const canonical = String(html || '').match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)/i)?.[1] || '';
  const slug = canonical.match(/\/stm-quizzes\/([^/?#]+)/i)?.[1] || 'zenlish-html-import';
  return { sourceId: `zenlish:${slug}`, sourceUrl: canonical };
}

export function normalizeZenlishHtmlImport({ testHtml, reviewHtml }) {
  const parts = parseTestParts(testHtml);
  const reviewByNumber = parseReviewAnswers(reviewHtml);
  const { sourceId, sourceUrl } = sourceIdFromTitle(testHtml);
  const groups = [];
  const counts = {};
  let part7SinglePassageQuestions = 0;

  for (const [partIndex, rawPart] of parts.entries()) {
    const partNumber = partNumberFromName(rawPart.term_name);
    if (!REQUIRED_PART_COUNTS[partNumber]) throw new ZenlishHtmlImportError(`Part ở vị trí ${partIndex + 1} không hợp lệ.`);
    const questionIds = Array.isArray(rawPart.term_questions) ? rawPart.term_questions : [];
    const questionsById = rawPart.questions || {};

    for (const [groupIndex, rawQuestionId] of questionIds.entries()) {
      const rawGroup = questionsById[String(rawQuestionId)];
      if (!rawGroup) throw new ZenlishHtmlImportError(`Part ${partNumber} thiếu dữ liệu question_id ${rawQuestionId}.`);
      const contentHtml = decodeHtml(rawGroup.content || '');
      const groupImageUrls = imageUrls(contentHtml);
      const subQuestions = Array.isArray(rawGroup.sub_questions) ? rawGroup.sub_questions : [];
      if (!subQuestions.length) throw new ZenlishHtmlImportError(`Question group ${rawQuestionId} không có sub_questions.`);
      const questions = subQuestions.map((subQuestion) => {
        const questionNumber = questionNumberFromTitle(subQuestion.title);
        const review = reviewByNumber.get(questionNumber);
        if (!review) throw new ZenlishHtmlImportError(`Không có đáp án review cho câu ${questionNumber || '(không rõ số)'}.`);
        const options = (subQuestion.answer || []).map((answer) => ({
          id: clean(answer.choice).toUpperCase(),
          // Part 1/2 choices are intentionally not printed in the source.
          text: clean(answer.choice_answer) || clean(answer.choice).toUpperCase(),
        }));
        if (!options.length || !options.some((option) => option.id === review.correctChoice)) {
          throw new ZenlishHtmlImportError(`Đáp án review không khớp lựa chọn của câu ${questionNumber}.`);
        }
        counts[partNumber] = (counts[partNumber] || 0) + 1;
        return {
          crawlerSourceId: `${sourceId}:question:${rawGroup.question_id}:${questionNumber}`,
          questionText: textFromHtml(subQuestion.title) || `Question ${questionNumber}`,
          options,
          correctAnswers: [review.correctChoice],
          explanation: review.explanation,
          toeicPart: partNumber,
          questionNumber,
          order: questionNumber,
          sourceType: 'licensed_html_import',
          sourceLabel: 'Authorized Zenlish HTML import',
          sourceProvider: 'Zenlish',
          sourceUrl,
        };
      });
      const passageContent = textFromHtml(contentHtml);
      const passages = partNumber >= 6 && (passageContent || groupImageUrls.length)
        ? [{ title: '', content: passageContent, imageUrls: groupImageUrls, order: 1 }]
        : [];
      const audioUrl = clean(rawGroup.audio_url);
      const type = partNumber >= 6
        ? partNumber === 7 && part7SinglePassageQuestions + questions.length > 29
          ? 'multi_passage'
          : 'passage'
        : audioUrl && groupImageUrls.length ? 'audio_image'
          : audioUrl ? 'audio'
            : groupImageUrls.length ? 'image'
              : 'single';
      groups.push({
        crawlerSourceId: `${sourceId}:group:${rawGroup.question_id}`,
        partNumber,
        type,
        title: clean(rawGroup.title) || `Part ${partNumber} - Group ${groupIndex + 1}`,
        instructions: '',
        audioUrl,
        imageUrl: partNumber === 1 ? groupImageUrls[0] || '' : '',
        imageUrls: partNumber === 1 ? groupImageUrls : [],
        passages,
        order: groupIndex + 1,
        questions,
      });
      if (partNumber === 7 && type === 'passage') part7SinglePassageQuestions += questions.length;
    }
  }

  const questionCount = groups.reduce((total, group) => total + group.questions.length, 0);
  for (const [part, expected] of Object.entries(REQUIRED_PART_COUNTS)) {
    if (counts[part] !== expected) throw new ZenlishHtmlImportError(`Part ${part} cần ${expected} câu, nhưng đọc được ${counts[part] || 0}.`);
  }
  if (questionCount !== 200 || reviewByNumber.size < 200) {
    throw new ZenlishHtmlImportError(`Dữ liệu không đủ Full Test: ${questionCount} câu hỏi, ${reviewByNumber.size} đáp án review.`);
  }
  const questionNumbers = groups.flatMap((group) => group.questions.map((question) => question.questionNumber)).sort((left, right) => left - right);
  if (questionNumbers.some((number, index) => number !== index + 1)) throw new ZenlishHtmlImportError('Số câu hỏi không liên tục từ 1 đến 200.');

  const title = decodeHtml(String(testHtml).match(/<title>\s*([^<]+?)\s*<\/title>/i)?.[1] || 'TOEIC Full Test');
  const contentHash = crypto.createHash('sha256').update(JSON.stringify({ sourceId, title, groups })).digest('hex');
  return {
    sourceSystem: 'zenlish-html-authorized',
    sourceId,
    sourceUrl,
    contentHash,
    title: `TOEIC ${title}`,
    description: 'Bản nháp được nhập từ hai HTML đã được cấp quyền sử dụng; cần tự lưu media trước khi xuất bản.',
    parts: DEFAULT_TOEIC_PARTS,
    groups,
    questionCount,
    countsByPart: counts,
    reviewAnswerCount: reviewByNumber.size,
  };
}
