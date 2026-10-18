const MIN_PAGE_TEXT_LENGTH = 80;
const MAX_PDF_PAGES_FOR_OCR = 100;
const MAX_OCR_WORKERS = 2;
const OCR_RENDER_SCALE = 1.6;
const PART1_RETRY_RENDER_SCALE = 2.6;
const PART6_RETRY_RENDER_SCALE = 2.2;
const PART7_RETRY_RENDER_SCALE = 2.35;
const ANSWER_KEY_RETRY_RENDER_SCALE = 2.4;
const PAGE_IMAGE_MAX_WIDTH = 960;
const PAGE_IMAGE_QUALITY = 0.76;
const VISUAL_TOEIC_PARTS = new Set([1, 7]);
const ANSWER_KEY_HEADER_REGEX = /^\s*(?:ANSWER\s*KEYS?|ANSWERS?|KEY|ĐÁP\s*ÁN)(?:\s*[:\-]?\s*(?:(?:QUESTIONS?\s*)?\d{1,3}(?:\s*(?:[-–]|to)\s*\d{1,3})?|\d{1,3}\+)?)?\s*$/im;
const INLINE_ANSWER_KEY_HEADER_REGEX = /\bANSWER\s*KEYS?\b/i;
const OCR_RESULTS_BY_FILE = new WeakMap();

const hasAnswerKeyHeader = (text = '') =>
  ANSWER_KEY_HEADER_REGEX.test(text) || INLINE_ANSWER_KEY_HEADER_REGEX.test(text);

const countReadableCharacters = (value = '') =>
  (value.match(/[\p{L}\p{N}]/gu) || []).length;

const getPart1QuestionNumbers = (text = '') => new Set(
  [...text.matchAll(/(?:^|\n)\s*(?:QUESTION\s*)?([1-6])(?:[.:)]|\s|$)/gim)]
    .map((match) => Number(match[1])),
);

const isBetterPart1OcrText = (candidate = '', current = '') => {
  const candidateNumbers = getPart1QuestionNumbers(candidate).size;
  const currentNumbers = getPart1QuestionNumbers(current).size;
  return candidateNumbers > currentNumbers
    || (candidateNumbers === currentNumbers && countReadableCharacters(candidate) > countReadableCharacters(current) * 1.08);
};

const createPageImageBlob = async (sourceCanvas, cropBottom = sourceCanvas.height) => {
  const cropHeight = Math.max(1, Math.min(sourceCanvas.height, Math.round(cropBottom)));
  const scale = Math.min(1, PAGE_IMAGE_MAX_WIDTH / sourceCanvas.width);
  const thumbnail = document.createElement('canvas');
  thumbnail.width = Math.max(1, Math.round(sourceCanvas.width * scale));
  thumbnail.height = Math.max(1, Math.round(cropHeight * scale));

  try {
    const context = thumbnail.getContext('2d');
    if (!context) return null;
    context.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, cropHeight, 0, 0, thumbnail.width, thumbnail.height);
    return await new Promise((resolve) => {
      thumbnail.toBlob(resolve, 'image/jpeg', PAGE_IMAGE_QUALITY);
    });
  } finally {
    thumbnail.width = 0;
    thumbnail.height = 0;
  }
};

const getVisualPageNumbers = (pageTexts) => {
  const visualPageNumbers = [];
  let activePart = null;

  for (const [pageNumber, text] of [...pageTexts.entries()].sort(([left], [right]) => left - right)) {
    if (hasAnswerKeyHeader(text)) break;
    const partHeaders = [...text.matchAll(/^\s*PART\s*([1-7])\b/gim)];
    if (partHeaders.length > 0) activePart = Number(partHeaders[partHeaders.length - 1][1]);
    if (VISUAL_TOEIC_PARTS.has(activePart)) visualPageNumbers.push(pageNumber);
  }

  return visualPageNumbers;
};

const getPartNumberByPageNumber = (pageTexts) => {
  const partByPage = new Map();
  let activePart = null;

  for (const [pageNumber, text] of [...pageTexts.entries()].sort(([left], [right]) => left - right)) {
    const partHeaders = [...text.matchAll(/^\s*PART\s*([1-7])\b/gim)];
    if (partHeaders.length > 0) activePart = Number(partHeaders[partHeaders.length - 1][1]);
    partByPage.set(pageNumber, activePart);
  }

  return partByPage;
};

const getAnswerKeyPageNumbers = (pageTexts) => [...pageTexts.entries()]
  .filter(([, text]) => hasAnswerKeyHeader(text))
  .map(([pageNumber]) => pageNumber);

const countAnswerKeyPairs = (text = '') => {
  const headerMatch = INLINE_ANSWER_KEY_HEADER_REGEX.exec(text);
  if (!headerMatch) return 0;
  const answerSection = text.slice(headerMatch.index + headerMatch[0].length);
  return [...answerSection.matchAll(/\b\d{1,3}\s*(?:[.\-:) ]\s*)?(?:\(\s*[A-D©0O]\s*\)|[A-D]\b)/gi)].length;
};

