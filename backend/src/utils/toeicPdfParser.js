import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');
const PDFParseClass = pdfParseModule.PDFParse;

/**
 * Helper to extract embedded JPEG & PNG images from raw PDF Buffer
 */
const extractImagesFromPdfBuffer = (buffer) => {
  const images = [];
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  try {
    // 1. JPEG Extraction (FF D8 FF ... FF D9)
    let pos = 0;
    while (pos < buffer.length) {
      const start = buffer.indexOf(Buffer.from([0xff, 0xd8, 0xff]), pos);
      if (start === -1) break;

      const end = buffer.indexOf(Buffer.from([0xff, 0xd9]), start + 3);
      if (end === -1) break;

      const imgBuffer = buffer.slice(start, end + 2);
      // Ensure image is reasonable size (> 2KB to avoid tiny icon artifacts)
      if (imgBuffer.length > 2048) {
        const filename = `pdf_img_${Date.now()}_${images.length + 1}.jpg`;
        const filepath = path.join(uploadsDir, filename);
        fs.writeFileSync(filepath, imgBuffer);
        images.push({
          url: `/uploads/${filename}`,
          path: filepath,
          size: imgBuffer.length,
          type: 'image/jpeg',
        });
      }
      pos = end + 2;
    }

    // 2. PNG Extraction (89 50 4E 47 0D 0A 1A 0A ... IEND)
    pos = 0;
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const pngEnd = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

    while (pos < buffer.length) {
      const start = buffer.indexOf(pngHeader, pos);
      if (start === -1) break;

      const end = buffer.indexOf(pngEnd, start + 8);
      if (end === -1) break;

      const imgBuffer = buffer.slice(start, end + 8);
      if (imgBuffer.length > 2048) {
        const filename = `pdf_img_${Date.now()}_${images.length + 1}.png`;
        const filepath = path.join(uploadsDir, filename);
        fs.writeFileSync(filepath, imgBuffer);
        images.push({
          url: `/uploads/${filename}`,
          path: filepath,
          size: imgBuffer.length,
          type: 'image/png',
        });
      }
      pos = end + 8;
    }
  } catch (err) {
    console.error('Error extracting images from PDF buffer:', err);
  }

  return images;
};

/**
 * Extract Answer Key map from text: { 1: 'A', 2: 'B', 101: 'C', ... }
 */
