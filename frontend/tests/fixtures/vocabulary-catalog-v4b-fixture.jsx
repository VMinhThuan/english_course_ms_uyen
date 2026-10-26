import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import StudentLayout from '../../src/components/layouts/StudentLayout.jsx';
import StudentVocabularyCatalogPage from '../../src/features/vocabulary-catalog/StudentVocabularyCatalogPage.jsx';
import FlashcardPage from '../../src/pages/FlashcardPage.jsx';
import '../../src/index.css';
import '../../src/styles/design-system.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/student" element={<StudentLayout />}>
          <Route path="vocabulary-catalog" element={<StudentVocabularyCatalogPage />} />
          <Route path="flashcards" element={<FlashcardPage />} />
          <Route index element={<Navigate to="/student/vocabulary-catalog" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/student/vocabulary-catalog" replace />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);