const getPartPageNumbers = (pageTexts, targetPart) => {
  const pageNumbers = [];
  let activePart = null;

  for (const [pageNumber, text] of [...pageTexts.entries()].sort(([left], [right]) => left - right)) {
    const partHeaders = [...text.matchAll(/^\s*PART\s*([1-7])\b/gim)];
    if (partHeaders.length > 0) activePart = Number(partHeaders[partHeaders.length - 1][1]);
    if (activePart === targetPart) pageNumbers.push(pageNumber);
  }

  return pageNumbers;
};

const hasPart6OcrArtifacts = (text = '') =>
  /(?:[-=;:~|]{2,}|\b(?:zz|yz|zee|eeth|etre|ett|een|evie|jae)\b|[“"']\s*\d{1,3}[°º]?|(?:^|\s)\d{2}\s+(?=[A-Z]))/im.test(text)
  || /\b[a-z][A-Z]{1,2}\b/.test(text);

const scorePart6OcrText = (text = '') => {
  const readableCharacters = countReadableCharacters(text);
  const artifactCount = (text.match(/(?:[-=;:~|]{2,}|\b(?:zz|yz|zee|eeth|etre|ett|een|evie|jae)\b|[“"']\s*\d{1,3}[°º]?|(?:^|\s)\d{2}\s+(?=[A-Z]))/gim) || []).length
    + (text.match(/\b[a-z][A-Z]{1,2}\b/g) || []).length;
  return readableCharacters - artifactCount * 24;
};

const improveOcrContrast = (canvas) => {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const gray = pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.22 + 128));
    pixels[offset] = contrasted;
    pixels[offset + 1] = contrasted;
    pixels[offset + 2] = contrasted;
  }
  context.putImageData(image, 0, 0);
};

const buildLinesFromPdfTextItems = (items = []) => {
  const positionedItems = items
    .filter((item) => item.str?.trim())
    .map((item) => ({
      text: item.str.trim(),
      x: Number(item.transform?.[4]) || 0,
      y: Number(item.transform?.[5]) || 0,
    }))
    .sort((left, right) => right.y - left.y || left.x - right.x);

  const lines = [];
  for (const item of positionedItems) {
    const currentLine = lines[lines.length - 1];
    if (currentLine && Math.abs(currentLine.y - item.y) <= 2) {
      currentLine.items.push(item);
      continue;
    }
    lines.push({ y: item.y, items: [item] });
  }

  return lines
    .map((line) => line.items.sort((left, right) => left.x - right.x).map((item) => item.text).join(' '))
    .filter(Boolean)
    .join('\n');
};

const countDarkPixels = (pixels, width, height, left, top, right, bottom) => {
  let count = 0;
  const xStart = Math.max(0, Math.floor(left));
  const xEnd = Math.min(width, Math.ceil(right));
  const yStart = Math.max(0, Math.floor(top));
  const yEnd = Math.min(height, Math.ceil(bottom));

  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const offset = (y * width + x) * 4;
      if (pixels[offset + 3] > 0 && (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3 < 190) {
        count += 1;
      }
    }
  }
  return count;
};

const fillShortColumnGaps = (states, maxGap = 2) => {
  const result = [...states];
  let index = 0;

  while (index < result.length) {
    if (result[index] !== 'columns') {
      index += 1;
      continue;
    }

    let gapEnd = index + 1;
    while (gapEnd < result.length && result[gapEnd] === 'empty') gapEnd += 1;
    const gapLength = gapEnd - index - 1;
    if (gapLength > 0 && gapLength <= maxGap && result[gapEnd] === 'columns') {
      for (let fill = index + 1; fill < gapEnd; fill += 1) result[fill] = 'columns';
    }
    index = gapEnd;
  }

  return result;
};

/**
 * Finds a long two-column question area while leaving full-width directions or
 * passages intact. The reduced canvas keeps layout analysis inexpensive.
 */
const detectTwoColumnBody = (sourceCanvas) => {
  const analysisWidth = Math.min(256, sourceCanvas.width);
  const analysisHeight = Math.max(1, Math.round(sourceCanvas.height * (analysisWidth / sourceCanvas.width)));
  if (analysisWidth < 160 || analysisHeight < 180) return null;

  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = analysisWidth;
  analysisCanvas.height = analysisHeight;
  const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true });
  if (!analysisContext) return null;

  analysisContext.drawImage(sourceCanvas, 0, 0, analysisWidth, analysisHeight);
  const pixels = analysisContext.getImageData(0, 0, analysisWidth, analysisHeight).data;
  analysisCanvas.width = 0;
  analysisCanvas.height = 0;

  const contentTop = Math.floor(analysisHeight * 0.035);
  const contentBottom = Math.floor(analysisHeight * 0.94);
  const projection = new Uint32Array(analysisWidth);
  for (let y = contentTop; y < contentBottom; y += 2) {
    for (let x = Math.floor(analysisWidth * 0.32); x < Math.ceil(analysisWidth * 0.68); x += 1) {
      const offset = (y * analysisWidth + x) * 4;
      if (pixels[offset + 3] > 0 && (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3 < 190) {
        projection[x] += 1;
      }
    }
  }

  let gutterX = Math.floor(analysisWidth / 2);
  let minimumInk = Number.POSITIVE_INFINITY;
  const searchStart = Math.floor(analysisWidth * 0.38);
  const searchEnd = Math.ceil(analysisWidth * 0.58);
  for (let x = searchStart; x <= searchEnd; x += 1) {
    const localInk = projection[Math.max(0, x - 2)]
      + projection[Math.max(0, x - 1)]
      + projection[x]
      + projection[Math.min(analysisWidth - 1, x + 1)]
      + projection[Math.min(analysisWidth - 1, x + 2)];
    if (localInk < minimumInk) {
      minimumInk = localInk;
      gutterX = x;
    }
  }

  const leftStart = Math.floor(analysisWidth * 0.07);
  const gapHalfWidth = Math.max(3, Math.round(analysisWidth * 0.012));
  // Split at the quiet center gutter. Leaving an artificial gap here clips
  // question numbers that sit close to the left edge of the right column.
  const leftEnd = Math.max(leftStart + 1, gutterX);
  const rightStart = Math.min(analysisWidth - 1, gutterX);
  const rightEnd = Math.floor(analysisWidth * 0.93);
  const bandHeight = 4;
  const states = [];

  for (let y = contentTop; y < contentBottom; y += bandHeight) {
    const bandBottom = Math.min(contentBottom, y + bandHeight);
    const centerInk = countDarkPixels(
      pixels,
      analysisWidth,
      analysisHeight,
      gutterX - gapHalfWidth,
      y,
      gutterX + gapHalfWidth + 1,
      bandBottom,
    );
    const leftInk = countDarkPixels(pixels, analysisWidth, analysisHeight, leftStart, y, leftEnd, bandBottom);
    const rightInk = countDarkPixels(pixels, analysisWidth, analysisHeight, rightStart, y, rightEnd, bandBottom);

    if (centerInk >= 4) states.push('full');
    else if (leftInk >= 3 && rightInk >= 3) states.push('columns');
    else states.push('empty');
  }

  const smoothedStates = fillShortColumnGaps(states);
  let longestRun = null;
  let runStart = -1;
  for (let index = 0; index <= smoothedStates.length; index += 1) {
    if (smoothedStates[index] === 'columns') {
      if (runStart < 0) runStart = index;
      continue;
    }
    if (runStart >= 0) {
      const runLength = index - runStart;
      if (!longestRun || runLength > longestRun.length) longestRun = { start: runStart, length: runLength };
      runStart = -1;
    }
  }

  if (!longestRun || longestRun.length < 5) return null;

  const activeStates = smoothedStates.slice(longestRun.start).filter((state) => state === 'columns' || state === 'full');
  const columnRatio = activeStates.filter((state) => state === 'columns').length / Math.max(1, activeStates.length);
  if (columnRatio < 0.68) return null;

  const analysisStartY = contentTop + longestRun.start * bandHeight;
  const startY = Math.floor(analysisStartY * (sourceCanvas.height / analysisHeight));
  const splitX = Math.round(gutterX * (sourceCanvas.width / analysisWidth));
  if (splitX < sourceCanvas.width * 0.32 || splitX > sourceCanvas.width * 0.68) return null;
  if (sourceCanvas.height - startY < sourceCanvas.height * 0.18) return null;

  return { splitX, startY };
};

/** Finds the bottom border of the full-width Part 6 passage box. */
const detectPart6PassageBoundary = (sourceCanvas) => {
  const analysisWidth = Math.min(512, sourceCanvas.width);
  const analysisHeight = Math.max(1, Math.round(sourceCanvas.height * (analysisWidth / sourceCanvas.width)));
  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = analysisWidth;
  analysisCanvas.height = analysisHeight;
  const context = analysisCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(sourceCanvas, 0, 0, analysisWidth, analysisHeight);
  const pixels = context.getImageData(0, 0, analysisWidth, analysisHeight).data;
  analysisCanvas.width = 0;
  analysisCanvas.height = 0;

  const xStart = Math.floor(analysisWidth * 0.04);
  const xEnd = Math.ceil(analysisWidth * 0.96);
  const yStart = Math.floor(analysisHeight * 0.25);
  const yEnd = Math.floor(analysisHeight * 0.7);
  const lineRows = [];
  for (let y = yStart; y < yEnd; y += 1) {
    let darkPixels = 0;
    for (let x = xStart; x < xEnd; x += 1) {
      const offset = (y * analysisWidth + x) * 4;
      if (pixels[offset + 3] > 0 && (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3 < 220) {
        darkPixels += 1;
      }
    }
    if (darkPixels / (xEnd - xStart) >= 0.4) lineRows.push(y);
  }

  let lastBoundary = null;
  for (let index = 0; index < lineRows.length; index += 1) {
    const start = lineRows[index];
    let end = start;
    while (index + 1 < lineRows.length && lineRows[index + 1] - end <= 2) {
      index += 1;
      end = lineRows[index];
    }
    lastBoundary = end;
  }

  if (lastBoundary === null) return null;
  return Math.min(
    sourceCanvas.height - 1,
    Math.round((lastBoundary + 1) * (sourceCanvas.height / analysisHeight) + sourceCanvas.height * 0.006),
  );
};

const recognizeRegion = async (worker, sourceCanvas, left, top, width, height) => {
  if (width <= 0 || height <= 0) return '';
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Trình duyệt không hỗ trợ canvas để OCR file PDF.');

  try {
    context.drawImage(sourceCanvas, left, top, width, height, 0, 0, width, height);
    const result = await worker.recognize(canvas);
    return result.data.text || '';
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
};

const recognizePage = async (worker, canvas) => {
  const columns = detectTwoColumnBody(canvas);
  let text;
  if (!columns) {
    const result = await worker.recognize(canvas);
    text = result.data.text || '';
  } else {
    const textParts = [];
    if (columns.startY > canvas.height * 0.04) {
      textParts.push(await recognizeRegion(worker, canvas, 0, 0, canvas.width, columns.startY));
    }
    textParts.push(await recognizeRegion(worker, canvas, 0, columns.startY, columns.splitX, canvas.height - columns.startY));
    textParts.push(await recognizeRegion(worker, canvas, columns.splitX, columns.startY, canvas.width - columns.splitX, canvas.height - columns.startY));
    text = textParts.filter((part) => part.trim()).join('\n');
  }

  // Answer keys use a dense multi-column grid. OCR each half at full height so
  // small number-letter pairs stay legible and don't get lost in column order.
  if (hasAnswerKeyHeader(text)) {
    const middleX = Math.floor(canvas.width / 2);
    const [leftText, rightText] = await Promise.all([
      recognizeRegion(worker, canvas, 0, 0, middleX, canvas.height),
      recognizeRegion(worker, canvas, middleX, 0, canvas.width - middleX, canvas.height),
    ]);
    return [leftText, rightText].filter((part) => part.trim()).join('\n');
  }

  return text;
};

const hasPart7QuestionLabels = (text = '') =>
  /(?:^|\n)\s*(?:QUESTION\s*#?\s*)?#?\s*(?:14[7-9]|1[5-9]\d|200)(?:\s*[.:)](?:\s|$)|\s*$)/im.test(text);

const getPart7GroupHeader = (text = '') => text
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => /^Questions?\s*(?:14[7-9]|1[5-9]\d|200)\s*(?:[-–]|to)\s*(?:14[7-9]|1[5-9]\d|200)\b/i.test(line)) || '';

const isPart7QuestionLabelLine = (line = '') =>
  /^(?:Question\s*#?\s*)?#?\s*(?:14[7-9]|1[5-9]\d|200)(?:\s*[.:)](?:\s|$)|\s*$)/i.test(line.trim());

const getPart7QuestionLines = (ocrData) => (ocrData?.blocks || [])
  .flatMap((block) => block.paragraphs || [])
  .flatMap((paragraph) => paragraph.lines || [])
  .filter((line) => isPart7QuestionLabelLine(line.text || ''));

const isPart7PassageLine = (line = '') => {
  const text = String(line || '').trim();
  if (!text || isPart7QuestionLabelLine(text)) return false;
  if (/^PART\s*7\b/i.test(text) || /^Questions?\s*(?:14[7-9]|1[5-9]\d|200)\s*(?:[-–]|to)\s*(?:14[7-9]|1[5-9]\d|200)\b/i.test(text)) return false;
  if (/^(?:READING\s+TEST|GO\s+ON\s+TO\s+THE\s+NEXT\s+PAGE|THIS\s+IS\s+THE\s+END\b)/i.test(text)) return false;
  if (/^\d{1,3}$/.test(text)) return false;
  return /[\p{L}]{3}/u.test(text);
};

const retainPart7QuestionText = (text = '', partHeader = '', groupHeader = '') => {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const firstQuestionIndex = lines.findIndex(isPart7QuestionLabelLine);
  const questionLines = firstQuestionIndex >= 0 ? lines.slice(firstQuestionIndex) : [];
  return [partHeader, groupHeader, ...questionLines].filter(Boolean).join('\n');
};

const recognizePart7Page = async (worker, canvas, originalPageText = '') => {
  const partHeader = originalPageText.match(/^\s*PART\s*7\b[^\n]*/im)?.[0]?.trim() || '';
  const { data } = await worker.recognize(canvas, {}, { blocks: true });
  const blockText = (data?.blocks || [])
    .flatMap((block) => block.paragraphs || [])
    .flatMap((paragraph) => paragraph.lines || [])
    .map((line) => line.text || '')
    .join('\n');
  const groupHeader = getPart7GroupHeader(originalPageText) || getPart7GroupHeader(blockText);
  const questionLines = getPart7QuestionLines(data);
  const questionYPositions = questionLines
    .map((line) => Number(line.bbox?.y0))
    .filter(Number.isFinite);
  if (questionLines.length === 0 || questionYPositions.length === 0) {
    if (hasPart7QuestionLabels(originalPageText)) {
      const fullPageText = await recognizePage(worker, canvas);
      return {
        // If Tesseract could not provide coordinates, retain only the portion
        // beginning with the first question label. Never feed passage OCR text
        // into the question parser; the corresponding page image is reviewable.
        text: retainPart7QuestionText(fullPageText, partHeader, groupHeader),
        hasPassage: false,
        cropBottom: 0,
      };
    }
    return { text: [partHeader, groupHeader].filter(Boolean).join('\n'), hasPassage: true, cropBottom: canvas.height };
  }

  const firstQuestionY = Math.min(...questionYPositions);
  const hasRecognizedPassageText = (data?.blocks || [])
    .flatMap((block) => block.paragraphs || [])
    .flatMap((paragraph) => paragraph.lines || [])
    .some((line) => Number(line.bbox?.y1) < firstQuestionY && isPart7PassageLine(line.text));
  // Some passages are primarily graphics and yield little OCR text. The scan
  // places those passages well above the question columns; question-only
  // continuation pages start close to the top margin.
  const hasPassage = hasRecognizedPassageText || firstQuestionY >= canvas.height * 0.13;
  const questionStartY = Math.max(0, firstQuestionY - Math.round(canvas.height * 0.008));
  const halfWidth = Math.floor(canvas.width / 2);
  const [leftQuestions, rightQuestions] = await Promise.all([
    recognizeRegion(worker, canvas, 0, questionStartY, halfWidth, canvas.height - questionStartY),
    recognizeRegion(worker, canvas, halfWidth, questionStartY, canvas.width - halfWidth, canvas.height - questionStartY),
  ]);

  return {
    text: [partHeader, groupHeader, leftQuestions, rightQuestions].filter((part) => part.trim()).join('\n'),
    hasPassage,
    cropBottom: Math.max(1, firstQuestionY - Math.round(canvas.height * 0.012)),
  };
};

const recognizePart1Page = async (worker, canvas) => {
  improveOcrContrast(canvas);
  const labelRegions = [
    { top: 0.025, height: 0.055 },
    { top: 0.43, height: 0.06 },
  ];
  const labels = [];

  await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789.' });
  try {
    for (const region of labelRegions) {
      const text = await recognizeRegion(
        worker,
        canvas,
        Math.round(canvas.width * 0.075),
        Math.round(canvas.height * region.top),
        Math.round(canvas.width * 0.13),
        Math.round(canvas.height * region.height),
      );
      const label = text.match(/(?:^|\D)([1-6])\s*[.)]?\s*$/)?.[1]
        || text.match(/\b([1-6])\b/)?.[1];
      if (label && !labels.includes(Number(label))) labels.push(Number(label));
    }
  } finally {
    await worker.setParameters({ tessedit_pageseg_mode: '3', tessedit_char_whitelist: '' });
  }

  // The scanned TOEIC Part 1 layout places two numbered photographs in
  // separate rows. Isolating the small left margin keeps the photo content
  // from confusing OCR and losing every other question label.
  if (labels.length < 2) {
    const fallbackLabelRegions = [
      { top: 0, height: 0.12 },
      { top: 0.4, height: 0.13 },
    ];
    for (const region of fallbackLabelRegions) {
      const text = await recognizeRegion(
        worker,
        canvas,
        Math.round(canvas.width * 0.075),
        Math.round(canvas.height * region.top),
        Math.round(canvas.width * 0.11),
        Math.round(canvas.height * region.height),
      );
      const label = text.match(/(?:^|\D)([1-6])\s*[.)]?\s*$/)?.[1]
        || text.match(/\b([1-6])\b/)?.[1];
      if (label && !labels.includes(Number(label))) labels.push(Number(label));
    }
  }
  return labels.sort((left, right) => left - right).map((label) => `Question ${label}.`).join('\n');
};

const recognizePart6Page = async (worker, canvas) => {
  const passageBottom = detectPart6PassageBoundary(canvas);
  if (!passageBottom) return { text: await recognizePage(worker, canvas), usedPassageBoundary: false };

  const splitX = Math.round(canvas.width * 0.44);
  const [passageText, leftColumnText, rightColumnText] = await Promise.all([
    recognizeRegion(worker, canvas, 0, 0, canvas.width, passageBottom),
    recognizeRegion(worker, canvas, 0, passageBottom, splitX, canvas.height - passageBottom),
    recognizeRegion(worker, canvas, splitX, passageBottom, canvas.width - splitX, canvas.height - passageBottom),
  ]);
  return {
    text: [passageText, leftColumnText, rightColumnText].filter((part) => part.trim()).join('\n'),
    usedPassageBoundary: true,
  };
};

const recognizeAnswerKeyPage = async (worker, canvas) => {
  improveOcrContrast(canvas);
  const middleX = Math.floor(canvas.width / 2);
  const [leftText, rightText] = await Promise.all([
    recognizeRegion(worker, canvas, 0, 0, middleX, canvas.height),
    recognizeRegion(worker, canvas, middleX, 0, canvas.width - middleX, canvas.height),
  ]);
  return [leftText, rightText].filter((part) => part.trim()).join('\n');
};

const extractToeicPdfTextUncached = async (file, onProgress) => {
  let workers = [];
  let pdf = null;

  try {
    onProgress({ phase: 'loading', currentPage: 0, totalPages: 0, progress: 0 });

    const [pdfjs, pdfWorkerAsset] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);

    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerAsset.default;
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    pdf = await pdfjs.getDocument({ data: fileBytes }).promise;

    const pageTexts = new Map();
    const pageImagesByNumber = new Map();
    const part7PassageCropBottomByPage = new Map();
    const pagesToOcr = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress({
        phase: 'reading',
        currentPage: pageNumber,
        totalPages: pdf.numPages,
        progress: (pageNumber / pdf.numPages) * 20,
      });

      const page = await pdf.getPage(pageNumber);
      try {
        const textContent = await page.getTextContent();
        const textLayer = buildLinesFromPdfTextItems(textContent.items || []);
        if (countReadableCharacters(textLayer) >= MIN_PAGE_TEXT_LENGTH) pageTexts.set(pageNumber, textLayer);
        else pagesToOcr.push(pageNumber);
      } finally {
        page.cleanup();
      }
    }

    if (pagesToOcr.length > MAX_PDF_PAGES_FOR_OCR) {
      throw new Error('PDF có ' + pagesToOcr.length + ' trang scan cần OCR. Hãy chia file thành các phần tối đa ' + MAX_PDF_PAGES_FOR_OCR + ' trang scan để OCR ổn định hơn.');
    }

    const hasPart7TextLayerPages = getPartPageNumbers(pageTexts, 7)
      .some((pageNumber) => !hasAnswerKeyHeader(pageTexts.get(pageNumber)));
    if (pagesToOcr.length > 0 || hasPart7TextLayerPages) {
      const [tesseract, tesseractWorkerAsset] = await Promise.all([
        import('tesseract.js'),
        import('tesseract.js/dist/worker.min.js?url'),
      ]);
      onProgress({ phase: 'loading_ocr', currentPage: pagesToOcr[0], totalPages: pdf.numPages, progress: 20 });

      const availableCores = Number(globalThis.navigator?.hardwareConcurrency) || 4;
      const workerCount = Math.min(MAX_OCR_WORKERS, Math.max(1, pagesToOcr.length), availableCores >= 4 ? 2 : 1);
      const currentPageByWorker = new Map();
      const progressByWorker = new Map();
      let completedOcrPages = 0;
      let lastReportedProgress = 20;

      const reportOcrProgress = (workerIndex, pageProgress = 0) => {
        progressByWorker.set(workerIndex, Math.max(0, Math.min(1, Number(pageProgress) || 0)));
        const activeProgress = Array.from(progressByWorker.values()).reduce((sum, value) => sum + value, 0);
        const completedPages = pdf.numPages - pagesToOcr.length + completedOcrPages;
        const progress = Math.min(99, ((completedPages + activeProgress) / pdf.numPages) * 100);
        lastReportedProgress = Math.max(lastReportedProgress, progress);
        onProgress({
          phase: 'ocr',
          currentPage: currentPageByWorker.get(workerIndex) || pagesToOcr[0],
          totalPages: pdf.numPages,
          progress: lastReportedProgress,
        });
      };

      workers = [];
      await Promise.all(Array.from({ length: workerCount }, async (_, workerIndex) => {
        const worker = await tesseract.createWorker('eng', 1, {
          workerPath: tesseractWorkerAsset.default,
          logger: (message) => {
            if (message.status === 'recognizing text') reportOcrProgress(workerIndex, message.progress);
          },
        });
        workers[workerIndex] = worker;
      }));

      let nextPageIndex = 0;
      const processWorkerQueue = async (worker, workerIndex) => {
        while (nextPageIndex < pagesToOcr.length) {
          const pageNumber = pagesToOcr[nextPageIndex];
          nextPageIndex += 1;
          currentPageByWorker.set(workerIndex, pageNumber);
          progressByWorker.set(workerIndex, 0);
          onProgress({
            phase: 'ocr',
            currentPage: pageNumber,
            totalPages: pdf.numPages,
            progress: lastReportedProgress,
          });

          const page = await pdf.getPage(pageNumber);
          let canvas = null;
          try {
            const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
            canvas = document.createElement('canvas');
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) throw new Error('Trình duyệt không hỗ trợ canvas để OCR file PDF.');

            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await page.render({ canvas, canvasContext: context, viewport }).promise;
            const text = await recognizePage(worker, canvas);
            pageTexts.set(pageNumber, text);
          } finally {
            if (canvas) {
              canvas.width = 0;
              canvas.height = 0;
            }
            page.cleanup();
          }

          completedOcrPages += 1;
          progressByWorker.set(workerIndex, 0);
          reportOcrProgress(workerIndex, 0);
        }
      };

      await Promise.all(workers.map((worker, index) => processWorkerQueue(worker, index)));
    }

    // Part 6 passages contain dense prose and short blank markers. Retry only
    // scanned Part 6 pages with likely blank-marker artifacts at higher scale.
    const scannedPageSet = new Set(pagesToOcr);
    // Part 1 photos leave only small question numbers for OCR. A full-page,
    // higher-resolution pass avoids losing alternating labels when layout
    // analysis mistakes the six-photo grid for two text columns.
    const partOneRetryPages = getPartPageNumbers(pageTexts, 1)
      .filter((pageNumber) => scannedPageSet.has(pageNumber));
    for (const pageNumber of partOneRetryPages) {
      onProgress({
        phase: 'ocr',
        currentPage: pageNumber,
        totalPages: pdf.numPages,
        progress: 99,
      });

      const page = await pdf.getPage(pageNumber);
      let canvas = null;
      try {
        const viewport = page.getViewport({ scale: PART1_RETRY_RENDER_SCALE });
        canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) continue;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const refinedText = await recognizePart1Page(workers[0], canvas);
        const currentText = pageTexts.get(pageNumber) || '';
        const recognizedQuestionNumbers = new Set([
          ...getPart1QuestionNumbers(currentText),
          ...getPart1QuestionNumbers(refinedText),
        ]);
        const questionNumberSet = new Set(recognizedQuestionNumbers);
        // Full-test Part 1 prints two consecutive photo questions per page.
        // If OCR reads only one row label, recover its paired label so the
        // missing photograph is still represented as a question in review.
        for (const questionNumber of recognizedQuestionNumbers) {
          if (questionNumber < 1 || questionNumber > 6) continue;
          const pairStart = Math.floor((questionNumber - 1) / 2) * 2 + 1;
          questionNumberSet.add(pairStart);
          questionNumberSet.add(pairStart + 1);
        }
        const questionNumbers = [...questionNumberSet].sort((left, right) => left - right);
        const retainedPartHeader = currentText.match(/^\s*PART\s*1\b[^\n]*/im)?.[0];
        const mergedText = [
          retainedPartHeader,
          ...questionNumbers.map((questionNumber) => `Question ${questionNumber}.`),
        ].filter(Boolean).join('\n');
        if (questionNumbers.length > 0 && isBetterPart1OcrText(mergedText, currentText)) {
          pageTexts.set(pageNumber, mergedText);
        }
      } finally {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        page.cleanup();
      }
    }

    const partSixRetryPages = getPartPageNumbers(pageTexts, 6)
      .filter((pageNumber) => scannedPageSet.has(pageNumber) && hasPart6OcrArtifacts(pageTexts.get(pageNumber)));
    for (const pageNumber of partSixRetryPages) {
      onProgress({
        phase: 'ocr',
        currentPage: pageNumber,
        totalPages: pdf.numPages,
        progress: 99,
      });

      const page = await pdf.getPage(pageNumber);
      let canvas = null;
      try {
        const viewport = page.getViewport({ scale: PART6_RETRY_RENDER_SCALE });
        canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) continue;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        improveOcrContrast(canvas);

        const { text: refinedText, usedPassageBoundary } = await recognizePart6Page(workers[0], canvas);
        if (refinedText.trim() && (usedPassageBoundary || scorePart6OcrText(refinedText) > scorePart6OcrText(pageTexts.get(pageNumber)))) {
          pageTexts.set(pageNumber, refinedText);
        }
      } finally {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        page.cleanup();
      }
    }

    // Keep the Part 7 group heading and OCR only the question columns. The
    // passage stays in a cropped source-page image.
    const partSevenRetryPages = getPartPageNumbers(pageTexts, 7)
      .filter((pageNumber) => !hasAnswerKeyHeader(pageTexts.get(pageNumber)));
    for (const pageNumber of partSevenRetryPages) {
      onProgress({
        phase: 'ocr',
        currentPage: pageNumber,
        totalPages: pdf.numPages,
        progress: 99,
      });

      const page = await pdf.getPage(pageNumber);
      let canvas = null;
      try {
        const viewport = page.getViewport({ scale: PART7_RETRY_RENDER_SCALE });
        canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) continue;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        improveOcrContrast(canvas);

        const { text: refinedText, hasPassage, cropBottom } = await recognizePart7Page(
          workers[0],
          canvas,
          pageTexts.get(pageNumber) || '',
        );
        pageTexts.set(pageNumber, refinedText);
        const passageCrop = { hasPassage, cropBottom };
        if (passageCrop.hasPassage) {
          part7PassageCropBottomByPage.set(pageNumber, passageCrop.cropBottom / canvas.height);
        }
      } finally {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        page.cleanup();
      }
    }

    // Answer keys are printed in a dense grid, so retry scanned key pages at a
    // higher resolution and compare the number of recognized number-letter
    // pairs. This avoids replacing a better first pass with noisier OCR.
    const answerKeyRetryPages = getAnswerKeyPageNumbers(pageTexts)
      .filter((pageNumber) => scannedPageSet.has(pageNumber));
    for (const pageNumber of answerKeyRetryPages) {
      onProgress({
        phase: 'ocr',
        currentPage: pageNumber,
        totalPages: pdf.numPages,
        progress: 99,
      });

      const page = await pdf.getPage(pageNumber);
      let canvas = null;
      try {
        const viewport = page.getViewport({ scale: ANSWER_KEY_RETRY_RENDER_SCALE });
        canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) continue;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const refinedText = await recognizeAnswerKeyPage(workers[0], canvas);
        if (countAnswerKeyPairs(refinedText) > countAnswerKeyPairs(pageTexts.get(pageNumber))) {
          pageTexts.set(pageNumber, refinedText);
        }
      } finally {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        page.cleanup();
      }
    }

    const visualPageNumbers = getVisualPageNumbers(pageTexts);
    const partByPageNumber = getPartNumberByPageNumber(pageTexts);
    const textLayerVisualPages = visualPageNumbers.filter((pageNumber) => !pageImagesByNumber.has(pageNumber));
    for (let index = 0; index < textLayerVisualPages.length; index += 1) {
      const pageNumber = textLayerVisualPages[index];
      onProgress({
        phase: 'images',
        currentPage: pageNumber,
        totalPages: pdf.numPages,
        progress: 99,
      });

      const page = await pdf.getPage(pageNumber);
      let canvas = null;
      try {
        const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
        canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) continue;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const partNumber = partByPageNumber.get(pageNumber);
        const passageCropRatio = partNumber === 7
          ? part7PassageCropBottomByPage.get(pageNumber)
          : undefined;
        if (partNumber === 7 && passageCropRatio === undefined) continue;

        const passageCropBottom = passageCropRatio === undefined
          ? undefined
          : Math.round(canvas.height * passageCropRatio);
        const pageImage = await createPageImageBlob(canvas, passageCropBottom);
        if (pageImage) pageImagesByNumber.set(pageNumber, pageImage);
      } catch {
        // Image rendering is supplemental; the extracted text remains usable.
      } finally {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        page.cleanup();
      }
    }

    onProgress({ phase: 'complete', currentPage: pdf.numPages, totalPages: pdf.numPages, progress: 100 });
    return {
      text: [...pageTexts.entries()]
        .sort(([left], [right]) => left - right)
        .map(([pageNumber, text]) => '-- ' + pageNumber + ' of ' + pdf.numPages + ' --\n' + text)
        .join('\n'),
      ocrPageCount: pagesToOcr.length,
      totalPages: pdf.numPages,
      pageImages: visualPageNumbers
        .filter((pageNumber) => pageImagesByNumber.has(pageNumber))
        .map((pageNumber) => ({
          pageNumber,
          blob: pageImagesByNumber.get(pageNumber),
          isPassagePage: partByPageNumber.get(pageNumber) === 7,
        })),
      passageImagePageNumbers: [...part7PassageCropBottomByPage.keys()].sort((left, right) => left - right),
    };
  } catch (error) {
    if (error.message?.startsWith('PDF có ')) throw error;
    throw new Error('Không thể đọc/OCR PDF trên trình duyệt: ' + (error.message || 'Lỗi không xác định'));
  } finally {
    await Promise.allSettled(workers.filter(Boolean).map((worker) => worker.terminate()));
    if (pdf) await pdf.destroy().catch(() => {});
  }
};

/**
 * Extracts selectable PDF text and OCRs pages that have no useful text layer.
 * OCR is cached for the selected File object so repeated previews do not rescan it.
 */
export const extractToeicPdfText = async (file, { onProgress = () => {} } = {}) => {
  if (!(file instanceof Blob)) {
    throw new Error('Vui lòng chọn một file PDF hợp lệ.');
  }

  const cached = OCR_RESULTS_BY_FILE.get(file);
  if (cached) {
    const result = await cached;
    onProgress({ phase: 'complete', currentPage: result.totalPages, totalPages: result.totalPages, progress: 100, cached: true });
    return result;
  }

  const extraction = extractToeicPdfTextUncached(file, onProgress);
  OCR_RESULTS_BY_FILE.set(file, extraction);
  try {
    return await extraction;
  } catch (error) {
    OCR_RESULTS_BY_FILE.delete(file);
    throw error;
  }
};
