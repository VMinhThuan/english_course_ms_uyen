import fs from 'node:fs/promises';
import path from 'node:path';
import {
  REPOSITORY_ROOT,
  SOURCE_FIELD_GOLDENS,
  buildCoverageRows,
  coverageCsv,
  loadSourceAcceptance,
} from './helpers/vocabularyParserV2SourceOracle.js';

const acceptance = await loadSourceAcceptance({});
const coverageRows = buildCoverageRows(acceptance);
const total = key => coverageRows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
const folderCounts = Object.fromEntries(
  ['TOEIC EASY START', 'TOEIC MUST-KNOW VOCABULARY', 'TOEIC ESSENTIAL COLLOCATION'].map(folder => [
    folder,
    acceptance.result.items.filter(item => item.source.sourceFolder === folder).length,
  ]),
);

const problems = [];
if (acceptance.directFolders.length !== 3) problems.push(`Expected 3 source folders; found ${acceptance.directFolders.length}.`);
if (acceptance.allFiles.length !== 30 || acceptance.files.length !== 30) problems.push(`Expected exactly 30 DOCX-only source files; found ${acceptance.allFiles.length} total / ${acceptance.files.length} DOCX.`);
if (acceptance.references.length !== 711) problems.push(`Expected 711 independent locator rows; found ${acceptance.references.length}.`);
if (acceptance.manifest.length !== 30) problems.push(`Expected 30 hash manifest rows; found ${acceptance.manifest.length}.`);
if (folderCounts['TOEIC EASY START'] !== 243) problems.push(`Easy Start count mismatch: ${folderCounts['TOEIC EASY START']}.`);
if (folderCounts['TOEIC MUST-KNOW VOCABULARY'] !== 294) problems.push(`Must-Know count mismatch: ${folderCounts['TOEIC MUST-KNOW VOCABULARY']}.`);
if (folderCounts['TOEIC ESSENTIAL COLLOCATION'] !== 174) problems.push(`Essential Collocation count mismatch: ${folderCounts['TOEIC ESSENTIAL COLLOCATION']}.`);
if (total('missing') !== 0 || total('extra') !== 0) problems.push(`Entry accounting mismatch: ${total('missing')} missing, ${total('extra')} extra.`);
if (total('source_reference_mismatch') !== 0) problems.push(`Independent source locator/word/POS/order mismatch rows: ${total('source_reference_mismatch')}.`);
if (total('source_locator_covered') !== 711) problems.push(`Source locator coverage mismatch: ${total('source_locator_covered')}/711.`);
if (coverageRows.some(row => !row.source_sha256_match || !row.package_xml_relationship_validation)) problems.push('A source hash or OOXML package validation did not pass.');
if (total('exact_field_correct_independent') !== SOURCE_FIELD_GOLDENS.length) problems.push(`Independent field goldens passed ${total('exact_field_correct_independent')}/${SOURCE_FIELD_GOLDENS.length}.`);
if (acceptance.result.duplicateGroups.length !== 14 || acceptance.result.summary.duplicateOccurrences !== 29) problems.push('Duplicate group/occurrence count did not match 14/29.');

const outputPath = path.join(REPOSITORY_ROOT, 'docs/vocabulary/phase2/PARSER_COVERAGE_RESULTS.csv');
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, coverageCsv(coverageRows), 'utf8');

const output = {
  sourceRoot: acceptance.root,
  referenceCsv: acceptance.referencePath,
  manifestCsv: acceptance.manifestPath,
  sourceFolders: acceptance.directFolders.sort(),
  sourceFiles: acceptance.files.length,
  totalSourceFiles: acceptance.allFiles.length,
  sourceEntries: total('source_entry_count_reference'),
  detected: total('parser_detected'),
  missing: total('missing'),
  extra: total('extra'),
  independentWordPosOrderMatches: total('word_pos_order_matches'),
  sourceLocatorsCovered: total('source_locator_covered'),
  sha256Matches: coverageRows.filter(row => row.source_sha256_match).length,
  packageValidationsPassed: coverageRows.filter(row => row.package_xml_relationship_validation).length,
  independentlyVerifiedFullFieldGoldens: `${total('exact_field_correct_independent')}/${SOURCE_FIELD_GOLDENS.length}`,
  remainingEntriesNeedingFieldReview: total('unreviewed_field_rows'),
  candidatesMarkedNeedsReview: total('needs_review'),
  parserIssues: total('parser_issues'),
  folderCounts,
  duplicateGroups: acceptance.result.duplicateGroups.length,
  duplicateOccurrences: acceptance.result.summary.duplicateOccurrences,
  duplicateClassifications: Object.fromEntries(
    [...new Set(acceptance.result.duplicateGroups.map(group => group.classification))].map(classification => [
      classification,
      acceptance.result.duplicateGroups.filter(group => group.classification === classification).length,
    ]),
  ),
  coverageCsv: path.relative(REPOSITORY_ROOT, outputPath).split(path.sep).join('/'),
  problems,
};
console.log(JSON.stringify(output, null, 2));
if (problems.length) process.exitCode = 1;
