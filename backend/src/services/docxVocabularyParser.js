import mammoth from 'mammoth';

/**
 * Service to parse Vocabulary data from DOCX files or raw text.
 * Supports both paragraph-based structured texts and Word tables.
 */
export class DocxVocabularyParser {
  /**
   * Parse a DOCX Buffer into a list of structured vocabulary items.
   * @param {Buffer} buffer - Raw DOCX file buffer
   * @param {Object} options - { defaultTopic, courseId, lessonId }
   * @returns {Promise<{ items: Array, summary: Object, topics: Array, warnings: Array }>}
   */
  static async parseDocxBuffer(buffer, options = {}) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error('Dữ liệu file không hợp lệ hoặc rỗng.');
    }

    // Verify DOCX ZIP signature (PK\x03\x04 or PK\x05\x06)
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new Error('File không đúng định dạng .docx hợp lệ (thiếu header zip).');
    }

    let rawText = '';
    let html = '';
    try {
      const [textRes, htmlRes] = await Promise.all([
        mammoth.extractRawText({ buffer }),
        mammoth.convertToHtml({ buffer }),
      ]);
      rawText = textRes.value || '';
      html = htmlRes.value || '';
    } catch (err) {
      throw new Error(`Không thể đọc file DOCX: ${err.message}`);
    }

    if (!rawText.trim() && !html.trim()) {
      throw new Error('File DOCX rỗng hoặc không chứa văn bản.');
    }

    // Check if the document contains Word tables with vocabulary columns
    if (html.includes('<table')) {
      const tableResult = this._parseHtmlTable(html, options);
      if (tableResult && tableResult.items.length > 0) {
        return tableResult;
      }
    }

    // Default to paragraph / sequential text parser
    return this.parseText(rawText, options);
  }

  /**
   * Parse raw text containing vocabulary entries into structured items.
   * @param {string} text - Raw string content
   * @param {Object} options - { defaultTopic, courseId, lessonId }
   */
  static parseText(text, options = {}) {
    const lines = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n');

    const items = [];
    const warnings = [];
    const discoveredTopics = new Set();

    let currentTopic = options.defaultTopic || '';
    let currentBlockLines = [];
    let currentItemMeta = null;

    // Regex to detect Day / Topic headers
    // e.g. "Day 10", "Day 1", "Chủ đề 5", "Topic 2: Marketing"
    const topicHeaderRegex = /^\s*(Day\s*\d+|Topic\s*\d+[^:]*|Chủ\s*đề\s*\d+[^:]*)\s*$/i;

    // Regex to detect numbered vocabulary entry
    // e.g. "1. fluctuate (v)", "23. deter (v)", "7. wear out (phrasal verb)", "4. mandate (n/v)"
    const wordEntryRegex = /^\s*(\d+)\s*[\.\:\)]\s*([a-zA-ZÀ-ỹ\s\/\-_']+?)(?:\s*\(([^)]+)\))?\s*$/;

    const finalizeCurrentItem = () => {
      if (!currentItemMeta) return;

      const parsed = this._parseItemBlock(
        currentItemMeta,
        currentBlockLines,
        currentTopic || options.defaultTopic || 'General'
      );

      if (parsed) {
        items.push(parsed);
      }
      currentBlockLines = [];
      currentItemMeta = null;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        if (currentItemMeta) {
          currentBlockLines.push('');
        }
        continue;
      }

      // Check if this line is a Topic/Day header
      const topicMatch = line.match(topicHeaderRegex);
      if (topicMatch) {
        finalizeCurrentItem();
        currentTopic = topicMatch[1].trim();
        currentTopic = currentTopic.replace(/^(day)\s*(\d+)$/i, (_, d, n) => `Day ${n}`);
        discoveredTopics.add(currentTopic);
        continue;
      }

      // Check if this line is a new numbered vocabulary word
      const wordMatch = line.match(wordEntryRegex);
      if (wordMatch) {
        finalizeCurrentItem();

        const orderNum = parseInt(wordMatch[1], 10);
        const rawWord = wordMatch[2].trim();
        let partOfSpeech = (wordMatch[3] || '').trim();

        currentItemMeta = {
          order: orderNum,
          word: rawWord,
          partOfSpeech,
          lineIndex: i + 1,
        };
        continue;
      }

      if (currentItemMeta) {
        currentBlockLines.push(line);
      } else {
        if (line.length > 0 && !topicMatch) {
          warnings.push(`Dòng ${i + 1} được bỏ qua: "${line.slice(0, 50)}"`);
        }
      }
    }

    finalizeCurrentItem();

    if (items.length === 0) {
      warnings.push('Không tìm thấy từ vựng nào khớp với cấu trúc đánh số (Ví dụ: "1. word (v)").');
    }

    // Assign sequential order if missing or duplicated
    const orderSet = new Set();
    items.forEach((item, index) => {
      if (!item.order || orderSet.has(item.order)) {
        item.order = index + 1;
      }
      orderSet.add(item.order);
    });

    const summary = {
      total: items.length,
      valid: items.filter(it => it.isValid).length,
      invalid: items.filter(it => !it.isValid).length,
    };

    return {
      items,
      summary,
      topics: Array.from(discoveredTopics),
      warnings,
    };
  }

  /**
   * Internal parser for a single vocabulary block.
   */
  static _parseItemBlock(meta, lines, topic) {
    const word = meta.word;
    let partOfSpeech = meta.partOfSpeech;
    const order = meta.order;

    let meaningLines = [];
    let exampleEnglish = '';
    let exampleVietnamese = '';
    let explanationLines = [];

    let state = 'MEANING';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Check sub-part of speech e.g. "(n):", "(v):"
      const posSubMatch = line.match(/^\(([a-zA-Z\s\/]+)\)\s*[:：]?\s*$/);
      if (posSubMatch) {
        if (!partOfSpeech) {
          partOfSpeech = posSubMatch[1];
        }
        meaningLines.push(line);
        state = 'MEANING';
        continue;
      }

      // Check "Nghĩa:"
      if (/^(nghĩa|meaning)\s*[:：]?\s*$/i.test(line)) {
        state = 'MEANING';
        continue;
      }

      // Check "Ví dụ:"
      if (/^(ví dụ|example|vd)\s*[:：]?\s*$/i.test(line)) {
        state = 'EXAMPLE';
        continue;
      }

      // Check translation indicator "→", "->", "Dịch:"
      if (/^[→\->]\s*(.+)$/i.test(line) || /^dịch\s*[:：]\s*(.+)$/i.test(line)) {
        const transMatch = line.match(/^[→\->]\s*(.+)$/) || line.match(/^dịch\s*[:：]\s*(.+)$/i);
        if (transMatch) {
          exampleVietnamese = transMatch[1].trim();
          state = 'NOTES';
          continue;
        }
      }

      // Check notes / collocations
      const isCollocationOrNote =
        /^[•\-\*]?\s*[a-zA-ZÀ-ỹ\s\/\-_'.()]+\s*=\s*.+$/.test(line) ||
        /^[•\-\*]?\s*[a-zA-ZÀ-ỹ\s\/\-_'.()]+\s*\+\s*.+$/.test(line) ||
        /^[•\-\*]?\s*[a-zA-ZÀ-ỹ\s\/\-_'.()]+\s*[≈#]\s*.+$/.test(line) ||
        /^thường dùng với\s*[:：]?/i.test(line) ||
        /^lưu ý\s*[:：]?/i.test(line) ||
        /^khi\s+[a-zA-ZÀ-ỹ\s]+(?:là|,)/i.test(line) ||
        /mang tính trang trọng/i.test(line) ||
        /thường gặp trong/i.test(line) ||
        /không thường dùng/i.test(line);

      if (state === 'EXAMPLE') {
        if (!exampleEnglish) {
          if (isCollocationOrNote) {
            explanationLines.push(line);
          } else {
            exampleEnglish = line;
          }
        } else if (!exampleVietnamese && line.startsWith('→')) {
          exampleVietnamese = line.replace(/^[→\->]\s*/, '').trim();
          state = 'NOTES';
        } else {
          if (line.startsWith('→')) {
            exampleVietnamese = line.replace(/^[→\->]\s*/, '').trim();
            state = 'NOTES';
          } else if (isCollocationOrNote) {
            explanationLines.push(line);
            state = 'NOTES';
          } else if (!exampleVietnamese) {
            exampleVietnamese = line;
            state = 'NOTES';
          } else {
            explanationLines.push(line);
          }
        }
        continue;
      }

      if (state === 'NOTES') {
        explanationLines.push(line);
        continue;
      }

      if (state === 'MEANING') {
        if (isCollocationOrNote) {
          explanationLines.push(line);
        } else {
          meaningLines.push(line);
        }
        continue;
      }
    }

    const meaning = meaningLines.join('\n').trim();
    const explanation = explanationLines.join('\n').trim();

    const validationErrors = [];
    if (!word || !word.trim()) {
      validationErrors.push('Thiếu từ vựng tiếng Anh');
    }
    if (!meaning || !meaning.trim()) {
      validationErrors.push('Thiếu nghĩa tiếng Việt');
    }

    return {
      order,
      word: word.trim(),
      partOfSpeech: (partOfSpeech || '').trim(),
      meaning,
      exampleEnglish: exampleEnglish.trim(),
      exampleVietnamese: exampleVietnamese.trim(),
      explanation,
      topic: topic || 'General',
      status: 'published',
      isValid: validationErrors.length === 0,
      validationErrors,
    };
  }

  /**
   * Helper to parse DOCX tables if vocabulary is structured in a table.
   */
  static _parseHtmlTable(html, options) {
    const items = [];
    const discoveredTopics = new Set();
    const warnings = [];

    // Extract all rows
    const rowMatches = html.match(/<tr[\s\S]*?<\/tr>/gi);
    if (!rowMatches || rowMatches.length < 2) return null;

    // Helper to strip HTML tags
    const cleanCell = (cellHtml) =>
      cellHtml
        .replace(/<br\s*[\/]?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();

    // Parse header row
    const firstRowCells = (rowMatches[0].match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(cleanCell);
    const colMap = {};

    firstRowCells.forEach((headerText, idx) => {
      const h = headerText.toLowerCase();
      if (/stt|no|order/i.test(h)) colMap.order = idx;
      else if (/từ vựng|word|vocab/i.test(h)) colMap.word = idx;
      else if (/từ loại|pos|part of speech/i.test(h)) colMap.partOfSpeech = idx;
      else if (/nghĩa|meaning|định nghĩa/i.test(h)) colMap.meaning = idx;
      else if (/ví dụ en|example|ví dụ tiếng anh/i.test(h)) colMap.exampleEnglish = idx;
      else if (/dịch ví dụ|vi example|dịch/i.test(h)) colMap.exampleVietnamese = idx;
      else if (/ghi chú|lưu ý|explanation|note/i.test(h)) colMap.explanation = idx;
      else if (/day|chủ đề|topic/i.test(h)) colMap.topic = idx;
    });

    // Check if table contains at least "word" and "meaning" columns
    if (colMap.word === undefined || colMap.meaning === undefined) {
      return null;
    }

    let defaultTopic = options.defaultTopic || 'General';

    for (let r = 1; r < rowMatches.length; r++) {
      const cells = (rowMatches[r].match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(cleanCell);
      if (cells.length === 0) continue;

      const rawWord = colMap.word !== undefined ? cells[colMap.word] : '';
      const rawMeaning = colMap.meaning !== undefined ? cells[colMap.meaning] : '';

      if (!rawWord && !rawMeaning) continue;

      let word = rawWord;
      let pos = colMap.partOfSpeech !== undefined ? cells[colMap.partOfSpeech] : '';

      // Check if word has (v), (n) inside its cell
      const wMatch = word.match(/^([a-zA-ZÀ-ỹ\s\/\-_']+?)(?:\s*\(([^)]+)\))?$/);
      if (wMatch) {
        word = wMatch[1].trim();
        if (!pos && wMatch[2]) pos = wMatch[2].trim();
      }

      const topicVal = colMap.topic !== undefined ? cells[colMap.topic] : defaultTopic;
      if (topicVal) discoveredTopics.add(topicVal);

      const orderVal = colMap.order !== undefined ? parseInt(cells[colMap.order], 10) : r;

      const validationErrors = [];
      if (!word) validationErrors.push('Thiếu từ vựng tiếng Anh');
      if (!rawMeaning) validationErrors.push('Thiếu nghĩa tiếng Việt');

      items.push({
        order: isNaN(orderVal) ? r : orderVal,
        word,
        partOfSpeech: pos,
        meaning: rawMeaning,
        exampleEnglish: colMap.exampleEnglish !== undefined ? cells[colMap.exampleEnglish] : '',
        exampleVietnamese: colMap.exampleVietnamese !== undefined ? cells[colMap.exampleVietnamese] : '',
        explanation: colMap.explanation !== undefined ? cells[colMap.explanation] : '',
        topic: topicVal || defaultTopic,
        status: 'published',
        isValid: validationErrors.length === 0,
        validationErrors,
      });
    }

    if (items.length === 0) return null;

    return {
      items,
      summary: {
        total: items.length,
        valid: items.filter(i => i.isValid).length,
        invalid: items.filter(i => !i.isValid).length,
      },
      topics: Array.from(discoveredTopics),
      warnings,
    };
  }
}

export default DocxVocabularyParser;
