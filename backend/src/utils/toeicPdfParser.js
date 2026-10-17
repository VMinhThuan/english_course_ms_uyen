import { createRequire } from 'module';

let pdfParseModule = null;
let PDFParseClass = null;
// Only Part 1 uses full-page captures as reliable visual stimuli. Pages in
// Parts 3, 4, and 7 also contain printed questions/options, so attaching them
// duplicates the text shown by the exam UI.
const VISUAL_TOEIC_PARTS = new Set([1]);

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

const ANSWER_KEY_HEADER_REGEX = /^(?:ANSWER\s*KEYS?|ANSWERS|KEY|ĐÁP\s*ÁN)(?:\s*[:\-]?\s*\d{1,4}\+?)?\s*$/i;

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
  if (!text) return answerKeyMap;

  // Search for Answer Key block
  const keyHeaderRegex = /^\s*(?:ANSWER\s*KEYS?|ANSWERS|KEY|ĐÁP\s*ÁN)(?:\s*[:\-]?\s*\d{1,4}\+?)?\s*$/im;
  const keyHeaderMatch = keyHeaderRegex.exec(text);
  const searchSection = keyHeaderMatch ? text.slice(keyHeaderMatch.index) : text;

  // Supports both one-answer-per-line text and scanned answer-key grids such as "1 (C) 2 (A)".
  const pairRegex = /(?:Q(?:uestion)?\s*)?(\d{1,3})\s*(?:[.\:\-]\s*)?(?:\(\s*([A-D])\s*\)|([A-D])\b)/gi;
  let match;

  while ((match = pairRegex.exec(searchSection)) !== null) {
    const qNum = parseInt(match[1], 10);
    const ansLetter = (match[2] || match[3]).toUpperCase();
    if (qNum >= 1 && qNum <= 200 && !answerKeyMap[qNum]) {
      answerKeyMap[qNum] = ansLetter;
    }
  }

  return answerKeyMap;
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
  const answerKeyMap = extractAnswerKey(rawText);

  const pageImageUrlsByNumber = options.pageImageUrlsByNumber || {};
  const parsePageNumbers = (value) => {
    const values = Array.isArray(value) ? value : String(value || '').split(',');
    return [...new Set(values.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0))];
  };
  const availableImagePageNumbers = new Set([
    ...parsePageNumbers(options.imagePageNumbers),
    ...Object.keys(pageImageUrlsByNumber).map(Number).filter((item) => Number.isInteger(item) && item > 0),
  ]);

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
  let currentPageNumber = 1;

  let pendingQuestion = null;
  let currentOptions = [];
  let questionCounter = 0;

  // Helper to commit pending question
  const commitPendingQuestion = () => {
    if (!pendingQuestion) return;

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

    parsedQuestions.push(pendingQuestion);
    pendingQuestion = null;
    currentOptions = [];
  };

  // Helper to commit current question group
  const commitCurrentGroup = () => {
    commitPendingQuestion();

    if (parsedQuestions.length === 0 && !currentPassageText) return;

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
      currentGroupType = 'single';
      return;
    }

    if (groupQuestions.length > 0 || currentPassageText) {
      const partNum = groupQuestions.length > 0 ? groupQuestions[0].toeicPart : currentPart;
      const sourcePageNumbers = [...new Set([
        ...currentGroupSourcePageNumbers,
        ...groupQuestions.flatMap((question) => question.sourcePageNumbers || []),
      ])].sort((left, right) => left - right);
      const imagePageNumbers = VISUAL_TOEIC_PARTS.has(partNum)
        ? sourcePageNumbers.filter((pageNumber) => availableImagePageNumbers.has(pageNumber))
        : [];
      const imageUrls = [...new Set(imagePageNumbers.map((pageNumber) => pageImageUrlsByNumber[pageNumber]).filter(Boolean))];

      let gType = currentGroupType;
      if (currentPassageText) {
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

      const passages = currentPassageText
        ? [{
          title: currentGroupHeader || 'Passage',
          content: partNum === 6 ? normalizedPassage.text : currentPassageText,
          imageUrl: '',
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
    currentGroupType = 'single';
  };

  // Regex patterns
  const partHeaderRegex = /^PART\s*([1-7])\b/i;
  const groupHeaderRegex = /^Questions?\s*(\d{1,3})\s*[-–to]+\s*(\d{1,3})\s*(?:refer\s*to|below|following)?/i;
  const questionNumRegex = /^(?:Question\s+(\d{1,3})[\.\:\)]?|(\d{1,3})[\.\:\)])\s*(.*)/i;
  const optionRegex = /^\(?([A-D])[\.\)]\s*(.*)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const pageMarkerMatch = line.match(/^--\s*(\d+)\s+of\s+\d+\s*--$/i);
    if (pageMarkerMatch) {
      currentPageNumber = Number(pageMarkerMatch[1]);
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
    if (ANSWER_KEY_HEADER_REGEX.test(line)) {
      commitCurrentGroup();
      break;
    }

    // Check Group Header ("Questions 32-34 refer to...")
    const groupMatch = line.match(groupHeaderRegex);
    if (groupMatch) {
      commitCurrentGroup();
      currentGroupHeader = line;
      currentGroupSourcePageNumbers.add(currentPageNumber);
      const startNum = parseInt(groupMatch[1], 10);
      const endNum = parseInt(groupMatch[2], 10);
      currentGroupQuestionNums = Array.from({ length: endNum - startNum + 1 }, (_, idx) => startNum + idx);
      continue;
    }

    // Check Question Number
    const qMatch = line.match(questionNumRegex);
    if (qMatch) {
      commitPendingQuestion();
      questionCounter++;

      const rawQuestionNumber = parseInt(qMatch[1] || qMatch[2], 10);
      let qNum = rawQuestionNumber;
      if (currentGroupQuestionNums.length > 0 && !currentGroupQuestionNums.includes(rawQuestionNumber)) {
        const rawDigits = String(rawQuestionNumber);
        const suffixCandidates = currentGroupQuestionNums.filter((questionNumber) =>
          String(questionNumber).endsWith(rawDigits),
        );
        const importedInGroup = new Set(parsedQuestions
          .map((question) => question.questionNumber)
          .filter((questionNumber) => currentGroupQuestionNums.includes(questionNumber)));
        if (suffixCandidates.length === 1) qNum = suffixCandidates[0];
        else if (suffixCandidates.length === 0) {
          const remainingQuestions = currentGroupQuestionNums.filter((questionNumber) => !importedInGroup.has(questionNumber));
          if (remainingQuestions.length === 1) qNum = remainingQuestions[0];
        }
        if (qNum !== rawQuestionNumber) {
          warnings.push(`Đã khôi phục số câu ${qNum} từ nhãn OCR bị thiếu chữ số đầu (${rawQuestionNumber}).`);
        }
      }
      const questionRange = toeicMode === 'full_test' && hasExplicitPartHeaders
        ? TOEIC_FULL_TEST_QUESTION_RANGES[currentPart]
        : null;
      if (questionRange && (qNum < questionRange[0] || qNum > questionRange[1])) {
        if ((currentPart === 6 || currentPart === 7) && !pendingQuestion) {
          currentGroupSourcePageNumbers.add(currentPageNumber);
          currentPassageText += (currentPassageText ? '\n' : '') + line;
        }
        continue;
      }

      const rawQuestionText = qMatch[3] ? qMatch[3].trim() : '';
      const inlineOptionMatch = rawQuestionText.match(/^\(?([A-D])[.)]\s*(.*)$/i);
      const answerSheetPlaceholder = /^mark\s+your\s+answers?\s+on\s+your\s+answer\s+sheet\.?$/i.test(rawQuestionText);
      let qText = rawQuestionText || `Question ${qNum}`;
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
        const letter = inlineOptionMatch[1].toUpperCase();
        currentOptions.push({
          id: `opt_${letter.charCodeAt(0) - 64}`,
          text: `(${letter}) ${inlineOptionMatch[2].trim()}`,
        });
      }
      continue;
    }

    // Check Options (A), (B), (C), (D)
    const optMatch = line.match(optionRegex);
    if (optMatch && pendingQuestion) {
      const letter = optMatch[1].toUpperCase();
      const optText = optMatch[2] ? optMatch[2].trim() : '';

      let optId = 'opt_1';
      if (letter === 'A') optId = 'opt_1';
      else if (letter === 'B') optId = 'opt_2';
      else if (letter === 'C') optId = 'opt_3';
      else if (letter === 'D') optId = 'opt_4';

      currentOptions.push({
        id: optId,
        text: `(${letter}) ${optText}`,
      });
      continue;
    }

    if (pendingQuestion && currentOptions.length > 0 && !optMatch) {
      if (/^(?:GO\s+ON\s+TO\s+THE\s+NEXT\s+PAGE|THIS\s+IS\s+THE\s+END\s+OF\s+THE\s+.+|PART\s*[1-7]\b)/i.test(line)) continue;
      if (isLikelyPageFooterNoise(line, currentPageNumber)) continue;
      const lastOption = currentOptions[currentOptions.length - 1];
      lastOption.text = `${lastOption.text} ${line}`.trim();
      continue;
    }

    // If we are in Part 6 or 7 and line is not a question/option, accumulate passage text
    if ((currentPart === 6 || currentPart === 7) && !pendingQuestion) {
      currentGroupSourcePageNumbers.add(currentPageNumber);
      currentPassageText += (currentPassageText ? '\n' : '') + line;
    } else if (pendingQuestion && !optMatch && currentOptions.length === 0 && ![1, 2, 6].includes(currentPart)) {
      // Append text to current questionText if prompt wraps across lines
      if (!pendingQuestion.sourcePageNumbers.includes(currentPageNumber)) pendingQuestion.sourcePageNumbers.push(currentPageNumber);
      pendingQuestion.questionText += ' ' + line;
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
  const missingQuestionNumbers = expectedFullTestQuestionNumbers.filter((questionNumber) =>
    !importedQuestionNumbers.has(questionNumber),
  );
  const missingQuestionCount = missingQuestionNumbers.length;
  if (missingQuestionCount > 0) {
    warnings.unshift(`Đề TOEIC full test cần ${expectedQuestionCount} câu; OCR còn thiếu câu ${missingQuestionNumbers.join(', ')}. Kiểm tra các câu này trước khi lưu.`);
  }
  const detectedImagePageNumbers = new Set(parsedGroups.flatMap((group) => group.imagePageNumbers || []));
  const unassignedImagePageNumbers = [...availableImagePageNumbers].filter((pageNumber) => !detectedImagePageNumbers.has(pageNumber));
  if (unassignedImagePageNumbers.length > 0) {
    warnings.push(`Chưa gắn được ảnh ở trang PDF ${unassignedImagePageNumbers.join(', ')} vào nhóm câu hỏi; cần kiểm tra thủ công.`);
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
        images: detectedImagePageNumbers.size,
        imagePages: [...detectedImagePageNumbers].sort((left, right) => left - right),
        answerKeys: Object.keys(answerKeyMap).length,
      },
      warnings,
      missing,
      needsReview: true,
    },
  };
};
