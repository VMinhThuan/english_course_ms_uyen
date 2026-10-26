import { createHash } from 'node:crypto';
import path from 'node:path';
import yauzl from 'yauzl';
import { DOMParser } from '@xmldom/xmldom';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const PARSER_VERSION = '2.1.0';
const DEFAULT_LIMITS = Object.freeze({
  maxInputBytes: 20 * 1024 * 1024,
  maxEntryBytes: 16 * 1024 * 1024,
  maxXmlPartBytes: 8 * 1024 * 1024,
  maxTotalUncompressedBytes: 64 * 1024 * 1024,
  maxEntries: 2000,
  maxCompressionRatio: 1000,
});

const REQUIRED_PARTS = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'];
const VIAC_DIACRITIC = /[\u0102\u0103\u0110\u0111\u0128\u0129\u0168\u0169\u01a0\u01a1\u01af\u01b0\u1ea0-\u1ef9]/i;
const ARROW = /→|⇒|->|=>/u;

function parserError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function localName(node) {
  return node?.localName || node?.nodeName?.split(':').pop() || '';
}

function childElements(node, name = null, namespace = WORD_NS) {
  if (!node?.childNodes) return [];
  const children = [];
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const child = node.childNodes[i];
    if (child.nodeType !== 1) continue;
    if (namespace && child.namespaceURI !== namespace) continue;
    if (name && localName(child) !== name) continue;
    children.push(child);
  }
  return children;
}

function firstChild(node, name, namespace = WORD_NS) {
  return childElements(node, name, namespace)[0] || null;
}

function attribute(node, name, namespace = WORD_NS) {
  if (!node?.getAttribute) return '';
  return node.getAttributeNS(namespace, name) || node.getAttribute(name) || '';
}

function textContent(node) {
  return node?.textContent || '';
}

function crc32Update(crc, chunk) {
  let value = crc;
  for (let i = 0; i < chunk.length; i += 1) {
    value = CRC32_TABLE[(value ^ chunk[i]) & 0xff] ^ (value >>> 8);
  }
  return value >>> 0;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function isSafeZipPath(name) {
  if (!name || name.startsWith('/') || name.startsWith('\\') || name.includes('\\')) return false;
  if (/^[a-z]:/i.test(name)) return false;
  const parts = name.split('/');
  return !parts.some(part => part === '..' || part === '.');
}

function isXmlPart(name) {
  return name.toLowerCase().endsWith('.xml') || name.toLowerCase().endsWith('.rels');
}

async function readZipParts(buffer, limits) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    throw parserError('INVALID_DOCX_BUFFER', 'DOCX input must be a non-empty Buffer.');
  }
  if (buffer.length > limits.maxInputBytes) {
    throw parserError('RESOURCE_LIMIT_INPUT_BYTES', `DOCX exceeds the ${limits.maxInputBytes} byte input limit.`);
  }

  const zipFile = await new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, {
      autoClose: true,
      decodeStrings: true,
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    }, (error, file) => error ? reject(parserError('INVALID_DOCX_ZIP', error.message)) : resolve(file));
  });

  const entryNames = new Set();
  const xmlParts = new Map();
  let entryCount = 0;
  let totalUncompressed = 0;

  await new Promise((resolve, reject) => {
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      try { zipFile.close(); } catch { /* already closed */ }
      reject(error);
    };

    zipFile.on('error', error => fail(parserError('INVALID_DOCX_ZIP', error.message)));
    zipFile.on('end', () => {
      if (settled) return;
      settled = true;
      resolve();
    });

    zipFile.on('entry', entry => {
      if (settled) return;
      entryCount += 1;
      if (entryCount > limits.maxEntries) {
        fail(parserError('RESOURCE_LIMIT_ENTRY_COUNT', `DOCX exceeds the ${limits.maxEntries} archive-entry limit.`));
        return;
      }

      const name = entry.fileName;
      if (!isSafeZipPath(name)) {
        fail(parserError('UNSAFE_ZIP_PATH', `Unsafe ZIP entry path: ${name}`));
        return;
      }
      if (entryNames.has(name)) {
        fail(parserError('DUPLICATE_ZIP_ENTRY', `Duplicate ZIP entry: ${name}`));
        return;
      }
      entryNames.add(name);

      if (entry.fileName.endsWith('/')) {
        zipFile.readEntry();
        return;
      }
      if ((entry.generalPurposeBitFlag & 1) !== 0) {
        fail(parserError('ENCRYPTED_DOCX_ENTRY', `Encrypted DOCX entry is not supported: ${name}`));
        return;
      }
      if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
        fail(parserError('UNSUPPORTED_COMPRESSION_METHOD', `Unsupported ZIP compression method for ${name}.`));
        return;
      }
      if (entry.uncompressedSize > limits.maxEntryBytes) {
        fail(parserError('RESOURCE_LIMIT_ENTRY_BYTES', `DOCX entry exceeds the ${limits.maxEntryBytes} byte limit: ${name}`));
        return;
      }
      const ratio = entry.uncompressedSize / Math.max(entry.compressedSize, 1);
      if (ratio > limits.maxCompressionRatio) {
        fail(parserError('RESOURCE_LIMIT_COMPRESSION_RATIO', `DOCX entry exceeds the ${limits.maxCompressionRatio}:1 compression ratio limit: ${name}`));
        return;
      }

      zipFile.openReadStream(entry, (streamError, stream) => {
        if (streamError) {
          fail(parserError('INVALID_DOCX_ZIP_ENTRY', `${name}: ${streamError.message}`));
          return;
        }
        const chunks = [];
        let size = 0;
        let crc = 0xffffffff;
        const keepXml = isXmlPart(name);
        stream.on('data', chunk => {
          if (settled) return;
          size += chunk.length;
          totalUncompressed += chunk.length;
          if (size > limits.maxEntryBytes || totalUncompressed > limits.maxTotalUncompressedBytes) {
            fail(parserError('RESOURCE_LIMIT_UNCOMPRESSED_BYTES', 'DOCX exceeds the configured uncompressed-byte limit.'));
            stream.destroy();
            return;
          }
          crc = crc32Update(crc, chunk);
          if (keepXml) chunks.push(chunk);
        });
        stream.on('error', error => fail(parserError('INVALID_DOCX_ZIP_ENTRY', `${name}: ${error.message}`)));
        stream.on('end', () => {
          if (settled) return;
          if (size !== entry.uncompressedSize) {
            fail(parserError('INVALID_DOCX_ZIP_ENTRY_SIZE', `Uncompressed size mismatch for ${name}.`));
            return;
          }
          if (((crc ^ 0xffffffff) >>> 0) !== entry.crc32) {
            fail(parserError('INVALID_DOCX_ZIP_CRC', `CRC-32 mismatch for ${name}.`));
            return;
          }
          if (keepXml) {
            if (size > limits.maxXmlPartBytes) {
              fail(parserError('RESOURCE_LIMIT_XML_BYTES', `XML part exceeds the ${limits.maxXmlPartBytes} byte limit: ${name}`));
              return;
            }
            xmlParts.set(name, Buffer.concat(chunks, size));
          }
          zipFile.readEntry();
        });
      });
    });

    zipFile.readEntry();
  });

  for (const requiredPart of REQUIRED_PARTS) {
    if (!entryNames.has(requiredPart) || !xmlParts.has(requiredPart)) {
      throw parserError('MISSING_REQUIRED_OOXML_PART', `DOCX is missing the required OOXML part ${requiredPart}.`);
    }
  }

  return { entryNames, xmlParts, entryCount, totalUncompressed };
}

