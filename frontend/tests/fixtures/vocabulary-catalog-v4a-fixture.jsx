import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminLayout from '../../src/components/layouts/AdminLayout.jsx';
import VocabularyCatalogWorkspace from '../../src/features/vocabulary-catalog/VocabularyCatalogWorkspace.jsx';
import { createVocabularyCatalogApi } from '../../src/features/vocabulary-catalog/api.js';
import { createVocabularyImportApi } from '../../src/features/vocabulary-import/api.js';
import '../../src/index.css';
import '../../src/styles/design-system.css';

const catalogBaseUrl = window.__VOCAB_CATALOG_API_BASE__ || '/mock/admin/vocabulary-catalog';
const importBaseUrl = window.__VOCAB_IMPORT_API_BASE__ || '/mock/admin/vocabulary-import-batches';
const getHeaders = () => window.__VOCAB_CATALOG_HEADERS__ || {};
const catalogApi = createVocabularyCatalogApi({ catalogBaseUrl, importBaseUrl, getHeaders });
const importApi = createVocabularyImportApi({ baseUrl: importBaseUrl, getHeaders });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MemoryRouter initialEntries={['/admin/vocabulary-catalog-v4a']}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="vocabulary-catalog-v4a" element={<VocabularyCatalogWorkspace api={catalogApi} importApi={importApi} />} />
        </Route>
      </Routes>
    </MemoryRouter>
  </React.StrictMode>,
);
