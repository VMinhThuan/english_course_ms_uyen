import { vocabularyApi } from '../api/vocabularyApi.js';

const PAGE_SIZE = 100;

export async function loadAllStudentVocabulary(filters = {}) {
  const firstResponse = await vocabularyApi.getStudentVocabulary({
    ...filters,
    page: 1,
    limit: PAGE_SIZE,
    sort: 'word_asc',
  });
  const firstPage = firstResponse.data || {};
  const pageCount = Math.max(1, Number(firstPage.pagination?.pages) || 1);
  const pages = [firstPage.vocabulary || []];

  for (let firstPageNumber = 2; firstPageNumber <= pageCount; firstPageNumber += 5) {
    const pageNumbers = Array.from(
      { length: Math.min(5, pageCount - firstPageNumber + 1) },
      (_, index) => firstPageNumber + index,
    );
    const responses = await Promise.all(pageNumbers.map((page) =>
      vocabularyApi.getStudentVocabulary({ ...filters, page, limit: PAGE_SIZE, sort: 'word_asc' }),
    ));
    pages.push(...responses.map((response) => response.data?.vocabulary || []));
  }

  return pages.flat();
}
