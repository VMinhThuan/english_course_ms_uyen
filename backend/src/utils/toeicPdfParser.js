import { createRequire } from 'module';

let pdfParseModule = null;
let PDFParseClass = null;

const getPdfParser = () => {
  if (!pdfParseModule && !PDFParseClass) {
    try {
      const require = createRequire(import.meta.url);
      pdfParseModule = require('pdf-parse');
      PDFParseClass = pdfParseModule?.PDFParse || pdfParseModule;
    } catch (err) {
      console.warn('PDF parser module could not be loaded:', err.message);
    }
  }
  return { pdfParseModule, PDFParseClass };
};

const stripPdfPageMarkers = (text = '') => text.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, ' ');

const getMeaningfulTextCharacterCount = (text = '') =>
  (stripPdfPageMarkers(text).match(/[\p{L}\p{N}]/gu) || []).length;

const getPdfPageCount = (text = '') => {
  const markers = text.match(/--\s*\d+\s+of\s+\d+\s*--/gi) || [];
  if (markers.length === 0) return 0;
  const lastMarker = markers[markers.length - 1].match(/of\s+(\d+)/i);
  return lastMarker ? parseInt(lastMarker[1], 10) : markers.length;
};

const TOEIC_FULL_TEST_QUESTION_RANGES = {
  1: [1, 6],
  2: [7, 31],
  3: [32, 70],
  4: [71, 100],
  5: [101, 130],
  6: [131, 146],
  7: [147, 200],
};

const TOEIC_FULL_TEST_QUESTION_COUNTS = {
  1: 6,
  2: 25,
  3: 39,
  4: 30,
  5: 30,
  6: 16,
  7: 54,
};

const ANSWER_KEY_HEADER_REGEX = /^\s*(?:ANSWER\s*KEYS?|ANSWERS?|KEY|ĐÁP\s*ÁN)(?:\s*[:\-]?\s*(?:(?:QUESTIONS?\s*)?\d{1,3}(?:\s*(?:[-–]|to)\s*\d{1,3})?|\d{1,3}\+)?)?\s*$/im;
const INLINE_ANSWER_KEY_HEADER_REGEX = /\bANSWER\s*KEYS?\b/i;

const findAnswerKeyHeader = (text = '') => {
  const standaloneMatch = ANSWER_KEY_HEADER_REGEX.exec(text);
  if (standaloneMatch) {
    return {
      index: standaloneMatch.index,
      end: standaloneMatch.index + standaloneMatch[0].length,
      inline: false,
    };
  }

  const inlineMatch = INLINE_ANSWER_KEY_HEADER_REGEX.exec(text);
  return inlineMatch
    ? { index: inlineMatch.index, end: inlineMatch.index + inlineMatch[0].length, inline: true }
    : null;
};

const OPTION_MARKER_REGEX = /(?:^|\s)(?:\(\s*([A-D©0O])\s*\)|([A-D©])[.)](?=\s|$)|\(\s*([0O])\s*\)|([©®])(?=\s+[\p{L}(]))\s*/giu;

const parseOptionLine = (rawLine, firstOptionIndex = 0) => {
  let line = String(rawLine || '').trim();
  const prefixedLabel = line.match(/^([A-D])\s*:\s*/i);
  if (prefixedLabel) line = line.slice(prefixedLabel[0].length).trimStart();

  const markers = [...line.matchAll(OPTION_MARKER_REGEX)];
  if (markers.length === 0 || markers[0].index !== 0) {
    if (!prefixedLabel) return null;
    return [{ letter: prefixedLabel[1].toUpperCase(), text: line.trim() }];
  }

  return markers.map((marker, index) => {
    const rawLetter = (marker[1] || marker[2] || marker[3] || marker[4]).toUpperCase();
    const expectedLetter = String.fromCharCode(65 + firstOptionIndex + index);
    let letter = rawLetter;
    if (rawLetter === '©') letter = 'C';
    else if ((rawLetter === '0' || rawLetter === 'O') && expectedLetter === 'D') letter = 'D';

    const contentStart = marker.index + marker[0].length;
    const contentEnd = markers[index + 1]?.index ?? line.length;
    return { letter, text: line.slice(contentStart, contentEnd).trim() };
  });
};