function parseXmlPart(bytes, partName) {
  let xml;
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw parserError('INVALID_XML_ENCODING', `OOXML part is not valid UTF-8: ${partName}`);
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw parserError('UNSAFE_XML_DECLARATION', `DTD and entity declarations are not allowed in ${partName}.`);
  }

  const errors = [];
  const parser = new DOMParser({
    errorHandler: {
      warning: message => errors.push(String(message)),
      error: message => errors.push(String(message)),
      fatalError: message => errors.push(String(message)),
    },
  });
  const document = parser.parseFromString(xml, 'application/xml');
  if (errors.length || !document?.documentElement) {
    throw parserError('INVALID_OOXML_XML', `Could not parse ${partName}: ${errors[0] || 'missing document element'}`);
  }
  return document;
}

function relationshipSourcePart(relsPath) {
  if (relsPath === '_rels/.rels') return '';
  const marker = '/_rels/';
  const markerIndex = relsPath.lastIndexOf(marker);
  if (markerIndex < 0 || !relsPath.endsWith('.rels')) return null;
  const folder = relsPath.slice(0, markerIndex);
  const leaf = relsPath.slice(markerIndex + marker.length, -'.rels'.length);
  return folder ? `${folder}/${leaf}` : leaf;
}

function resolveRelationshipTarget(sourcePart, target) {
  let decoded;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    return null;
  }
  const pathOnly = decoded.split(/[?#]/, 1)[0];
  const joined = pathOnly.startsWith('/')
    ? pathOnly.slice(1)
    : path.posix.join(path.posix.dirname(sourcePart || '.'), pathOnly);
  const normalized = path.posix.normalize(joined).replace(/^\.\//, '');
  if (!normalized || normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/')) return null;
  return normalized;
}

function validateXmlAndRelationships(archive) {
  const parsedParts = new Map();
  for (const [name, bytes] of archive.xmlParts) parsedParts.set(name, parseXmlPart(bytes, name));

  const externalRelationships = [];
  for (const [relsName, document] of parsedParts) {
    if (!relsName.toLowerCase().endsWith('.rels')) continue;
    const sourcePart = relationshipSourcePart(relsName);
    if (sourcePart === null) continue;
    const relationships = document.getElementsByTagNameNS(PACKAGE_REL_NS, 'Relationship');
    for (let i = 0; i < relationships.length; i += 1) {
      const relation = relationships.item(i);
      const target = relation.getAttribute('Target') || '';
      const mode = relation.getAttribute('TargetMode') || '';
      if (mode.toLowerCase() === 'external' || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
        externalRelationships.push({ part: relsName, target });
        continue;
      }
      const resolved = resolveRelationshipTarget(sourcePart, target);
      if (!resolved || !archive.entryNames.has(resolved)) {
        throw parserError('BROKEN_INTERNAL_RELATIONSHIP', `Broken internal relationship in ${relsName}: ${target}`);
      }
    }
  }

  const document = parsedParts.get('word/document.xml');
  if (localName(document.documentElement) !== 'document' || document.documentElement.namespaceURI !== WORD_NS) {
    throw parserError('INVALID_MAIN_DOCUMENT', 'word/document.xml does not have a WordprocessingML document root.');
  }
  return { parsedParts, externalRelationships };
}

function readNumberingDefinition(numberingDocument) {
  const abstractLevels = new Map();
  const nums = new Map();
  if (!numberingDocument) return { abstractLevels, nums };

  const abstractNodes = numberingDocument.getElementsByTagNameNS(WORD_NS, 'abstractNum');
  for (let i = 0; i < abstractNodes.length; i += 1) {
    const abstract = abstractNodes.item(i);
    const abstractId = attribute(abstract, 'abstractNumId');
    for (const level of childElements(abstract, 'lvl')) {
      const ilvl = attribute(level, 'ilvl') || '0';
      const start = firstChild(level, 'start');
      const format = firstChild(level, 'numFmt');
      const label = firstChild(level, 'lvlText');
      abstractLevels.set(`${abstractId}:${ilvl}`, {
        start: Number(attribute(start, 'val') || 1),
        format: attribute(format, 'val') || 'decimal',
        label: attribute(label, 'val') || `%${Number(ilvl) + 1}.`,
      });
    }
  }

  const numNodes = numberingDocument.getElementsByTagNameNS(WORD_NS, 'num');
  for (let i = 0; i < numNodes.length; i += 1) {
    const num = numNodes.item(i);
    const numId = attribute(num, 'numId');
    const abstractId = attribute(firstChild(num, 'abstractNumId'), 'val');
    const overrides = new Map();
    for (const override of childElements(num, 'lvlOverride')) {
      const ilvl = attribute(override, 'ilvl') || '0';
      const startOverride = firstChild(override, 'startOverride');
      if (startOverride) overrides.set(ilvl, Number(attribute(startOverride, 'val') || 1));
    }
    nums.set(numId, { abstractId, overrides });
  }
  return { abstractLevels, nums };
}

function readStyleNumbering(stylesDocument) {
  const styles = new Map();
  if (!stylesDocument) return styles;
  const styleNodes = stylesDocument.getElementsByTagNameNS(WORD_NS, 'style');
  for (let i = 0; i < styleNodes.length; i += 1) {
    const style = styleNodes.item(i);
    const styleId = attribute(style, 'styleId');
    const basedOn = attribute(firstChild(style, 'basedOn'), 'val');
    const pPr = firstChild(style, 'pPr');
    const numPr = pPr && firstChild(pPr, 'numPr');
    styles.set(styleId, {
      basedOn,
      numId: attribute(numPr && firstChild(numPr, 'numId'), 'val'),
      ilvl: attribute(numPr && firstChild(numPr, 'ilvl'), 'val'),
    });
  }
  return styles;
}

function resolveParagraphNumbering(pPr, styleId, styles, definitions) {
  const numPr = pPr && firstChild(pPr, 'numPr');
  let numId = attribute(numPr && firstChild(numPr, 'numId'), 'val');
  let ilvl = attribute(numPr && firstChild(numPr, 'ilvl'), 'val');
  if (!numId && styleId) {
    const visited = new Set();
    let current = styleId;
    while (current && !visited.has(current)) {
      visited.add(current);
      const style = styles.get(current);
      if (!style) break;
      if (style.numId) {
        numId = style.numId;
        ilvl = style.ilvl || ilvl;
        break;
      }
      current = style.basedOn;
    }
  }
  if (!numId || numId === '0') return null;
  ilvl ||= '0';
  const num = definitions.nums.get(numId);
  const level = num && definitions.abstractLevels.get(`${num.abstractId}:${ilvl}`);
  return {
    numId,
    ilvl: Number(ilvl),
    start: num?.overrides.get(ilvl) ?? level?.start ?? 1,
    format: level?.format || 'decimal',
    label: level?.label || `%${Number(ilvl) + 1}.`,
  };
}

function toAlphabetic(value, uppercase = false) {
  let number = value;
  let output = '';
  while (number > 0) {
    number -= 1;
    output = String.fromCharCode((uppercase ? 65 : 97) + (number % 26)) + output;
    number = Math.floor(number / 26);
  }
  return output;
}

function toRoman(value) {
  const numerals = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let number = value;
  let output = '';
  for (const [amount, numeral] of numerals) {
    while (number >= amount) {
      output += numeral;
      number -= amount;
    }
  }
  return output;
}

function formatNumber(value, format) {
  if (format === 'lowerLetter') return toAlphabetic(value, false);
  if (format === 'upperLetter') return toAlphabetic(value, true);
  if (format === 'lowerRoman') return toRoman(value).toLowerCase();
  if (format === 'upperRoman') return toRoman(value);
  return String(value);
}

function collectRunText(run) {
  let text = '';
  const visit = node => {
    for (let i = 0; i < (node.childNodes?.length || 0); i += 1) {
      const child = node.childNodes[i];
      if (child.nodeType !== 1) continue;
      if (child.namespaceURI === WORD_NS && localName(child) === 'rPr') continue;
      if (child.namespaceURI === WORD_NS && localName(child) === 't') text += textContent(child);
      else if (child.namespaceURI === WORD_NS && ['br', 'cr'].includes(localName(child))) text += '\n';
      else if (child.namespaceURI === WORD_NS && localName(child) === 'tab') text += '\t';
      else if (child.namespaceURI === WORD_NS && localName(child) === 'noBreakHyphen') text += '\u2011';
      else if (child.namespaceURI === WORD_NS && localName(child) === 'softHyphen') text += '\u00ad';
      else if (child.namespaceURI === WORD_NS && localName(child) === 'delText') continue;
      else if (child.namespaceURI === WORD_NS && localName(child) === 'p') continue;
      else visit(child);
    }
  };
  visit(run);
  return text;
}

function truthyWordProperty(node) {
  if (!node) return false;
  const value = attribute(node, 'val');
  return !['0', 'false', 'off', 'none'].includes(value.toLowerCase());
}

function readRunFormatting(run) {
  const props = firstChild(run, 'rPr');
  if (!props) return {};
  const bold = firstChild(props, 'b');
  const italic = firstChild(props, 'i');
  const underline = firstChild(props, 'u');
  const color = firstChild(props, 'color');
  const highlight = firstChild(props, 'highlight');
  const size = firstChild(props, 'sz');
  const style = firstChild(props, 'rStyle');
  const vertAlign = firstChild(props, 'vertAlign');
  const formatting = {};
  if (bold) formatting.bold = truthyWordProperty(bold);
  if (italic) formatting.italic = truthyWordProperty(italic);
  if (underline) formatting.underline = attribute(underline, 'val') || 'single';
  if (color) formatting.color = attribute(color, 'val');
  if (highlight) formatting.highlight = attribute(highlight, 'val');
  if (size) formatting.fontSizeHalfPoints = Number(attribute(size, 'val')) || null;
  if (style) formatting.style = attribute(style, 'val');
  if (vertAlign) formatting.verticalAlign = attribute(vertAlign, 'val');
  return formatting;
}

function readParagraphRuns(paragraph) {
  const runs = [];
  const walk = node => {
    for (let i = 0; i < (node.childNodes?.length || 0); i += 1) {
      const child = node.childNodes[i];
      if (child.nodeType !== 1) continue;
      if (child.namespaceURI === WORD_NS && localName(child) === 'pPr') continue;
      if (child.namespaceURI === WORD_NS && localName(child) === 'del') continue;
      if (child.namespaceURI === WORD_NS && localName(child) === 'r') {
        const text = collectRunText(child);
        runs.push({ order: runs.length + 1, text, formatting: readRunFormatting(child) });
      } else if (child.namespaceURI === WORD_NS && localName(child) !== 'p') {
        walk(child);
      }
    }
  };
  walk(paragraph);
  return runs;
}

function paragraphNumberingData(paragraph) {
  const pPr = firstChild(paragraph, 'pPr');
  const pStyle = firstChild(pPr, 'pStyle');
  const numPr = firstChild(pPr, 'numPr');
  return {
    pPr,
    styleId: attribute(pStyle, 'val'),
    numId: attribute(numPr && firstChild(numPr, 'numId'), 'val'),
    ilvl: attribute(numPr && firstChild(numPr, 'ilvl'), 'val'),
  };
}

function extractParagraph(paragraph, locator, numberingContext) {
  const { pPr, styleId } = paragraphNumberingData(paragraph);
  const runs = readParagraphRuns(paragraph);
  const numbering = resolveParagraphNumbering(pPr, styleId, numberingContext.styles, numberingContext.definitions);
  return {
    paragraphIndex: locator.paragraphIndex,
    tableIndex: locator.tableIndex ?? null,
    rowIndex: locator.rowIndex ?? null,
    cellIndex: locator.cellIndex ?? null,
    styleId: styleId || null,
    numbering: numbering ? { ...numbering } : null,
    runs,
    text: runs.map(run => run.text).join(''),
  };
}

function walkDocumentParagraphs(body, numberingContext) {
  const paragraphs = [];
  let paragraphIndex = 0;
  let tableIndex = 0;

  const visitBlocks = (node, table = null) => {
    for (const child of childElements(node)) {
      const name = localName(child);
      if (name === 'p') {
        paragraphIndex += 1;
        paragraphs.push(extractParagraph(child, {
          paragraphIndex,
          tableIndex: table?.tableIndex,
          rowIndex: table?.rowIndex,
          cellIndex: table?.cellIndex,
        }, numberingContext));
      } else if (name === 'tbl') {
        tableIndex += 1;
        let rowIndex = 0;
        for (const row of childElements(child, 'tr')) {
          rowIndex += 1;
          let cellIndex = 0;
          for (const cell of childElements(row, 'tc')) {
            cellIndex += 1;
            visitBlocks(cell, { tableIndex, rowIndex, cellIndex });
          }
        }
      } else if (['sdt', 'sdtContent', 'customXml', 'ins'].includes(name)) {
        visitBlocks(child, table);
      }
    }
  };

  visitBlocks(body);

  const counters = new Map();
  for (const paragraph of paragraphs) {
    const numbering = paragraph.numbering;
    if (!numbering) continue;
    const list = counters.get(numbering.numId) || [];
    const level = numbering.ilvl;
    if (list[level] === undefined) list[level] = numbering.start - 1;
    list[level] += 1;
    for (let deeper = level + 1; deeper < list.length; deeper += 1) list[deeper] = undefined;
    const numberFor = n => list[n] ?? numbering.start;
    const displayLabel = numbering.label.replace(/%(\d+)/g, (_, levelNumber) => formatNumber(numberFor(Number(levelNumber) - 1), numbering.format));
    paragraph.numbering = {
      ...numbering,
      displayNumber: numbering.format === 'decimal' ? list[level] : null,
      displayLabel,
    };
    counters.set(numbering.numId, list);
  }
  return paragraphs;
}

function splitLines(text) {
  return String(text || '').replace(/\r\n?/g, '\n').split('\n');
}

function cleanWhitespace(text) {
  return String(text || '').replace(/\s+/gu, ' ').trim();
}

function normalizeMeaning(text) {
  return cleanWhitespace(text).normalize('NFC');
}

function normalizeWord(text) {
  return cleanWhitespace(text).normalize('NFKC').toLocaleLowerCase('vi');
}

function canonicalPos(label) {
  const normalized = cleanWhitespace(label).toLowerCase().replace(/[()]/g, '');
  const aliases = {
    n: 'noun', noun: 'noun', nouns: 'noun',
    v: 'verb', verb: 'verb', verbs: 'verb',
    adj: 'adjective', adjective: 'adjective', adjectives: 'adjective',
    adv: 'adverb', adverb: 'adverb', adverbial: 'adverb',
    prep: 'preposition', preposition: 'preposition',
  };
  return aliases[normalized] || normalized;
}

function parsePosList(raw) {
  return [...new Set(String(raw || '')
    .split(/[\/,;]/)
    .map(part => canonicalPos(part))
    .filter(Boolean))];
}

function splitArrow(line) {
  const match = ARROW.exec(line);
  if (!match) return null;
  return {
    english: line.slice(0, match.index).trim(),
    vietnamese: line.slice(match.index + match[0].length).trim(),
  };
}

function isVietnameseLine(line) {
  return VIAC_DIACRITIC.test(line);
}

function sourceLines(paragraph) {
  return splitLines(paragraph.text).map(text => text.trim()).filter(Boolean);
}

function normalizeGroupName(sourceFolder) {
  const value = String(sourceFolder || '').trim().toLocaleLowerCase('en');
  if (value === 'toeic easy start') return 'easy-start';
  if (value === 'toeic must-know vocabulary') return 'must-know';
  if (value === 'toeic essential collocation') return 'essential-collocation';
  return '';
}

function inferSourceMetadata(metadata = {}) {
  const relativePath = String(metadata.relativePath || metadata.sourcePath || '').replace(/\\/g, '/');
  const fileName = metadata.fileName || metadata.filename || (relativePath ? relativePath.split('/').pop() : 'source.docx');
  const inferredFolder = relativePath.includes('/') ? relativePath.split('/')[0] : '';
  const sourceFolder = metadata.sourceFolder || inferredFolder || '';
  const stem = fileName.replace(/\.docx$/i, '');
  let group = normalizeGroupName(sourceFolder);
  if (!group) {
    if (/^start\s+\d+$/i.test(stem)) group = 'easy-start';
    else if (/^day\s+\d+$/i.test(stem)) group = 'must-know';
    else if (/^chap(?:ter|er)\s+\d+$/i.test(stem)) group = 'essential-collocation';
  }
  const sourcePath = relativePath || [sourceFolder, fileName].filter(Boolean).join('/');
  return { fileName, sourceFolder, relativePath: sourcePath, chapterCandidate: stem, group };
}

function makeSense(partOfSpeech = [], rawPartOfSpeech = '') {
  return {
    partOfSpeech: [...partOfSpeech],
    rawPartOfSpeech,
    usagePattern: '',
    meaning: '',
    normalizedMeaning: '',
    examples: [],
    notes: [],
    sourceLocators: [],
    _meaningParts: [],
  };
}

function attachParagraph(sense, paragraph) {
  if (paragraph && !sense.sourceLocators.some(locator => locator.paragraphIndex === paragraph.paragraphIndex)) {
    sense.sourceLocators.push({
      paragraphIndex: paragraph.paragraphIndex,
      tableIndex: paragraph.tableIndex,
      rowIndex: paragraph.rowIndex,
      cellIndex: paragraph.cellIndex,
    });
  }
}

function addMeaning(sense, text, paragraph) {
  const value = String(text || '').trim();
  if (!value) return;
  sense._meaningParts.push(value);
  attachParagraph(sense, paragraph);
}

function addNote(sense, text, paragraph) {
  const value = String(text || '').trim();
  if (!value) return;
  sense.notes.push({
    text: value,
    paragraphIndex: paragraph?.paragraphIndex ?? null,
    tableIndex: paragraph?.tableIndex ?? null,
    rowIndex: paragraph?.rowIndex ?? null,
    cellIndex: paragraph?.cellIndex ?? null,
  });
  attachParagraph(sense, paragraph);
}

function addExample(sense, english, vietnamese, paragraph, issues, field = 'examples') {
  const cleanEnglish = String(english || '').trim();
  const cleanVietnamese = String(vietnamese || '').trim();
  if (!cleanEnglish && !cleanVietnamese) return;
  sense.examples.push({
    english: cleanEnglish,
    vietnamese: cleanVietnamese,
    sourceLocator: {
      paragraphIndex: paragraph?.paragraphIndex ?? null,
      tableIndex: paragraph?.tableIndex ?? null,
      rowIndex: paragraph?.rowIndex ?? null,
      cellIndex: paragraph?.cellIndex ?? null,
    },
  });
  attachParagraph(sense, paragraph);
  if (!cleanEnglish || !cleanVietnamese) {
    issues.push({
      code: 'EXAMPLE_PAIR_INCOMPLETE',
      field,
      severity: 'review',
      sourceLocator: { paragraphIndex: paragraph?.paragraphIndex ?? null },
      detail: 'The source did not provide an unambiguous English/Vietnamese pair.',
    });
  }
}

function finalizeSense(sense) {
  sense.meaning = sense._meaningParts.join('\n').trim();
  sense.normalizedMeaning = normalizeMeaning(sense.meaning);
  delete sense._meaningParts;
  return sense;
}

function makeCandidate({ metadata, fileSha256, layout, sourceOrdinal, sourceDisplayNumber, sourceDisplayLabel, paragraphs, word, rawWord, rawPartOfSpeech, senses, issues, topicCandidate = null }) {
  const first = paragraphs[0];
  const last = [...paragraphs].reverse().find(paragraph => paragraph.text.trim()) || first;
  const finalizedSenses = senses.map(finalizeSense);
  const topPos = [...new Set([
    ...parsePosList(rawPartOfSpeech),
    ...finalizedSenses.flatMap(sense => sense.partOfSpeech),
  ])];
  const rawText = paragraphs.map(paragraph => paragraph.text).join('\n');
  const source = {
    fileName: metadata.fileName,
    fileSha256,
    sourceFolder: metadata.sourceFolder || null,
    relativePath: metadata.relativePath,
    parserVersion: PARSER_VERSION,
    layout,
    sourceOrdinal,
    sourceDisplayNumber: sourceDisplayNumber ?? null,
    sourceDisplayLabel: sourceDisplayLabel || null,
    paragraphStart: first?.paragraphIndex ?? null,
    paragraphEnd: last?.paragraphIndex ?? null,
    tableIndex: first?.tableIndex ?? null,
    rowIndex: first?.rowIndex ?? null,
    cellIndex: first?.cellIndex ?? null,
    chapterCandidate: metadata.chapterCandidate || null,
    collectionCandidate: metadata.sourceFolder || null,
    topicCandidate,
  };
  return {
    source,
    word: String(word || '').trim(),
    partOfSpeech: topPos,
    rawPartOfSpeech: String(rawPartOfSpeech || '').trim(),
    senses: finalizedSenses,
    notes: finalizedSenses.flatMap(sense => sense.notes),
    raw: {
      word: String(rawWord || ''),
      partOfSpeech: String(rawPartOfSpeech || ''),
      text: rawText,
      paragraphs: paragraphs.map(paragraph => ({
        paragraphIndex: paragraph.paragraphIndex,
        tableIndex: paragraph.tableIndex,
        rowIndex: paragraph.rowIndex,
        cellIndex: paragraph.cellIndex,
        styleId: paragraph.styleId,
        numbering: paragraph.numbering,
        text: paragraph.text,
        runs: paragraph.runs.map(run => ({ ...run, formatting: { ...run.formatting } })),
      })),
    },
    normalized: {
      word: normalizeWord(word),
      senses: finalizedSenses.map(sense => ({
        partOfSpeech: [...sense.partOfSpeech],
        meaning: sense.normalizedMeaning,
        examples: sense.examples.map(example => ({
          english: normalizeMeaning(example.english),
          vietnamese: normalizeMeaning(example.vietnamese),
        })),
      })),
    },
    reviewStatus: 'NEEDS_REVIEW',
    reviewReasons: [{
      code: 'SOURCE_CANDIDATE_NOT_HUMAN_VERIFIED',
      detail: 'Parser output is unapproved source material and must be reviewed before import.',
    }],
    issues,
    duplicateCandidate: null,
  };
}

function parseEasyStart(paragraphs, metadata, fileSha256) {
  const items = [];
  const warnings = [];
  const headerRegex = /^(.+?)\s*\(([^()]*)\)\s*[:：]\s*(.*)$/u;
  for (const paragraph of paragraphs) {
    if (paragraph.tableIndex !== null) continue;
    const lines = sourceLines(paragraph);
    if (!lines.length) continue;
    const match = lines[0].match(headerRegex);
    if (!match) continue;

    const issues = [];
    const rawWord = match[1];
    const rawPos = match[2];
    const meaning = match[3].trim();
    const sense = makeSense(parsePosList(rawPos), rawPos);
    addMeaning(sense, meaning, paragraph);
    const exampleLines = lines.slice(1);
    for (let index = 0; index < exampleLines.length; index += 2) {
      const english = exampleLines[index] || '';
      const vietnamese = exampleLines[index + 1] || '';
      addExample(sense, english, vietnamese, paragraph, issues, 'examples');
      if (!vietnamese) break;
    }
    if (!rawPos.trim()) issues.push({ code: 'PART_OF_SPEECH_MISSING', field: 'partOfSpeech', severity: 'review', detail: 'No POS label was present in the source header.' });
    if (!meaning) issues.push({ code: 'MEANING_MISSING', field: 'meaning', severity: 'review', detail: 'No meaning text was present after the source colon.' });
    if (!paragraph.numbering?.displayNumber) issues.push({ code: 'WORD_NUMBERING_UNRESOLVED', field: 'sourceDisplayNumber', severity: 'review', detail: 'Automatic Word numbering could not be resolved.' });

    items.push(makeCandidate({
      metadata,
      fileSha256,
      layout: 'EASY_START_INLINE_NUMBERED_PARAGRAPH',
      sourceOrdinal: items.length + 1,
      sourceDisplayNumber: paragraph.numbering?.displayNumber ?? null,
      sourceDisplayLabel: paragraph.numbering?.displayLabel || null,
      paragraphs: [paragraph],
      word: rawWord,
      rawWord: lines[0].slice(0, lines[0].indexOf(':')),
      rawPartOfSpeech: rawPos,
      senses: [sense],
      issues,
    }));
  }
  if (!items.length) warnings.push('No Easy Start entries matched the inline numbered paragraph structure.');
  return { items, warnings };
}

function parseDayTopic(text) {
  const match = String(text || '').trim().match(/^Day\s*(\d+)\s*[:：]?\s*$/i);
  return match ? `Day ${Number(match[1])}` : null;
}

function parseMustKnowHeader(text) {
  const match = String(text || '').trim().match(/^(\d+)\s*[.):：]\s*(.+?)\s*\(([^()]*)\)\s*$/u);
  if (!match) return null;
  return { displayNumber: Number(match[1]), word: match[2].trim(), rawPos: match[3].trim(), displayLabel: match[1] };
}

function parsePosSubsection(line) {
  const match = String(line || '').trim().match(/^\((noun|verb|adjective|adverb|n|v|adj|adv|phrasal\s+verb|preposition|prep)\)\s*(.*)$/i);
  if (!match) return null;
  return { rawPos: match[1], tail: match[2].replace(/^[:：]\s*/u, '').trim() };
}

function isExplicitNote(line, mode = 'meaning') {
  if (/^(?:lưu ý|note|usage note|thường dùng với)\s*[:：]?/i.test(line.trim())) return true;
  return mode !== 'meaning' && (/(?:≠|≈|#)/u.test(line) || /^\s*[•*]\s*/u.test(line));
}

function isUsageReferenceLine(line) {
  const value = String(line || '').trim();
  if (!value) return false;
  if (/=\s*\S/u.test(value)) return true;
  if (/\+\s*(?:N(?:\/V)?|V|clause|cụm\s+N)\b/iu.test(value)) return true;
  return /\b(?:someone|somebody|something)\b/iu.test(value)
    && /\b(?:to|for|from|with|of|that|between|toward(?:s)?)\b/iu.test(value);
}

function parseMustKnowEntry(block, header, metadata, fileSha256, sourceOrdinal, topicCandidate) {
  const issues = [];
  const senses = [];
  let activeSense = null;
  let mode = 'meaning';
  let pendingEnglish = '';

  const ensureSense = () => {
    if (!activeSense) {
      activeSense = makeSense(parsePosList(header.rawPos), header.rawPos);
      senses.push(activeSense);
    }
    return activeSense;
  };

  const startSense = (rawPos, usagePattern, paragraph) => {
    activeSense = makeSense(parsePosList(rawPos), rawPos);
    if (usagePattern) activeSense.usagePattern = usagePattern;
    attachParagraph(activeSense, paragraph);
    senses.push(activeSense);
    mode = 'meaning';
    pendingEnglish = '';
  };

  for (const paragraph of block.slice(1)) {
    const paragraphLines = splitLines(paragraph.text);
    for (let lineIndex = 0; lineIndex < paragraphLines.length; lineIndex += 1) {
      const lineValue = paragraphLines[lineIndex];
      let line = lineValue.trim();
      if (!line) continue;

      const inlineMeaningLabel = line.match(/^(?:nghĩa|meaning)\s*[:：]\s*(.*)$/i);
      if (inlineMeaningLabel) {
        ensureSense();
        mode = 'meaning';
        if (inlineMeaningLabel[1].trim()) addMeaning(ensureSense(), inlineMeaningLabel[1], paragraph);
        continue;
      }
      if (/^(?:nghĩa|meaning)\s*[:：]?$/i.test(line)) {
        ensureSense();
        mode = 'meaning';
        continue;
      }
      const inlineExampleLabel = line.match(/^(?:ví dụ|example|vd)\s*[:：]\s*(.*)$/i);
      if (inlineExampleLabel) {
        ensureSense();
        mode = 'example';
        line = inlineExampleLabel[1].trim();
        if (!line) continue;
      } else if (/^(?:ví dụ|example|vd)\s*[:：]?$/i.test(line)) {
        ensureSense();
        mode = 'example';
        continue;
      }

      const posSubsection = parsePosSubsection(line);
      if (posSubsection) {
        startSense(posSubsection.rawPos, posSubsection.tail, paragraph);
        continue;
      }

      const sense = ensureSense();
      if (isExplicitNote(line, mode)) {
        addNote(sense, line, paragraph);
        mode = 'note';
        pendingEnglish = '';
        continue;
      }

      if (mode === 'meaning' && isUsageReferenceLine(line)) {
        addNote(sense, line, paragraph);
        mode = 'note';
        pendingEnglish = '';
        continue;
      }

      const arrowParts = splitArrow(line.replace(/^(?:dịch|translation)\s*[:：]\s*/i, ''));
      if (arrowParts) {
        const english = arrowParts.english || pendingEnglish;
        addExample(sense, english, arrowParts.vietnamese, paragraph, issues, 'examples');
        if (!arrowParts.english && !pendingEnglish) {
          issues.push({ code: 'TRANSLATION_WITHOUT_ENGLISH', field: 'examples', severity: 'review', sourceLocator: { paragraphIndex: paragraph.paragraphIndex }, detail: 'A translation arrow had no preceding English example.' });
        }
        pendingEnglish = '';
        mode = 'afterExample';
        continue;
      }

      const translationLabel = line.match(/^(?:dịch|translation)\s*[:：]\s*(.*)$/i);
      if (translationLabel) {
        if (pendingEnglish) addExample(sense, pendingEnglish, translationLabel[1], paragraph, issues, 'examples');
        else {
          addExample(sense, '', translationLabel[1], paragraph, issues, 'examples');
          issues.push({ code: 'TRANSLATION_WITHOUT_ENGLISH', field: 'examples', severity: 'review', sourceLocator: { paragraphIndex: paragraph.paragraphIndex }, detail: 'A translation label had no paired English example.' });
        }
        pendingEnglish = '';
        mode = 'afterExample';
        continue;
      }

      if (mode === 'example') {
        if (!pendingEnglish) pendingEnglish = line;
        else if (isVietnameseLine(line)) {
          addExample(sense, pendingEnglish, line, paragraph, issues, 'examples');
          pendingEnglish = '';
          mode = 'afterExample';
        } else {
          addExample(sense, pendingEnglish, '', paragraph, issues, 'examples');
          pendingEnglish = line;
          issues.push({ code: 'EXAMPLE_BOUNDARY_AMBIGUOUS', field: 'examples', severity: 'review', sourceLocator: { paragraphIndex: paragraph.paragraphIndex }, detail: 'Consecutive unlabeled example lines could not be paired safely.' });
        }
        continue;
      }

      if (mode === 'meaning' && paragraphLines[lineIndex + 1] && /^\s*(?:→|⇒|->|=>)/u.test(paragraphLines[lineIndex + 1])) {
        pendingEnglish = line;
        continue;
      }

      if (mode === 'afterExample' || mode === 'note') {
        addNote(sense, line, paragraph);
        mode = 'note';
        continue;
      }

      addMeaning(sense, line, paragraph);
    }
  }

  if (pendingEnglish) {
    addExample(ensureSense(), pendingEnglish, '', block.at(-1), issues, 'examples');
  }
  if (!senses.length) senses.push(makeSense(parsePosList(header.rawPos), header.rawPos));
  if (!senses.some(sense => sense._meaningParts.length)) {
    issues.push({ code: 'MEANING_MISSING', field: 'meaning', severity: 'review', detail: 'No meaning text was mapped into a sense.' });
  }
  if (!senses.some(sense => sense.examples.length)) {
    issues.push({ code: 'EXAMPLE_MISSING', field: 'examples', severity: 'review', detail: 'No example pair was mapped from the source block.' });
  }

  return makeCandidate({
    metadata,
    fileSha256,
    layout: 'MUST_KNOW_NUMBERED_SENSE_BLOCK',
    sourceOrdinal,
    sourceDisplayNumber: header.displayNumber,
    sourceDisplayLabel: String(header.displayNumber),
    paragraphs: block,
    word: header.word,
    rawWord: block[0].text,
    rawPartOfSpeech: header.rawPos,
    senses,
    issues,
    topicCandidate,
  });
}

function parseMustKnow(paragraphs, metadata, fileSha256) {
  const items = [];
  const warnings = [];
  let topicCandidate = null;
  let current = null;

  const finalize = () => {
    if (!current) return;
    const block = current.paragraphs;
    while (block.length > 1 && !block.at(-1).text.trim()) block.pop();
    items.push(parseMustKnowEntry(block, current.header, metadata, fileSha256, items.length + 1, current.topicCandidate));
    current = null;
  };

  for (const paragraph of paragraphs) {
    const text = paragraph.text.trim();
    const day = parseDayTopic(text);
    if (day) {
      finalize();
      topicCandidate = day;
      continue;
    }
    const header = parseMustKnowHeader(text);
    if (header) {
      finalize();
      current = { header, paragraphs: [paragraph], topicCandidate: topicCandidate || metadata.chapterCandidate };
    } else if (current) {
      current.paragraphs.push(paragraph);
    }
  }
  finalize();
  if (!items.length) warnings.push('No Must-Know entries matched the literal numbered headword structure.');
  return { items, warnings };
}

function parseCollocationHeader(line) {
  const text = String(line || '').trim();
  if (!text || /^(?:ví dụ|example|dịch|translation)\s*[:：]/i.test(text)) return null;
  if (/^chapter\s*\d+/i.test(text) || /^chaper\s*\d+/i.test(text)) return null;
  if (/^\d+\s*[.):]/.test(text)) return null;
  const separator = text.indexOf(':');
  if (separator < 1) return null;
  const word = text.slice(0, separator).trim();
  const meaning = text.slice(separator + 1).trim();
  if (!word || !meaning || word.length > 100 || /[.!?]$/.test(word)) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\s'’\-_/]+$/u.test(word)) return null;
  return { word, meaning };
}

function parseCollocationExamples(lines, sense, paragraph, issues) {
  let pendingEnglish = '';
  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;

    const exampleLabel = line.match(/^(?:ví dụ|example|examples|vd)\s*[:：]\s*(.*)$/i);
    const translationLabel = line.match(/^(?:dịch|translation|bản dịch)\s*[:：]\s*(.*)$/i);
    if (exampleLabel) line = exampleLabel[1].trim();
    else if (translationLabel) line = translationLabel[1].trim();

    if (translationLabel && pendingEnglish) {
      addExample(sense, pendingEnglish, line, paragraph, issues, 'examples');
      pendingEnglish = '';
      continue;
    }
    if (translationLabel && !pendingEnglish) {
      addExample(sense, '', line, paragraph, issues, 'examples');
      continue;
    }

    const arrow = splitArrow(line);
    if (arrow) {
      addExample(sense, arrow.english || pendingEnglish, arrow.vietnamese, paragraph, issues, 'examples');
      if (!arrow.english && !pendingEnglish) issues.push({ code: 'TRANSLATION_WITHOUT_ENGLISH', field: 'examples', severity: 'review', sourceLocator: { paragraphIndex: paragraph.paragraphIndex }, detail: 'A translation arrow had no paired English example.' });
      pendingEnglish = '';
      continue;
    }

    if (pendingEnglish && isVietnameseLine(line)) {
      addExample(sense, pendingEnglish, line, paragraph, issues, 'examples');
      pendingEnglish = '';
      continue;
    }
    if (isExplicitNote(line)) {
      addNote(sense, line, paragraph);
      continue;
    }
    if (!pendingEnglish) pendingEnglish = line;
    else {
      addExample(sense, pendingEnglish, '', paragraph, issues, 'examples');
      pendingEnglish = line;
      issues.push({ code: 'EXAMPLE_BOUNDARY_AMBIGUOUS', field: 'examples', severity: 'review', sourceLocator: { paragraphIndex: paragraph.paragraphIndex }, detail: 'Consecutive unlabeled lines could not be paired safely.' });
    }
  }
  if (pendingEnglish) addExample(sense, pendingEnglish, '', paragraph, issues, 'examples');
}

function parseCollocationBlock(block, header, metadata, fileSha256, sourceOrdinal) {
  const issues = [];
  const sense = makeSense([], '');
  addMeaning(sense, header.meaning, block[0]);
  parseCollocationExamples(splitLines(block[0].text).slice(1), sense, block[0], issues);
  for (const paragraph of block.slice(1)) {
    const lines = sourceLines(paragraph);
    if (!lines.length) continue;
    parseCollocationExamples(lines, sense, paragraph, issues);
  }
  if (!sense.examples.length) issues.push({ code: 'EXAMPLE_MISSING', field: 'examples', severity: 'review', detail: 'No example pair was mapped from the source block.' });
  if (!sense._meaningParts.length) issues.push({ code: 'MEANING_MISSING', field: 'meaning', severity: 'review', detail: 'No meaning text was mapped from the source header.' });
  return makeCandidate({
    metadata,
    fileSha256,
    layout: block[0].text.includes('\n') ? 'ESSENTIAL_COLLOCATION_INLINE' : 'ESSENTIAL_COLLOCATION_PARAGRAPH_BLOCK',
    sourceOrdinal,
    sourceDisplayNumber: null,
    sourceDisplayLabel: null,
    paragraphs: block,
    word: header.word,
    rawWord: splitLines(block[0].text)[0].split(':')[0],
    rawPartOfSpeech: '',
    senses: [sense],
    issues,
  });
}

function parseEssentialCollocations(paragraphs, metadata, fileSha256) {
  const items = [];
  const warnings = [];
  let current = null;
  const finalize = () => {
    if (!current) return;
    while (current.paragraphs.length > 1 && !current.paragraphs.at(-1).text.trim()) current.paragraphs.pop();
    items.push(parseCollocationBlock(current.paragraphs, current.header, metadata, fileSha256, items.length + 1));
    current = null;
  };

  for (const paragraph of paragraphs) {
    const lines = splitLines(paragraph.text);
    const header = parseCollocationHeader(lines.find(line => line.trim()) || '');
    if (header) {
      finalize();
      current = { header, paragraphs: [paragraph] };
    } else if (current) {
      current.paragraphs.push(paragraph);
    }
  }
  finalize();
  if (!items.length) warnings.push('No Essential Collocation entries matched the phrase/meaning structure.');
  return { items, warnings };
}

function summarize(items, warnings, archive) {
  const byLayout = {};
  let missingMeaning = 0;
  let missingEnglish = 0;
  let missingVietnamese = 0;
  let issueCount = 0;
  for (const item of items) {
    byLayout[item.source.layout] = (byLayout[item.source.layout] || 0) + 1;
    const senses = item.senses;
    if (!senses.some(sense => sense.meaning)) missingMeaning += 1;
    if (!senses.some(sense => sense.examples.some(example => example.english))) missingEnglish += 1;
    if (!senses.some(sense => sense.examples.some(example => example.vietnamese))) missingVietnamese += 1;
    issueCount += item.issues.length;
  }
  return {
    total: items.length,
    needsReview: items.filter(item => item.reviewStatus === 'NEEDS_REVIEW').length,
    exactFieldAccuracy: null,
    byLayout,
    missingMeaning,
    missingEnglish,
    missingVietnamese,
    issueCount,
    warnings: warnings.length,
    package: archive ? {
      entries: archive.entryCount,
      uncompressedBytes: archive.totalUncompressed,
    } : null,
  };
}

function knownDuplicateClassification(key, records) {
  if (key === 'release') {
    const signatures = new Set(records.map(record => normalizeMeaning(record.raw.text)));
    const chapters = new Set(records.map(record => record.source.relativePath));
    return signatures.size === 1 && chapters.size > 1 ? 'SAME_CONTENT_DIFFERENT_CHAPTER' : 'NEEDS_REVIEW';
  }
  if (['complimentary', 'extension', 'convey', 'access'].includes(key)) return 'SAME_HEADWORD_DIFFERENT_SENSE';
  return 'NEEDS_REVIEW';
}

export function annotateVocabularyDuplicateCandidates(items) {
  const groups = new Map();
  for (const item of items) {
    const key = normalizeWord(item.word);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const duplicateGroups = [];
  for (const [key, records] of groups) {
    if (records.length < 2) continue;
    const classification = knownDuplicateClassification(key, records);
    const groupId = `source-duplicate:${key.replace(/[^a-z0-9]+/g, '-')}`;
    const occurrencePaths = records.map(record => ({
      fileName: record.source.fileName,
      relativePath: record.source.relativePath,
      sourceOrdinal: record.source.sourceOrdinal,
      paragraphStart: record.source.paragraphStart,
      paragraphEnd: record.source.paragraphEnd,
    }));
    records.forEach((record, index) => {
      record.duplicateCandidate = {
        groupId,
        normalizedHeadword: key,
        classification,
        occurrenceOrdinal: index + 1,
        occurrenceCount: records.length,
        occurrences: occurrencePaths,
        merged: false,
      };
    });
    duplicateGroups.push({ groupId, headword: records[0].word, classification, occurrenceCount: records.length, occurrences: occurrencePaths });
  }
  return duplicateGroups;
}

export class DocxVocabularyParserV2 {
  static version = PARSER_VERSION;

  static async parseDocxBuffer(buffer, metadata = {}, options = {}) {
    const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
    const sourceMetadata = inferSourceMetadata(metadata);
    if (!sourceMetadata.group) {
      throw parserError('SOURCE_LAYOUT_UNKNOWN', 'Pass sourceFolder or a recognizable source filename to select a V2 layout strategy.');
    }
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
      throw parserError('INVALID_DOCX_BUFFER', 'DOCX input must be a non-empty Buffer.');
    }
    if (buffer.length > limits.maxInputBytes) {
      throw parserError('RESOURCE_LIMIT_INPUT_BYTES', `DOCX exceeds the ${limits.maxInputBytes} byte input limit.`);
    }
    const fileSha256 = createHash('sha256').update(buffer).digest('hex').toUpperCase();
    if (metadata.fileSha256 && String(metadata.fileSha256).toUpperCase() !== fileSha256) {
      throw parserError('SOURCE_HASH_MISMATCH', 'Provided source SHA-256 does not match the DOCX buffer.');
    }

    const archive = await readZipParts(buffer, limits);
    const { parsedParts, externalRelationships } = validateXmlAndRelationships(archive);
    const document = parsedParts.get('word/document.xml');
    const body = document.getElementsByTagNameNS(WORD_NS, 'body').item(0);
    if (!body) throw parserError('MISSING_DOCUMENT_BODY', 'word/document.xml is missing w:body.');

    const numberingContext = {
      definitions: readNumberingDefinition(parsedParts.get('word/numbering.xml')),
      styles: readStyleNumbering(parsedParts.get('word/styles.xml')),
    };
    const paragraphs = walkDocumentParagraphs(body, numberingContext);
    const layoutResult = sourceMetadata.group === 'easy-start'
      ? parseEasyStart(paragraphs, sourceMetadata, fileSha256)
      : sourceMetadata.group === 'must-know'
        ? parseMustKnow(paragraphs, sourceMetadata, fileSha256)
        : parseEssentialCollocations(paragraphs, sourceMetadata, fileSha256);

    const warnings = [...layoutResult.warnings];
    const tableCount = new Set(paragraphs.filter(paragraph => paragraph.tableIndex !== null).map(paragraph => paragraph.tableIndex)).size;
    if (tableCount) warnings.push(`DOCX contains ${tableCount} table(s); table-row semantics require source-specific review.`);
    if (externalRelationships.length) warnings.push(`DOCX contains ${externalRelationships.length} external relationship(s).`);
    for (const item of layoutResult.items) {
      if (externalRelationships.length) item.issues.push({ code: 'EXTERNAL_RELATIONSHIPS_PRESENT', field: 'source', severity: 'review', detail: 'The package contains external relationships.' });
      if (tableCount && item.source.tableIndex !== null) {
        item.issues.push({ code: 'TABLE_LAYOUT_REQUIRES_REVIEW', field: 'sourceLocator', severity: 'review', detail: 'This candidate is located in a Word table.' });
      }
    }

    const source = {
      fileName: sourceMetadata.fileName,
      fileSha256,
      sourceFolder: sourceMetadata.sourceFolder || null,
      relativePath: sourceMetadata.relativePath,
      parserVersion: PARSER_VERSION,
      layoutGroup: sourceMetadata.group,
      zipEntryCount: archive.entryCount,
      uncompressedBytes: archive.totalUncompressed,
      paragraphCount: paragraphs.length,
      tableCount,
      externalRelationshipCount: externalRelationships.length,
    };
    return {
      parserVersion: PARSER_VERSION,
      source,
      items: layoutResult.items,
      summary: summarize(layoutResult.items, warnings, archive),
      warnings,
    };
  }

  static async parseDocxFiles(files, options = {}) {
    if (!Array.isArray(files)) throw parserError('INVALID_BATCH_INPUT', 'DOCX batch input must be an array.');
    const documents = [];
    const items = [];
    for (const file of files) {
      if (!file || !Buffer.isBuffer(file.buffer)) throw parserError('INVALID_BATCH_FILE', 'Every DOCX batch item needs a Buffer.');
      const result = await this.parseDocxBuffer(file.buffer, file.source || file.metadata || {}, options);
      documents.push({ source: result.source, summary: result.summary, warnings: result.warnings });
      items.push(...result.items);
    }
    const duplicateGroups = annotateVocabularyDuplicateCandidates(items);
    return {
      parserVersion: PARSER_VERSION,
      documents,
      items,
      duplicateGroups,
      summary: {
        total: items.length,
        needsReview: items.filter(item => item.reviewStatus === 'NEEDS_REVIEW').length,
        duplicateGroups: duplicateGroups.length,
        duplicateOccurrences: duplicateGroups.reduce((sum, group) => sum + group.occurrenceCount, 0),
      },
    };
  }
}

export { DEFAULT_LIMITS as DOCX_V2_DEFAULT_LIMITS };
export default DocxVocabularyParserV2;
