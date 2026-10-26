import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminLayout from '../../src/components/layouts/AdminLayout.jsx';
import VocabularyImportWorkspace from '../../src/features/vocabulary-import/VocabularyImportWorkspace.jsx';
import { createVocabularyImportApi } from '../../src/features/vocabulary-import/api.js';
import '../../src/index.css';
import '../../src/styles/design-system.css';

const api = createVocabularyImportApi({
  baseUrl: window.__VOCAB_IMPORT_API_BASE__ || '/mock/admin/vocabulary-import-batches',
  getHeaders: () => window.__VOCAB_IMPORT_HEADERS__ || {},
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MemoryRouter initialEntries={['/admin/vocabulary-import-v3b']}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="vocabulary-import-v3b" element={<VocabularyImportWorkspace api={api} />} />
        </Route>
      </Routes>
    </MemoryRouter>
  </React.StrictMode>,
);
