import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminLayout from '../../src/components/layouts/AdminLayout.jsx';
import VocabularyPublicationWorkspace from '../../src/features/vocabulary-catalog/VocabularyPublicationWorkspace.jsx';
import { createVocabularyCatalogApi } from '../../src/features/vocabulary-catalog/api.js';
import { createVocabularyPublicationApi } from '../../src/features/vocabulary-catalog/publicationApi.js';
import '../../src/index.css';
import '../../src/styles/design-system.css';

const catalogBaseUrl = window.__VOCAB_CATALOG_API_BASE__ || '/mock/admin/vocabulary-catalog';
const importBaseUrl = window.__VOCAB_IMPORT_API_BASE__ || '/mock/admin/vocabulary-import-batches';
const publicationBaseUrl = window.__VOCAB_PUBLICATION_API_BASE__ || '/mock/admin/vocabulary-publication';
const getHeaders = () => window.__VOCAB_ADMIN_HEADERS__ || {};
const catalogApi = createVocabularyCatalogApi({ catalogBaseUrl, importBaseUrl, getHeaders });
const publicationApi = createVocabularyPublicationApi({ baseUrl: publicationBaseUrl, getHeaders });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MemoryRouter initialEntries={['/admin/vocabulary-publication-v5a']}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="vocabulary-publication-v5a" element={<VocabularyPublicationWorkspace catalogApi={catalogApi} publicationApi={publicationApi} />} />
        </Route>
      </Routes>
    </MemoryRouter>
  </React.StrictMode>,
);