const extractAnswerKey = (text) => {
  const answerKeyMap = {};
  if (!text) return answerKeyMap;

  // Search for Answer Key block
  const keyHeaderMatch = text.match(/(?:ANSWER\s*KEY|ANSWERS|KEY|ĐÁP\s*ÁN)[\s\S]*/i);
  const searchSection = keyHeaderMatch ? keyHeaderMatch[0] : text;

  // Patterns like: "101. A", "101 - A", "101:A", "101 A", "Q101: A"
  const pairRegex = /(?:Q|Question)?\s*(\d{1,3})\s*[\.\:\-\s]+\s*([A-D])\b/gi;
  let match;

  while ((match = pairRegex.exec(searchSection)) !== null) {
    const qNum = parseInt(match[1], 10);
    const ansLetter = match[2].toUpperCase();
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

  // 1. Extract raw text with pdf-parse
  let pdfData;
  try {
    if (typeof PDFParseClass === 'function') {
      const parser = new PDFParseClass(new Uint8Array(pdfBuffer));
      pdfData = await parser.getText();
    } else if (typeof pdfParseModule === 'function') {
      pdfData = await pdfParseModule(pdfBuffer);
    } else {
      throw new Error('PDFParse module function not found');
    }
  } catch (err) {
    throw new Error(`Không thể phân tích file PDF. Vui lòng kiểm tra file PDF: ${err.message}`);
  }

  const rawText = pdfData.text || '';
  if (!rawText.trim()) {
    throw new Error('File PDF là bản quét ảnh (Scanned PDF) không có dữ liệu văn bản. Vui lòng sử dụng file PDF chứa Text hoặc chuyển đổi OCR trước.');
  }

  // 2. Extract embedded images
  const extractedImages = extractImagesFromPdfBuffer(pdfBuffer);

  // 3. Extract Answer Key
  const answerKeyMap = extractAnswerKey(rawText);

  // 4. Split lines and process TOEIC Parts
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const parsedGroups = [];
  const parsedQuestions = [];

  let currentPart = 1;
  let currentPassageText = '';
  let currentGroupHeader = '';
  let currentGroupType = 'single';
  let currentGroupQuestionNums = [];
  let currentGroupImages = [];

  let pendingQuestion = null;
  let currentOptions = [];
  let questionCounter = 0;

  // Helper to commit pending question
  const commitPendingQuestion = () => {
    if (!pendingQuestion) return;

    // Ensure 4 options (A, B, C, D)
    const formattedOptions = (currentOptions.length > 0 ? currentOptions : [
      { id: 'opt_1', text: '(A) Statement A' },
      { id: 'opt_2', text: '(B) Statement B' },
      { id: 'opt_3', text: '(C) Statement C' },
      { id: 'opt_4', text: '(D) Statement D' },
    ]).slice(0, 4);

    // Map Answer Key
    const qNum = pendingQuestion.questionNumber;
    let correctOptionId = 'opt_1';

    if (answerKeyMap[qNum]) {
      const letter = answerKeyMap[qNum];
      if (letter === 'A') correctOptionId = 'opt_1';
      else if (letter === 'B') correctOptionId = 'opt_2';
      else if (letter === 'C') correctOptionId = 'opt_3';
      else if (letter === 'D') correctOptionId = 'opt_4';
    } else {
      warnings.push(`Câu hỏi ${qNum}: Không tìm thấy đáp án trong Answer Key, mặc định chọn đáp án (A). Giáo viên cần review.`);
    }

    pendingQuestion.options = formattedOptions;
    pendingQuestion.correctAnswers = [correctOptionId];
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
    const groupQuestions = parsedQuestions.filter((q) => !q.questionGroupRef);

    if (groupQuestions.length > 0 || currentPassageText) {
      const partNum = groupQuestions.length > 0 ? groupQuestions[0].toeicPart : currentPart;

      let gType = currentGroupType;
      if (currentPassageText) {
        gType = partNum >= 6 ? 'passage' : 'single';
      } else if (currentGroupImages.length > 0 && partNum <= 4) {
        gType = 'audio_image';
      } else if (partNum <= 4) {
        gType = 'audio';
      }

      const passages = currentPassageText
        ? [{ title: currentGroupHeader || 'Passage', content: currentPassageText, order: 1 }]
        : [];

      const groupObj = {
        partNumber: partNum,
        type: gType,
        title: currentGroupHeader || `Group Part ${partNum}`,
        instructions: `Questions ${groupQuestions.map((q) => q.questionNumber).join(', ')}`,
        imageUrl: currentGroupImages.length > 0 ? currentGroupImages[0].url : '',
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
    currentGroupImages = [];
    currentGroupType = 'single';
  };

  // Regex patterns
  const partHeaderRegex = /^PART\s*([1-7])\b/i;
  const groupHeaderRegex = /^Questions?\s*(\d{1,3})\s*[-–to]+\s*(\d{1,3})\s*(?:refer\s*to|below|following)?/i;
  const questionNumRegex = /^(?:Question\s+(\d{1,3})[\.\:\)]?|(\d{1,3})[\.\:\)])\s*(.*)/i;
  const optionRegex = /^\(?([A-D])[\.\)]\s*(.*)/i;

  let imageIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check Part Header
    const partMatch = line.match(partHeaderRegex);
    if (partMatch) {
      commitCurrentGroup();
      currentPart = parseInt(partMatch[1], 10);
      continue;
    }

    // Stop parsing if we hit Answer Key section at bottom
    if (/^(?:ANSWER\s*KEY|ANSWERS|KEY|ĐÁP\s*ÁN)/i.test(line)) {
      commitCurrentGroup();
      break;
    }

    // Check Group Header ("Questions 32-34 refer to...")
    const groupMatch = line.match(groupHeaderRegex);
    if (groupMatch) {
      commitCurrentGroup();
      currentGroupHeader = line;
      const startNum = parseInt(groupMatch[1], 10);
      const endNum = parseInt(groupMatch[2], 10);
      currentGroupQuestionNums = Array.from({ length: endNum - startNum + 1 }, (_, idx) => startNum + idx);

      // Assign extracted image if available for Part 1 or Part 3/4 graphic
      if ((currentPart === 1 || currentPart === 3 || currentPart === 4 || currentPart === 7) && imageIndex < extractedImages.length) {
        currentGroupImages.push(extractedImages[imageIndex]);
        imageIndex++;
      }
      continue;
    }

    // Check Question Number
    const qMatch = line.match(questionNumRegex);
    if (qMatch) {
      commitPendingQuestion();
      questionCounter++;

      const qNum = parseInt(qMatch[1] || qMatch[2], 10);
      const qText = qMatch[3] ? qMatch[3].trim() : `Question ${qNum}`;

      pendingQuestion = {
        questionNumber: qNum,
        questionText: qText || `Question ${qNum}`,
        type: 'single_choice',
        score: 1,
        explanation: '',
        order: qNum,
      };
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

    // If we are in Part 6 or 7 and line is not a question/option, accumulate passage text
    if ((currentPart === 6 || currentPart === 7) && !pendingQuestion) {
      currentPassageText += (currentPassageText ? '\n' : '') + line;
    } else if (pendingQuestion && !optMatch && currentOptions.length === 0) {
      // Append text to current questionText if prompt wraps across lines
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
        audioUrl: '',
        passages: [],
        questions: [q],
        order: q.questionNumber,
      });
    }
  }

  // Listening section notification
  const listeningCount = parsedQuestions.filter((q) => q.toeicPart <= 4).length;
  if (listeningCount > 0) {
    missing.push(`Phần thi Nghe (Part 1-4 có ${listeningCount} câu hỏi) chưa có file âm thanh Audio. Giáo viên cần upload file MP3 bài nghe cho từng nhóm câu hỏi.`);
  }

  const detectedPartsList = Array.from(new Set(parsedQuestions.map((q) => q.toeicPart))).sort((a, b) => a - b);

  return {
    parsedGroups,
    parsedQuestions,
    extractedImages,
    answerKeyMap,
    report: {
      status: 'draft',
      detected: {
        parts: detectedPartsList.length > 0 ? detectedPartsList : [1],
        partsCount: detectedPartsList.length || 1,
        questionGroups: parsedGroups.length,
        questions: parsedQuestions.length,
        images: extractedImages.length,
        answerKeys: Object.keys(answerKeyMap).length,
      },
      warnings,
      missing,
      needsReview: true,
    },
  };
};
