const VISIBLE_STATUS = 'published';
const sameId = (left, right) => left !== null && left !== undefined && right !== null && right !== undefined
  && String(left) === String(right);

/**
 * Phase V4A proposal only. This function has no database or route side effects.
 * A Candidate review decision is an independent editorial gate; Catalog status
 * alone never makes a Student-facing row eligible.
 */
export function evaluateVocabularyPublicationEligibility({ tag, chapter, vocabulary, membership, reviewStatus } = {}) {
  const blockers = [];
  const membershipChapterMatches = Boolean(membership && chapter && sameId(membership.chapterId, chapter._id));
  const membershipVocabularyMatches = Boolean(membership && vocabulary && sameId(membership.vocabularyId, vocabulary._id));
  const states = {
    tag: tag?.status || 'missing',
    chapter: chapter?.status || 'missing',
    vocabulary: vocabulary?.catalogStatus || 'missing',
    membership: !membership ? 'missing' : membershipChapterMatches && membershipVocabularyMatches ? 'present' : 'mismatched',
    review: reviewStatus || 'not-reviewed',
  };
  if (!tag) blockers.push('TAG_MISSING');
  else if (tag.status === 'archived') blockers.push('TAG_ARCHIVED');
  else if (tag.status !== VISIBLE_STATUS) blockers.push('TAG_NOT_PUBLISHED');
  if (!chapter) blockers.push('CHAPTER_MISSING');
  else if (chapter.status === 'archived') blockers.push('CHAPTER_ARCHIVED');
  else if (chapter.status !== VISIBLE_STATUS) blockers.push('CHAPTER_NOT_PUBLISHED');
  if (tag && chapter && !sameId(chapter.tagId, tag._id)) blockers.push('CHAPTER_TAG_MISMATCH');
  if (!vocabulary || vocabulary.catalogOnly !== true) blockers.push('CATALOG_VOCABULARY_REQUIRED');
  else if (vocabulary.catalogStatus === 'archived') blockers.push('VOCABULARY_ARCHIVED');
  else if (vocabulary.catalogStatus !== VISIBLE_STATUS) blockers.push('VOCABULARY_NOT_PUBLISHED');
  if (!membership) blockers.push('CHAPTER_MEMBERSHIP_REQUIRED');
  else {
    if (!membershipChapterMatches) blockers.push('MEMBERSHIP_CHAPTER_MISMATCH');
    if (!membershipVocabularyMatches) blockers.push('MEMBERSHIP_VOCABULARY_MISMATCH');
  }
  if (reviewStatus !== 'REVIEW_APPROVED') blockers.push('EDITORIAL_REVIEW_REQUIRED');
  return {
    eligible: blockers.length === 0,
    status: blockers.length === 0 ? 'PUBLICATION_ELIGIBLE' : 'HIDDEN',
    states,
    blockers,
  };
}

export const VOCABULARY_PUBLICATION_CONTRACT = Object.freeze({
  policyStatus: 'PENDING_PO',
  studentCatalogApi: 'NOT_EXPOSED',
  transitions: Object.freeze({
    create: 'DRAFT',
    review: 'REVIEWED',
    publish: 'BLOCKED_PENDING_PO',
    archive: 'ARCHIVED_HIDDEN',
  }),
  eligibilityRequires: Object.freeze([
    'Tag.status === published',
    'Chapter.status === published and belongs to the selected Tag',
    'Vocabulary.catalogOnly === true and catalogStatus === published',
    'ChapterVocabulary membership links this Chapter to this Vocabulary',
    'Editorial reviewStatus === REVIEW_APPROVED',
  ]),
});