const trimPdfInstructionTail = (text = '') => {
  const markers = [
    /\bGO\s+ON\s+TO\s+THE\s+NEXT\s+PAGE\b/i,
    /\bTHIS\s+IS\s+THE\s+END\s+OF\s+THE\b/i,
    /\bTURN\s+TO\s+PART\s*[1-7]\b/i,
    /\bREADING\s+TEST\b/i,
    /\b(?:CHECK\s+(?:SOME|ANY|YOUR)\s+COMPLETED|WHEN\s+YOU\s+HAVE\s+FINISHED|CHECK\s+YOUR\s+WORK)\b/i,
    /\b(?:I\s*F|IF)\s+YOU\s+FINISH\s+BEFORE\s+TIME\s+IS\s+CALLED\b/i,
    /\bFINISH\s+BEFORE\s+TIME\s+IS\s+CALLED\b/i,
    /\bYOU\s+MAY\s+GO\s+(?:ON\s+TO\s+THE\s+NEXT\s+PAGE|AND\s+CHECK\s+YOUR\s+WORK)\b/i,
    /\b(?:STOP[!.]?\s*)?BACK\s+TO\s+PARTS?\s*[1-7]\b/i,
    /\bANSWER\s+KEYS?\b/i,
    /\bDO\s+NOT\s+WRITE\s+YOUR\s+ANSWERS?\b/i,
  ];
  let end = text.length;
  for (const marker of markers) {
    const match = marker.exec(text);
    if (match && match.index < end) end = match.index;
  }
  const content = text.slice(0, end);
  const layoutArtifact = /\s+(?:[|¦]{1,}|[=~]{1,}|#\s*\d+|\[[ilI1]\])/u.exec(content);
  if (layoutArtifact && layoutArtifact.index < end) end = layoutArtifact.index;
  const cleaned = text.slice(0, end);
  return cleaned
    .replace(layoutArtifact ? /\s+[iIl]\s*$/u : /$^/, '')
    .replace(/\s+(?:test[.!]?\s*)$/i, '')
    .replace(/[\s‘’“”"']+$/g, '')
    .trim();
};

const findEmbeddedPart7Question = (text = '') => {
  const suffixRegex = /\s+(?=(?:At\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\s*,?\s*)?(?:what|who|where|when|why|how|which)\b)[\s\S]*?\?\s*[”"']?/i;
  const match = suffixRegex.exec(text);
  if (!match) return null;
  const optionText = text.slice(0, match.index).trim();
  if (optionText.length < 20 && !/[.!?][”"')\]]?\s*$/.test(optionText)) return null;
  return { optionText, questionText: text.slice(match.index).trim() };
};

const isSuspiciousOcrOptionText = (text = '') =>
  text.length > 240
  || /\b(?:GO\s+ON\s+TO\s+THE\s+NEXT\s+PAGE|BACK\s+TO\s+PARTS?|ANSWER\s+KEYS?|IF\s+YOU\s+FINISH\s+BEFORE\s+TIME\s+IS\s+CALLED)\b/i.test(text)
  || /\b(?:FINISH\s+BEFORE\s+TIME\s+IS\s+CALLED|YOU\s+MAY\s+GO\s+(?:ON\s+TO\s+THE\s+NEXT\s+PAGE|AND\s+CHECK\s+YOUR\s+WORK))\b/i.test(text)
  || /(?:[|¦]{2,}|={2,}|~{2,}|#\s*\d+|\[[ilI1]\])/u.test(text)
  || Boolean(findEmbeddedPart7Question(text));

const cleanPart7OptionText = (rawText = '') => {
  let text = trimPdfInstructionTail(rawText);
  let truncated = text !== String(rawText || '').trim();
  const embeddedQuestion = findEmbeddedPart7Question(text);
  if (embeddedQuestion) {
    text = embeddedQuestion.optionText;
    truncated = true;
    const firstSentence = text.match(/^(.{8,180}?[.!?])(?:\s|$)/);
    if (firstSentence && firstSentence[1].length < text.length) text = firstSentence[1];
  }

  // OCR can flatten the first sentence of the next passage into option D.
  // Those passages begin with a new sentence or a document heading; keep the
  // answer-sized phrase and force the question into the review list.
  const headingBoundary = /\s+(?=(?:The|This|These|Those|Dear|From|To|Subject|Date|Name|Results|Executive|Questions?)\s+[A-Z0-9])/g;
  const headingMatch = headingBoundary.exec(text);
  if (headingMatch && headingMatch.index >= 28) {
    text = text.slice(0, headingMatch.index).trim();
    truncated = true;
  }

  if (text.length > 75) {
    const sentenceBreak = /[.!?][”"')\]]?\s+/g.exec(text);
    if (sentenceBreak && sentenceBreak.index >= 18) {
      text = text.slice(0, sentenceBreak.index + 1).trim();
      truncated = true;
    }
  }

  return { text: text.trim(), truncated };
};

const isPart7QuestionPlaceholder = (question) =>
  /^Question\s+\d+$/i.test(question?.questionText || '');

const isLikelyPart7QuestionStem = (line = '') =>
  /^(?:(?:what|who|where|when|why|how|which|whose|whom)\b|according to\b|in which\b|the word\b|on the (?:first|second|third)\b|at what\b)/i.test(line.trim());

const PART6_MULTIWORD_NOISE_REGEX = /\b(?:\d{1,2}\s+)?way\s+~~\s+\w\b/gi;
const PART6_OCR_ARTIFACT_WORDS = new Set(['eeth', 'etre', 'ett', 'een', 'evie', 'jae']);
const PART6_SHORT_VALID_WORDS = new Set([
  'a', 'i', 'am', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'if', 'in', 'is', 'it', 'me', 'my', 'no', 'of',
  'on', 'or', 'so', 'to', 'up', 'us', 'we', 'the', 'and', 'are', 'but', 'for', 'not', 'you', 'your', 'his', 'her',
  'they', 'that', 'this', 'with', 'will', 'any', 'all', 'was', 'were', 'had', 'has', 'have', 'can', 'may', 'one',
  'two', 'new', 'web', 'ceo', 'inc', 'apt', 'mr', 'ms',
]);

const getPart6QuestionNumberFromToken = (token, orderedQuestionNumbers) => {
  const digits = String(token).match(/\d{1,3}/)?.[0];
  if (!digits) return null;

  const exactMatch = orderedQuestionNumbers.find((questionNumber) => String(questionNumber) === digits);
  if (exactMatch) return exactMatch;
  if (digits.length > 2) return null;

  const suffixMatches = orderedQuestionNumbers.filter((questionNumber) => String(questionNumber).slice(-2) === digits.padStart(2, '0'));
  return suffixMatches.length === 1 ? suffixMatches[0] : null;
};

const getPart6OcrArtifactScore = (token, orderedQuestionNumbers) => {
  const core = String(token)
    .replace(/^[^\p{L}\p{N}]+/gu, '')
    .replace(/[^\p{L}\p{N}]+$/gu, '');
  const lowerCore = core.toLowerCase();
  if (!core) return 0;

  if (getPart6QuestionNumberFromToken(token, orderedQuestionNumbers)) return 5;
  if (PART6_OCR_ARTIFACT_WORDS.has(lowerCore)) return 4;

  const structuralMarks = String(token).match(/[=~|°º]/g) || [];
  const separatorMarks = String(token).match(/[;:]/g) || [];
  const dashMarks = String(token).match(/[-–—]/g) || [];
  if ((structuralMarks.length > 0 && /[\p{L}\p{N}]/u.test(core)) || separatorMarks.length >= 2 || (dashMarks.length >= 2 && /[\p{L}\p{N}]/u.test(core))) {
    return 4;
  }

  if (/^[A-Z]{1,5}$/.test(core) && !PART6_SHORT_VALID_WORDS.has(lowerCore)) return 3;
  if (/^[a-z][A-Z]{1,2}$/.test(core)) return 3;
  if (/^[a-z]{1,3}[”"']$/.test(String(token))) return 3;
  if (/^[a-z]{1,3};$/.test(String(token))) return 3;
  if (/^[“"']?\d{1,2}[a-z]{1,3}[.,!?]?$/i.test(token)) return 3;
  return 0;
};

const isLikelyPageFooterNoise = (line, pageNumber) => {
  if (/^[\W_]{2,}$/u.test(line)) return true;
  if (/^(?:RT\s+SR\s+ER|OT\s+RH|EM\s+EE\]?)$/i.test(line)) return true;
  if (/^(?:[a-z](?:\s+[a-z]){0,2})$/i.test(line)) return true;
  if (/^(?:[a-z]{1,2}\s+){1,2}[a-z]{1,2}$/i.test(line) && line === line.toLowerCase()) return true;

  const leadingPageNumber = line.match(/^(\d{1,3})(?:\s+|$)/);
  return Boolean(leadingPageNumber && Math.abs(Number(leadingPageNumber[1]) - pageNumber) <= 3);
};

const normalizePart6Passage = (text, questionNumbers = []) => {
  const orderedQuestionNumbers = [...new Set(questionNumbers.map(Number).filter(Number.isInteger))]
    .sort((left, right) => left - right);
  const markers = [];
  const createMarker = (questionNumber = null) => {
    const index = markers.length;
    markers.push(questionNumber);
    return `\uE000${index}\uE001`;
  };

  let normalized = String(text || '').replace(PART6_MULTIWORD_NOISE_REGEX, () => createMarker());
  normalized = normalized
    .replace(/\bif\s+(?:eaune|maemo)\b/gi, ' ')
    .replace(/\big(?=\s+these\s+rules\b)/gi, ' ');
  normalized = normalized.replace(/_{2,}(?:\s*(?:\((\d{1,3})\)|\[(\d{1,3})\]|(\d{1,3})[.)]?))?/gu, () => createMarker());

  const artifactCandidates = [];
  for (const match of normalized.matchAll(/\S+/gu)) {
    const score = getPart6OcrArtifactScore(match[0], orderedQuestionNumbers);
    if (score > 0) artifactCandidates.push({ token: match[0], index: match.index, score });
  }

  // Each Part 6 passage has one blank per question in its group. Use that
  // known count to remove scan noise without treating every short word as a blank.
  const remainingMarkers = Math.max(0, orderedQuestionNumbers.length - markers.length);
  const selectedArtifacts = artifactCandidates
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, remainingMarkers)
    .sort((left, right) => left.index - right.index);
  const selectedByIndex = new Map(selectedArtifacts.map((candidate) => [candidate.index, candidate]));
  let markerReplacements = 0;
  normalized = normalized.replace(/\S+/gu, (token, offset) => {
    if (!selectedByIndex.has(offset)) return token;
    markerReplacements += 1;
    return createMarker();
  });

  normalized = normalized.replace(/\uE000(\d+)\uE001/gu, (_marker, markerIndex) => {
    const markerIndexNumber = Number(markerIndex);
    const questionNumber = markers[markerIndexNumber] || orderedQuestionNumbers[markerIndexNumber];
    return questionNumber ? `________ [${questionNumber}]` : '________ [kiểm tra số câu]';
  });

  return {
    text: normalized.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
    markerCount: markers.length,
    expectedMarkerCount: orderedQuestionNumbers.length,
    inferredMarkerCount: markerReplacements,
  };
};

/**
 * Extract Answer Key map from text: { 1: 'A', 2: 'B', 101: 'C', ... }
 */
const extractAnswerKey = (text) => {
  const answerKeyMap = {};
  if (!text) return { answerKeyMap, conflicts: [], foundHeader: false, candidateCount: 0 };

  // Only parse explicit answer-key sections. Searching the full paper lets
  // numbers in passages/options accidentally become answer-key entries.
  const keyHeader = findAnswerKeyHeader(text);
  if (!keyHeader) return { answerKeyMap, conflicts: [], foundHeader: false, candidateCount: 0 };
  const searchSection = text.slice(keyHeader.end);

  // Supports both one-answer-per-line text and scanned answer-key grids such as "1 (C) 2 (A)".
  const pairRegex = /(?:\bQ(?:uestion)?\s*)?\b(\d{1,3})\s*(?:[.:)\- ]\s*)?(?:\(\s*([A-D©])\s*\)|([A-D])\b)/gi;
  const candidatesByQuestion = new Map();
  let match;
  let candidateCount = 0;

  while ((match = pairRegex.exec(searchSection)) !== null) {
    const qNum = parseInt(match[1], 10);
    const rawAnswer = (match[2] || match[3]).toUpperCase();
    const ansLetter = rawAnswer === '©' ? 'C' : rawAnswer;
    if (qNum < 1 || qNum > 200) continue;
    candidateCount += 1;
    if (!candidatesByQuestion.has(qNum)) candidatesByQuestion.set(qNum, new Set());
    candidatesByQuestion.get(qNum).add(ansLetter);
  }

  const conflicts = [];
  for (const [qNum, answers] of candidatesByQuestion) {
    if (answers.size === 1) answerKeyMap[qNum] = [...answers][0];
    else conflicts.push({ questionNumber: qNum, answers: [...answers] });
  }

  return { answerKeyMap, conflicts, foundHeader: true, candidateCount };
};

/**
 * Main TOEIC PDF Parser Engine
 */
export const parseToeicPdf = async (pdfBuffer, options = {}) => {
  const warnings = [];
  const missing = [];

  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
    throw new Error('Buffer PDF không hợp lệ');
  }

  // 1. Prefer browser OCR text when the PDF contains scanned pages; otherwise use its text layer.
  let pdfData = null;
  let rawText = typeof options.extractedText === 'string' ? options.extractedText : '';
  const hasProvidedText = rawText.trim().length > 0;

  if (!hasProvidedText) {
    try {
      const { pdfParseModule, PDFParseClass } = getPdfParser();
      if (typeof PDFParseClass === 'function') {
        const parser = new PDFParseClass(new Uint8Array(pdfBuffer));
        pdfData = await parser.getText();
      } else if (typeof pdfParseModule === 'function') {
        pdfData = await pdfParseModule(pdfBuffer);
      } else {
        throw new Error('PDFParse module function not available in this environment');
      }
      rawText = pdfData.text || '';
    } catch (err) {
      throw new Error(`Không thể phân tích file PDF. Vui lòng kiểm tra file PDF: ${err.message}`);
    }
  }

  const meaningfulCharacters = getMeaningfulTextCharacterCount(rawText);
  const pageCount = Math.max(getPdfPageCount(rawText), Number(pdfData?.total) || 0);
  const extractionMethod = options.extractionMethod || (hasProvidedText ? 'browser_ocr' : 'pdf_text');
  const toeicMode = options.toeicMode || 'full_test';

  // Ignore pdf-parse's page labels (for example, "-- 1 of 46 --") when detecting scanned PDFs.
  if (meaningfulCharacters < 20) {
    const scannedPdf = pageCount > 0 && (!hasProvidedText || Number(options.ocrPageCount) > 0);
    return {
      parsedGroups: [],
      parsedQuestions: [],
      extractedImages: [],
      answerKeyMap: {},
      report: {
        status: 'needs_ocr',
        extraction: {
          method: extractionMethod,
          status: scannedPdf ? (hasProvidedText ? 'ocr_no_text' : 'scanned_pdf') : 'empty_text',
          pages: pageCount,
          scannedPages: Number(options.ocrPageCount) || 0,
          meaningfulCharacters,
        },
        detected: { parts: [], partsCount: 0, questionGroups: 0, questions: 0, images: 0, answerKeys: 0 },
        warnings: [
          scannedPdf
            ? hasProvidedText
              ? `Đã OCR ${Number(options.ocrPageCount) || 0} trang nhưng không nhận diện đủ nội dung để phân tích. Hãy dùng PDF rõ nét hơn hoặc chia nhỏ file.`
              : `PDF có ${pageCount} trang nhưng không có lớp văn bản để trích xuất. Hãy dùng OCR cho tài liệu scan rồi phân tích lại.`
            : 'PDF không chứa đủ văn bản để phân tích câu hỏi TOEIC.',
        ],
        missing: [],
        needsReview: true,
      },
    };
  }

  // 3. Extract Answer Key
  const answerKeyExtraction = extractAnswerKey(rawText);
  const { answerKeyMap } = answerKeyExtraction;
  if (!answerKeyExtraction.foundHeader) {
    warnings.push('Không tìm thấy tiêu đề Answer Key trong tài liệu; hệ thống không tự suy đoán đáp án từ nội dung câu hỏi.');
  }
  if (answerKeyExtraction.conflicts.length > 0) {
    const conflictNumbers = answerKeyExtraction.conflicts.map((item) => item.questionNumber);
    warnings.push(`Answer Key có đáp án OCR mâu thuẫn ở câu ${conflictNumbers.join(', ')}. Các câu này được để trống đáp án để giáo viên xác minh.`);
  }

  const pageImageUrlsByNumber = options.pageImageUrlsByNumber || {};
  const parsePageNumbers = (value) => {
    const values = Array.isArray(value) ? value : String(value || '').split(',');
    return [...new Set(values.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0))];
  };
  const availableImagePageNumbers = new Set([
    ...parsePageNumbers(options.imagePageNumbers),
    ...Object.keys(pageImageUrlsByNumber).map(Number).filter((item) => Number.isInteger(item) && item > 0),
  ]);
  const passageImagePageNumbers = new Set(parsePageNumbers(options.passageImagePageNumbers));

  // 4. Split OCR lines and recover question labels Tesseract merges across a two-column row.
  const rawLines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const hasExplicitPartHeaders = rawLines.some((line) => /^PART\s*[1-7]\b/i.test(line));
  const lines = [];
  let linePart = 1;
  for (const line of rawLines) {
    const partHeader = line.match(/^PART\s*([1-7])\b/i);
    if (partHeader) {
      linePart = Number(partHeader[1]);
      lines.push(line);
      continue;
    }

    const questionRange = toeicMode === 'full_test' && hasExplicitPartHeaders
      ? TOEIC_FULL_TEST_QUESTION_RANGES[linePart]
      : null;
    const labels = [...line.matchAll(/(?:^|\s)(?:Question\s+)?(\d{1,3})[.:)](?=\s|$)/gi)]
      .filter((match) => {
        if (!questionRange) return true;
        const questionNumber = Number(match[1]);
        return questionNumber >= questionRange[0] && questionNumber <= questionRange[1];
      });

    if (questionRange && labels.length > 1 && labels[0].index === 0) {
      for (let index = 0; index < labels.length; index += 1) {
        const start = labels[index].index;
        const end = labels[index + 1]?.index ?? line.length;
        const segment = line.slice(start, end).trim();
        if (segment) lines.push(segment);
      }
    } else {
      lines.push(line);
    }
  }

  const parsedGroups = [];
  const parsedQuestions = [];

  let currentPart = 1;
  let currentPassageText = '';
  let currentGroupHeader = '';
  let currentGroupType = 'single';
  let currentGroupQuestionNums = [];
  let currentGroupSourcePageNumbers = new Set();
  let currentGroupPassagePageNumbers = new Set();
  let currentPageNumber = 1;
  let part7QuestionStartedOnPage = false;

  let pendingQuestion = null;
  let currentOptions = [];
  let questionCounter = 0;
  let orphanQuestionText = '';
  const suspiciousOptionQuestionNumbers = new Set();

  const appendOptionSegments = (segments = []) => {
    segments.forEach((option) => {
      const rawOptionText = String(option.text || '').trim();
      if (!rawOptionText || !pendingQuestion || currentOptions.length >= 4) return;
      if (isSuspiciousOcrOptionText(rawOptionText)) {
        pendingQuestion.ocrNeedsReview = true;
        suspiciousOptionQuestionNumbers.add(pendingQuestion.questionNumber);
      }

      const cleanedPart7Option = currentPart === 7 ? cleanPart7OptionText(rawOptionText) : null;
      let optionText = cleanedPart7Option ? cleanedPart7Option.text : trimPdfInstructionTail(rawOptionText);
      const expectedIndex = currentOptions.length;
      let normalizedLetter = option.letter === '©' || option.letter === '®'
        ? 'C'
        : ['0', 'O'].includes(option.letter) && expectedIndex >= 2 && expectedIndex <= 3
          ? String.fromCharCode(65 + expectedIndex)
          : option.letter;

      if (currentPart === 7 && optionText.length > 280) {
        pendingQuestion.ocrNeedsReview = true;
        suspiciousOptionQuestionNumbers.add(pendingQuestion.questionNumber);
        return;
      }

      if (cleanedPart7Option?.truncated) {
        pendingQuestion.ocrNeedsReview = true;
        suspiciousOptionQuestionNumbers.add(pendingQuestion.questionNumber);
      }

      if (currentPart === 7 && normalizedLetter === 'D') {
        const embeddedQuestion = findEmbeddedPart7Question(optionText);
        if (embeddedQuestion) {
          optionText = embeddedQuestion.optionText;
          orphanQuestionText = embeddedQuestion.questionText;
          pendingQuestion.nextQuestionText = embeddedQuestion.questionText;
        }
      }

      if (!/^[A-D]$/.test(normalizedLetter) || !optionText) return;
      const usedLetters = new Set(currentOptions.map((currentOption) => currentOption.id));
      if (usedLetters.has(normalizedLetter)) {
        normalizedLetter = String.fromCharCode(65 + expectedIndex);
      }
      currentOptions.push({
        id: `opt_${normalizedLetter.charCodeAt(0) - 64}`,
        text: `(${normalizedLetter}) ${optionText}`,
      });
    });
  };

  // Helper to commit pending question
  const commitPendingQuestion = () => {
    if (!pendingQuestion) return;

    if (currentPart === 7 && isPart7QuestionPlaceholder(pendingQuestion) && currentOptions.length === 0) {
      warnings.push(`Câu hỏi ${pendingQuestion.questionNumber}: OCR chỉ nhận diện nhãn số, không có nội dung hoặc lựa chọn; câu này cần nhập lại.`);
      pendingQuestion = null;
      currentOptions = [];
      return;
    }

    const formattedOptions = currentOptions.slice(0, 4);
    const expectedOptionCount = currentPart <= 2 ? 0 : 4;
    if (expectedOptionCount > 0 && formattedOptions.length < expectedOptionCount) {
      warnings.push(`Câu hỏi ${pendingQuestion.questionNumber}: Chỉ nhận diện được ${formattedOptions.length}/${expectedOptionCount} lựa chọn. Giáo viên cần bổ sung hoặc kiểm tra.`);
    }

    // Map Answer Key
    const qNum = pendingQuestion.questionNumber;
    let correctOptionId = '';

    if (answerKeyMap[qNum]) {
      const letter = answerKeyMap[qNum];
      const optionIds = { A: 'opt_1', B: 'opt_2', C: 'opt_3', D: 'opt_4' };
      const candidateId = optionIds[letter];
      if (formattedOptions.some((option) => option.id === candidateId)) {
        correctOptionId = candidateId;
      } else {
        warnings.push(`Câu hỏi ${qNum}: Có đáp án ${letter} trong Answer Key nhưng lựa chọn tương ứng chưa được nhận diện.`);
      }
    } else {
      warnings.push(`Câu hỏi ${qNum}: Chưa tìm thấy đáp án trong Answer Key. Giáo viên cần chọn đáp án đúng trước khi xuất bản.`);
    }

    pendingQuestion.options = formattedOptions;
    pendingQuestion.correctAnswers = correctOptionId ? [correctOptionId] : [];
    pendingQuestion.toeicPart = currentPart;
    if (pendingQuestion.ocrNeedsReview) {
      warnings.push(`Câu hỏi ${qNum}: OCR có dấu hiệu ghép thêm nội dung ngoài lựa chọn; cần đối chiếu với PDF gốc.`);
    }

    parsedQuestions.push(pendingQuestion);
    pendingQuestion = null;
    currentOptions = [];
  };

  // Helper to commit current question group
  const commitCurrentGroup = () => {
    commitPendingQuestion();

    if (parsedQuestions.length === 0 && !currentPassageText && !currentGroupHeader) return;

    // Find questions belonging to this group
    const groupQuestions = parsedQuestions
      .filter((q) => !q.questionGroupRef)
      .sort((left, right) => left.questionNumber - right.questionNumber);

    // Part direction pages are not passages. Avoid creating empty groups that
    // later appear as blank cards in the draft builder.
    const instructionOnly = groupQuestions.length === 0
      && !currentGroupHeader
      && /^\s*Directions\s*:/i.test(currentPassageText);
    if (instructionOnly) {
      currentPassageText = '';
      currentGroupHeader = '';
      currentGroupQuestionNums = [];
      currentGroupSourcePageNumbers = new Set();
      currentGroupPassagePageNumbers = new Set();
      currentGroupType = 'single';
      orphanQuestionText = '';
      return;
    }

    if (groupQuestions.length > 0 || currentPassageText) {
      const partNum = groupQuestions.length > 0 ? groupQuestions[0].toeicPart : currentPart;
      const sourcePageNumbers = [...new Set([
        ...currentGroupSourcePageNumbers,
        ...groupQuestions.flatMap((question) => question.sourcePageNumbers || []),
      ])].sort((left, right) => left - right);
      const imagePageNumbers = partNum === 1
        ? sourcePageNumbers.filter((pageNumber) => availableImagePageNumbers.has(pageNumber))
        : [];
      const imageUrls = [...new Set(imagePageNumbers.map((pageNumber) => pageImageUrlsByNumber[pageNumber]).filter(Boolean))];
      const passageImagePageNumbers = partNum === 7
        ? [...currentGroupPassagePageNumbers]
          .filter((pageNumber) => availableImagePageNumbers.has(pageNumber))
          .sort((left, right) => left - right)
        : [];
      const passageImageUrls = [...new Set(passageImagePageNumbers
        .map((pageNumber) => pageImageUrlsByNumber[pageNumber])
        .filter(Boolean))];

      let gType = currentGroupType;
      if (currentPassageText || (partNum === 7 && currentGroupHeader)) {
        gType = partNum >= 6 ? 'passage' : 'single';
      } else if (imagePageNumbers.length > 0 && partNum <= 4) {
        gType = 'audio_image';
      } else if (partNum <= 4) {
        gType = 'audio';
      }

      const passageQuestionNumbers = currentGroupQuestionNums.length > 0
        ? currentGroupQuestionNums
        : groupQuestions.map((question) => question.questionNumber);
      const normalizedPassage = partNum === 6
        ? normalizePart6Passage(currentPassageText, passageQuestionNumbers)
        : { text: currentPassageText, markerCount: 0, expectedMarkerCount: 0 };
      if (partNum === 6 && normalizedPassage.markerCount !== normalizedPassage.expectedMarkerCount) {
        warnings.push(
          `Part 6 ${currentGroupHeader || 'passage'}: nhận diện ${normalizedPassage.markerCount}/${normalizedPassage.expectedMarkerCount} dấu chỗ trống; cần rà lại passage và vị trí từng câu.`,
        );
      }

      const hasPart7Passage = partNum === 7 && Boolean(currentGroupHeader || currentPassageText || passageImagePageNumbers.length);
      const passages = currentPassageText || hasPart7Passage
        ? [{
          title: currentGroupHeader || 'Passage',
          // Part 7 source passages are retained as PDF page images. Do not
          // persist noisy OCR prose or let it leak into a question option.
          content: partNum === 7 ? '' : (partNum === 6 ? normalizedPassage.text : currentPassageText),
          imageUrl: passageImageUrls[0] || '',
          imageUrls: passageImageUrls,
          imagePageNumbers: passageImagePageNumbers,
          order: 1,
        }]
        : [];

      const groupObj = {
        partNumber: partNum,
        type: gType,
        title: currentGroupHeader || `Group Part ${partNum}`,
        instructions: groupQuestions.length > 0
          ? `Questions ${groupQuestions.map((q) => q.questionNumber).join(', ')}`
          : '',
        imageUrl: imageUrls[0] || '',
        imageUrls,
        imagePageNumbers,
        sourcePageNumbers,
        audioUrl: '',
        passages: passages,
        questions: groupQuestions,
        order: parsedGroups.length + 1,
      };

      parsedGroups.push(groupObj);

      // Mark questions with group reference
      groupQuestions.forEach((q) => {
        q.questionGroupRef = groupObj;
      });
    }

    currentPassageText = '';
    currentGroupHeader = '';
    currentGroupQuestionNums = [];
    currentGroupSourcePageNumbers = new Set();
    currentGroupPassagePageNumbers = new Set();
    currentGroupType = 'single';
    orphanQuestionText = '';
  };

  // Regex patterns
  const partHeaderRegex = /^PART\s*([1-7])\b/i;
  const groupHeaderRegex = /^Questions?\s*(\d{1,3})\s*[-–to]+\s*(\d{1,3})\s*(?:refer\s*to|below|following)?/i;
  const questionNumRegex = /^(?:Question\s+(\d{1,3})[\.\:\)]?|(\d{1,3})[\.\:\)])\s*(.*)/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const pageMarkerMatch = line.match(/^--\s*(\d+)\s+of\s+\d+\s*--$/i);
    if (pageMarkerMatch) {
      currentPageNumber = Number(pageMarkerMatch[1]);
      part7QuestionStartedOnPage = false;
      continue;
    }

    // Check Part Header
    const partMatch = line.match(partHeaderRegex);
    if (partMatch) {
      commitCurrentGroup();
      currentPart = parseInt(partMatch[1], 10);
      continue;
    }

    // Stop parsing if we hit Answer Key section at bottom
    if (findAnswerKeyHeader(line)) {
      commitCurrentGroup();
      break;
    }

    // Check Group Header ("Questions 32-34 refer to...")
    const groupMatch = line.match(groupHeaderRegex);
    if (groupMatch) {
      commitCurrentGroup();
      currentGroupHeader = line;
      currentGroupSourcePageNumbers.add(currentPageNumber);
      if (currentPart === 7) currentGroupPassagePageNumbers.add(currentPageNumber);
      const startNum = parseInt(groupMatch[1], 10);
      const endNum = parseInt(groupMatch[2], 10);
      currentGroupQuestionNums = Array.from({ length: endNum - startNum + 1 }, (_, idx) => startNum + idx);
      continue;
    }

    // Check Question Number
    const qMatch = line.match(questionNumRegex);
    if (qMatch) {
      const rawQuestionNumber = parseInt(qMatch[1] || qMatch[2], 10);
      const deferredQuestionText = orphanQuestionText || pendingQuestion?.nextQuestionText || '';
      const isRepeatedPlaceholder = currentPart === 7
        && isPart7QuestionPlaceholder(pendingQuestion)
        && currentOptions.length === 0
        && (
          pendingQuestion.questionNumber === rawQuestionNumber
          || (String(rawQuestionNumber).length >= 2 && String(pendingQuestion.questionNumber).endsWith(String(rawQuestionNumber)))
        );
      if (isRepeatedPlaceholder) {
        pendingQuestion = null;
        currentOptions = [];
      } else {
        commitPendingQuestion();
      }
      questionCounter++;

      let qNum = rawQuestionNumber;
      if (currentGroupQuestionNums.length > 0 && !currentGroupQuestionNums.includes(rawQuestionNumber)) {
        const rawDigits = String(rawQuestionNumber);
        // A one digit marker in a Part 7 passage is often a table/rating number
        // (for example "1. I agree"), not a question whose hundreds digits OCR lost.
        const suffixCandidates = rawDigits.length >= 2
          ? currentGroupQuestionNums.filter((questionNumber) => String(questionNumber).endsWith(rawDigits))
          : [];
        const importedInGroup = new Set(parsedQuestions
          .map((question) => question.questionNumber)
          .filter((questionNumber) => currentGroupQuestionNums.includes(questionNumber)));
        if (suffixCandidates.length === 1) qNum = suffixCandidates[0];
        else if (suffixCandidates.length === 0) {
          const remainingQuestions = currentGroupQuestionNums.filter((questionNumber) => !importedInGroup.has(questionNumber));
          if (rawDigits.length >= 2 && remainingQuestions.length === 1) qNum = remainingQuestions[0];
        }
        if (qNum !== rawQuestionNumber) {
          warnings.push(`Đã khôi phục số câu ${qNum} từ nhãn OCR bị thiếu chữ số đầu (${rawQuestionNumber}).`);
        }
      }
      const questionRange = toeicMode === 'full_test' && hasExplicitPartHeaders
        ? TOEIC_FULL_TEST_QUESTION_RANGES[currentPart]
        : null;
      if (questionRange && (qNum < questionRange[0] || qNum > questionRange[1])) {
        if ((currentPart === 6 || currentPart === 7) && !pendingQuestion
          && (currentPart !== 7 || !part7QuestionStartedOnPage)) {
          currentGroupSourcePageNumbers.add(currentPageNumber);
          if (currentPart === 7) currentGroupPassagePageNumbers.add(currentPageNumber);
          currentPassageText += (currentPassageText ? '\n' : '') + line;
        }
        continue;
      }

      if (currentPart === 7) {
        if (currentGroupHeader && passageImagePageNumbers.has(currentPageNumber)) {
          currentGroupSourcePageNumbers.add(currentPageNumber);
          currentGroupPassagePageNumbers.add(currentPageNumber);
        }
        part7QuestionStartedOnPage = true;
      }

      const rawQuestionText = qMatch[3] ? qMatch[3].trim() : '';
      const hasScannedQuestionText = rawQuestionText && !new RegExp(`^Question\\s+${qNum}$`, 'i').test(rawQuestionText);
      const inlineOptionMatch = rawQuestionText.match(/^\(?([A-D])[.)]\s*(.*)$/i);
      const answerSheetPlaceholder = /^mark\s+your\s+answers?\s+on\s+your\s+answer\s+sheet\.?$/i.test(rawQuestionText);
      let qText = hasScannedQuestionText ? rawQuestionText : (deferredQuestionText || rawQuestionText || `Question ${qNum}`);
      if (!hasScannedQuestionText && deferredQuestionText) {
        warnings.push(`Câu hỏi ${qNum}: đã ghép lại phần thân câu bị OCR tách khỏi nhãn số câu.`);
      }
      orphanQuestionText = '';
      if (currentPart === 1) qText = 'Look at the photograph and choose the correct statement.';
      else if (currentPart === 2 && answerSheetPlaceholder) qText = 'Listen to the question and choose the best response.';
      else if (inlineOptionMatch) qText = `Question ${qNum}`;
      if (currentPart === 6 && qText === `Question ${qNum}`) {
        qText = `Choose the best word or phrase for blank ${qNum} in the passage.`;
      }

      pendingQuestion = {
        questionNumber: qNum,
        questionText: qText,
        type: 'single_choice',
        score: 1,
        explanation: '',
        order: qNum,
        sourcePageNumbers: [currentPageNumber],
      };
      if (inlineOptionMatch) {
        appendOptionSegments(parseOptionLine(rawQuestionText) || [{
          letter: inlineOptionMatch[1].toUpperCase(),
          text: inlineOptionMatch[2].trim(),
        }]);
      }
      continue;
    }

    // OCR sometimes places several alternatives on a single line or mistakes
    // the C/D glyph. Split those markers before assigning option ids.
    const parsedOptionSegments = pendingQuestion ? parseOptionLine(line, currentOptions.length) : null;
    if (parsedOptionSegments) {
      appendOptionSegments(parsedOptionSegments);
      continue;
    }

    if (pendingQuestion && (currentOptions.length >= 4 || (currentPart === 7 && currentOptions.length >= 3)) && !parsedOptionSegments
      && /^(?:(?:what|who|where|when|why|how|which|whose|whom)\b|according to\b|at\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b|look at (?:the )?(?:graphic|chart|table)\b)/i.test(line)
      && /\?\s*[“”"']?\s*$/.test(line)) {
      // OCR can read a two-column page by visual column instead of question
      // order. Keep an unnumbered question stem for the next numeric label.
      orphanQuestionText = line;
      continue;
    }

    if (pendingQuestion && currentOptions.length > 0 && !parsedOptionSegments) {
      const optionContinuation = trimPdfInstructionTail(line);
      if (!optionContinuation || /^(?:PART\s*[1-7]\b)/i.test(optionContinuation)) continue;
      if (isLikelyPageFooterNoise(line, currentPageNumber)) continue;
      const lastOption = currentOptions[currentOptions.length - 1];
      const lastOptionText = lastOption.text.replace(/^\([A-D]\)\s*/i, '');
      const continuationLooksLikeSameSentence = !/[.!?][”"')\]]?\s*$/.test(lastOptionText)
        && /^[a-z0-9]/.test(optionContinuation)
        && !isSuspiciousOcrOptionText(line)
        && lastOptionText.length + optionContinuation.length + 1 <= 240;

      // Once three/four choices have been read in Part 7, later prose is far
      // more likely to be the next passage or page footer than choice D.
      // Never append later prose after Part 7 choices; flag uncertain rows for review.
      if (currentPart === 7 && currentOptions.length >= 3) {
        if (continuationLooksLikeSameSentence || isSuspiciousOcrOptionText(line)) {
          pendingQuestion.ocrNeedsReview = true;
          suspiciousOptionQuestionNumbers.add(pendingQuestion.questionNumber);
        }
        continue;
      }

      if (currentOptions.length >= 4) {
        if (continuationLooksLikeSameSentence) {
          lastOption.text = `${lastOption.text} ${optionContinuation}`.trim();
        } else if (isSuspiciousOcrOptionText(line)) {
          pendingQuestion.ocrNeedsReview = true;
          suspiciousOptionQuestionNumbers.add(pendingQuestion.questionNumber);
        }
        continue;
      }

      if (lastOptionText.length + optionContinuation.length + 1 <= 240) {
        lastOption.text = `${lastOption.text} ${optionContinuation}`.trim();
      } else {
        pendingQuestion.ocrNeedsReview = true;
        suspiciousOptionQuestionNumbers.add(pendingQuestion.questionNumber);
      }
      continue;
    }

    // If we are in Part 6 or 7 and line is not a question/option, accumulate passage text
    if ((currentPart === 6 || currentPart === 7) && !pendingQuestion
      && (currentPart !== 7 || !part7QuestionStartedOnPage)) {
      currentGroupSourcePageNumbers.add(currentPageNumber);
      if (currentPart === 7) currentGroupPassagePageNumbers.add(currentPageNumber);
      currentPassageText += (currentPassageText ? '\n' : '') + line;
    } else if (pendingQuestion && !parsedOptionSegments && currentOptions.length === 0 && ![1, 2, 6].includes(currentPart)) {
      if (currentPart === 7 && isPart7QuestionPlaceholder(pendingQuestion)) {
        if (isLikelyPart7QuestionStem(line)) {
          pendingQuestion.questionText = line;
        } else if (!part7QuestionStartedOnPage) {
          currentGroupSourcePageNumbers.add(currentPageNumber);
          currentGroupPassagePageNumbers.add(currentPageNumber);
          currentPassageText += (currentPassageText ? '\n' : '') + line;
        }
      } else if (currentPart === 7 && !part7QuestionStartedOnPage
        && (/[?!.][”"')\]]?\s*$/.test(pendingQuestion.questionText) || line.length > 160)) {
        currentGroupSourcePageNumbers.add(currentPageNumber);
        currentGroupPassagePageNumbers.add(currentPageNumber);
        currentPassageText += (currentPassageText ? '\n' : '') + line;
      } else {
        // Append a short, unfinished question fragment when OCR wrapped its stem.
        if (!pendingQuestion.sourcePageNumbers.includes(currentPageNumber)) pendingQuestion.sourcePageNumbers.push(currentPageNumber);
        pendingQuestion.questionText += ' ' + line;
      }
    }
  }

  // Final commit
  commitCurrentGroup();

  // If no parts were explicitly labeled, create single groups for questions
  if (parsedGroups.length === 0 && parsedQuestions.length > 0) {
    for (const q of parsedQuestions) {
      parsedGroups.push({
        partNumber: q.toeicPart || 1,
        type: 'single',
        title: `Question ${q.questionNumber}`,
        instructions: '',
        imageUrl: '',
        imageUrls: [],
        imagePageNumbers: [],
        sourcePageNumbers: q.sourcePageNumbers || [],
        audioUrl: '',
        passages: [],
        questions: [q],
        order: q.questionNumber,
      });
    }
  }

  parsedQuestions.sort((left, right) =>
    (left.toeicPart || 0) - (right.toeicPart || 0)
    || left.questionNumber - right.questionNumber,
  );

  // Listening section notification
  const listeningCount = parsedQuestions.filter((q) => q.toeicPart <= 4).length;
  if (listeningCount > 0) {
    missing.push(`Phần thi Nghe (Part 1-4 có ${listeningCount} câu hỏi) chưa có file âm thanh Audio. Giáo viên cần upload file MP3 bài nghe cho từng nhóm câu hỏi.`);
  }

  const detectedPartsList = Array.from(new Set(parsedQuestions.map((q) => q.toeicPart))).sort((a, b) => a - b);
  const partQuestionCounts = Object.fromEntries(
    Array.from({ length: 7 }, (_, index) => {
      const partNumber = index + 1;
      return [partNumber, parsedQuestions.filter((question) => question.toeicPart === partNumber).length];
    }),
  );
  const expectedQuestionCount = toeicMode === 'full_test'
    ? Object.values(TOEIC_FULL_TEST_QUESTION_COUNTS).reduce((sum, count) => sum + count, 0)
    : null;
  const expectedFullTestQuestionNumbers = toeicMode === 'full_test'
    ? Object.values(TOEIC_FULL_TEST_QUESTION_RANGES).flatMap(([start, end]) =>
      Array.from({ length: end - start + 1 }, (_, index) => start + index),
    )
    : [];
  const importedQuestionNumbers = new Set(parsedQuestions.map((question) => question.questionNumber));
  const questionNumberOccurrences = new Map();
  for (const question of parsedQuestions) {
    questionNumberOccurrences.set(
      question.questionNumber,
      (questionNumberOccurrences.get(question.questionNumber) || 0) + 1,
    );
  }
  const duplicateQuestionNumbers = [...questionNumberOccurrences.entries()]
    .filter(([, count]) => count > 1)
    .map(([questionNumber]) => questionNumber)
    .sort((left, right) => left - right);
  if (duplicateQuestionNumbers.length > 0) {
    warnings.unshift(`OCR nhận diện trùng số câu ${duplicateQuestionNumbers.join(', ')}. Kiểm tra thứ tự câu trước khi xuất bản.`);
  }
  const groupQuestionCountMismatches = parsedGroups.flatMap((group) => {
    const rangeMatch = (group.title || '').match(/Questions?\s*(\d{1,3})\s*[-–]\s*(\d{1,3})/i);
    if (!rangeMatch) return [];
    const expected = Number(rangeMatch[2]) - Number(rangeMatch[1]) + 1;
    const actual = (group.questions || []).length;
    return expected === actual ? [] : [{ title: group.title, expected, actual }];
  });
  if (groupQuestionCountMismatches.length > 0) {
    warnings.unshift(`OCR nhận diện số câu không khớp với ${groupQuestionCountMismatches.length} nhóm passage: ${groupQuestionCountMismatches.map((group) => `${group.title} (${group.actual}/${group.expected})`).join('; ')}. Rà lại thứ tự câu và passage trước khi xuất bản.`);
  }
  const missingQuestionNumbers = expectedFullTestQuestionNumbers.filter((questionNumber) =>
    !importedQuestionNumbers.has(questionNumber),
  );
  const missingQuestionCount = missingQuestionNumbers.length;
  if (missingQuestionCount > 0) {
    warnings.unshift(`Đề TOEIC full test cần ${expectedQuestionCount} câu; OCR còn thiếu câu ${missingQuestionNumbers.join(', ')}. Kiểm tra các câu này trước khi lưu.`);
  }
  const detectedImagePageNumbers = new Set(parsedGroups.flatMap((group) => [
    ...(group.imagePageNumbers || []),
    ...(group.passages || []).flatMap((passage) => passage.imagePageNumbers || []),
  ]));
  const unassignedImagePageNumbers = [...availableImagePageNumbers].filter((pageNumber) => !detectedImagePageNumbers.has(pageNumber));
  if (unassignedImagePageNumbers.length > 0) {
    warnings.push(`Chưa gắn được ảnh ở trang PDF ${unassignedImagePageNumbers.join(', ')} vào nhóm câu hỏi; cần kiểm tra thủ công.`);
  }
  const part7GroupsWithoutPassageImages = parsedGroups.filter((group) =>
    group.partNumber === 7
    && (group.passages || []).length > 0
    && group.passages.every((passage) => !passage.imageUrl && !(passage.imageUrls || []).length && !(passage.imagePageNumbers || []).length),
  ).length;
  if (part7GroupsWithoutPassageImages > 0) {
    warnings.push(`Part 7 có ${part7GroupsWithoutPassageImages} passage chưa có ảnh từ trang PDF tương ứng.`);
  }

  const incompleteOptionQuestionNumbers = parsedQuestions
    .filter((question) => question.toeicPart >= 3 && question.options.length !== 4)
    .map((question) => question.questionNumber)
    .filter((questionNumber, index, numbers) => numbers.indexOf(questionNumber) === index)
    .sort((left, right) => left - right);
  if (incompleteOptionQuestionNumbers.length > 0) {
    warnings.push(`Có ${incompleteOptionQuestionNumbers.length} câu OCR chưa nhận đủ 4 lựa chọn: ${incompleteOptionQuestionNumbers.join(', ')}.`);
  }

  const sortedSuspiciousOptionQuestionNumbers = [...suspiciousOptionQuestionNumbers]
    .sort((left, right) => left - right);
  if (sortedSuspiciousOptionQuestionNumbers.length > 0) {
    warnings.push(`Có dấu hiệu nội dung ngoài lựa chọn bị ghép vào các câu ${sortedSuspiciousOptionQuestionNumbers.join(', ')}. Hãy đối chiếu các câu này với PDF gốc trước khi lưu.`);
  }

  const saveBlockers = [];
  if (toeicMode === 'full_test') {
    if (missingQuestionCount > 0) saveBlockers.push(`Còn thiếu ${missingQuestionCount} câu: ${missingQuestionNumbers.join(', ')}.`);
    if (duplicateQuestionNumbers.length > 0) saveBlockers.push(`Số câu bị trùng: ${duplicateQuestionNumbers.join(', ')}.`);
    if (incompleteOptionQuestionNumbers.length > 0) saveBlockers.push(`Câu chưa đủ 4 lựa chọn: ${incompleteOptionQuestionNumbers.join(', ')}.`);
    if (sortedSuspiciousOptionQuestionNumbers.length > 0) {
      saveBlockers.push(`Câu có OCR dính nội dung khác: ${sortedSuspiciousOptionQuestionNumbers.join(', ')}.`);
    }
    if (groupQuestionCountMismatches.length > 0) saveBlockers.push('Số câu trong một hoặc nhiều nhóm passage không khớp với nhãn nhóm.');
    if (part7GroupsWithoutPassageImages > 0) saveBlockers.push(`Còn ${part7GroupsWithoutPassageImages} nhóm Part 7 chưa có ảnh passage.`);
  }

  return {
    parsedGroups,
    parsedQuestions,
    extractedImages: [],
    answerKeyMap,
    report: {
      status: 'draft',
      extraction: {
        method: extractionMethod,
        status: 'text_extracted',
        pages: pageCount,
        scannedPages: Number(options.ocrPageCount) || 0,
        meaningfulCharacters,
      },
      detected: {
        parts: detectedPartsList.length > 0 ? detectedPartsList : [1],
        partsCount: detectedPartsList.length || 1,
        questionGroups: parsedGroups.length,
        questions: parsedQuestions.length,
        partQuestionCounts,
        expectedQuestions: expectedQuestionCount,
        missingQuestions: missingQuestionCount,
        missingQuestionNumbers,
        duplicateQuestionNumbers,
        groupQuestionCountMismatches,
        incompleteOptionQuestions: incompleteOptionQuestionNumbers.length,
        incompleteOptionQuestionNumbers,
        suspiciousOptionQuestionNumbers: sortedSuspiciousOptionQuestionNumbers,
        part7GroupsWithoutPassageImages,
        images: detectedImagePageNumbers.size,
        imagePages: [...detectedImagePageNumbers].sort((left, right) => left - right),
        answerKeys: Object.keys(answerKeyMap).length,
        answerKeyCandidates: answerKeyExtraction.candidateCount,
        answerKeyConflicts: answerKeyExtraction.conflicts,
      },
      warnings,
      missing,
      saveValidation: {
        allowed: saveBlockers.length === 0,
        blockers: saveBlockers,
      },
      needsReview: true,
    },
  };
};
