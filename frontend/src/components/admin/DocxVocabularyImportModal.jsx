import { useState, useEffect, useMemo } from 'react';
import { vocabularyApi } from '../../api/vocabularyApi.js';
import { courseApi } from '../../api/courseApi.js';
import { lessonApi } from '../../api/lessonApi.js';
import './DocxVocabularyImportModal.css';

export default function DocxVocabularyImportModal({ isOpen, onClose, onSuccess }) {
  // Step: 1 (Upload/Input), 2 (Preview), 3 (Success Result)
  const [step, setStep] = useState(1);

  // Selection
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState('');

  // Input mode: 'file' | 'text'
  const [inputMode, setInputMode] = useState('file');
  const [file, setFile] = useState(null);
  const [rawText, setRawText] = useState('');

  // Preview Data
  const [previewData, setPreviewData] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedTopic, setSelectedTopic] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [duplicateAction, setDuplicateAction] = useState('skip');

  // Inline editing row
  const [editingIndex, setEditingIndex] = useState(null);
  const [editForm, setEditForm] = useState(null);

  // Status & Loaders
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  // Load courses on mount
  useEffect(() => {
    if (!isOpen) return;
    courseApi.getCourses()
      .then((res) => {
        const list = res.data?.courses || [];
        setCourses(list);
        if (list.length > 0 && !selectedCourseId) {
          setSelectedCourseId(list[0]._id);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Load lessons when course changes
  useEffect(() => {
    if (!selectedCourseId) {
      setLessons([]);
      setSelectedLessonId('');
      return;
    }
    lessonApi.getLessonsByCourse(selectedCourseId)
      .then((res) => {
        const list = res.data?.lessons || [];
        setLessons(list);
        if (list.length > 0) {
          setSelectedLessonId(list[0]._id);
        } else {
          setSelectedLessonId('');
        }
      })
      .catch(() => {
        setLessons([]);
        setSelectedLessonId('');
      });
  }, [selectedCourseId]);

  // File handler
  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.docx')) {
      setError('Vui lòng chọn file định dạng Microsoft Word (.docx).');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('Dung lượng file vượt quá giới hạn 10MB.');
      return;
    }

    setError('');
    setFile(selectedFile);
  };

  // Submit Step 1: Preview analysis
  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!selectedCourseId || !selectedLessonId) {
      setError('Vui lòng chọn Khóa học và Bài học đích.');
      return;
    }

    if (inputMode === 'file' && !file) {
      setError('Vui lòng chọn file Word (.docx) để phân tích.');
      return;
    }

    if (inputMode === 'text' && !rawText.trim()) {
      setError('Vui lòng dán nội dung văn bản từ vựng.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('courseId', selectedCourseId);
      formData.append('lessonId', selectedLessonId);

      if (inputMode === 'file' && file) {
        formData.append('file', file);
      } else {
        formData.append('rawText', rawText);
      }

      const res = await vocabularyApi.previewImportDocx(formData);
      const data = res.data;

      setPreviewData(data);
      const parsedItems = (data.items || []).map((it, idx) => ({
        ...it,
        _clientIdx: idx,
      }));
      setItems(parsedItems);

      // Default select all valid items
      const validIndices = new Set(
        parsedItems.filter((i) => i.isValid).map((i) => i._clientIdx)
      );
      setSelectedIds(validIndices);

      setStep(2);
    } catch (err) {
      setError(
        err.response?.data?.message || err.message || 'Không thể phân tích tài liệu.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Filter items by topic & search
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const matchTopic = selectedTopic === 'ALL' || it.topic === selectedTopic;
      const matchQuery =
        !searchQuery ||
        it.word.toLowerCase().includes(searchQuery.toLowerCase()) ||
        it.meaning.toLowerCase().includes(searchQuery.toLowerCase());
      return matchTopic && matchQuery;
    });
  }, [items, selectedTopic, searchQuery]);

  if (!isOpen) return null;

  // Select / Deselect All
  const handleToggleSelectAll = (e) => {
    if (e.target.checked) {
      const allFiltered = new Set(selectedIds);
      filteredItems.forEach((it) => {
        if (it.isValid) allFiltered.add(it._clientIdx);
      });
      setSelectedIds(allFiltered);
    } else {
      const remaining = new Set(selectedIds);
      filteredItems.forEach((it) => remaining.delete(it._clientIdx));
      setSelectedIds(remaining);
    }
  };

  const handleToggleItem = (clientIdx) => {
    const updated = new Set(selectedIds);
    if (updated.has(clientIdx)) {
      updated.delete(clientIdx);
    } else {
      updated.add(clientIdx);
    }
    setSelectedIds(updated);
  };

  // Delete item row from preview
  const handleDeleteRow = (clientIdx) => {
    setItems((prev) => prev.filter((i) => i._clientIdx !== clientIdx));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(clientIdx);
      return next;
    });
  };

  // Inline edit handlers
  const startEdit = (item) => {
    setEditingIndex(item._clientIdx);
    setEditForm({ ...item });
  };

  const saveEdit = () => {
    if (!editForm.word.trim() || !editForm.meaning.trim()) {
      setError('Từ vựng và Nghĩa không được để trống.');
      return;
    }
    setError('');
    setItems((prev) =>
      prev.map((it) =>
        it._clientIdx === editingIndex
          ? {
              ...editForm,
              isValid: true,
              validationErrors: [],
            }
          : it
      )
    );
    setEditingIndex(null);
    setEditForm(null);
  };

  // Step 2 Confirm Submit
  const handleConfirmImport = async () => {
    const itemsToImport = items.filter((it) => selectedIds.has(it._clientIdx));

    if (itemsToImport.length === 0) {
      setError('Vui lòng chọn ít nhất một từ vựng để import.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const payload = {
        courseId: selectedCourseId,
        lessonId: selectedLessonId,
        items: itemsToImport,
        duplicateAction,
      };

      const res = await vocabularyApi.confirmImportDocx(payload);
      setResult(res.data);
      setStep(3);

      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(
        err.response?.data?.message || err.message || 'Lỗi khi lưu từ vựng vào hệ thống.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setFile(null);
    setRawText('');
    setPreviewData(null);
    setItems([]);
    setSelectedIds(new Set());
    setError('');
    setResult(null);
  };

  return (
    <div className="admin-modal-backdrop">
      <div className="docx-import-modal">
        {/* Header */}
        <div className="docx-import-header">
          <div className="docx-import-title-group">
            <h2>Import từ vựng từ file Word (.docx)</h2>
            <p>Tự động bóc tách Day, từ loại, nghĩa, câu ví dụ và ghi chú ngữ pháp</p>
          </div>
          <button className="docx-import-close-btn" onClick={onClose} aria-label="Đóng">
            &times;
          </button>
        </div>

        {/* Step Indicator */}
        <div className="docx-import-steps">
          <div className={`docx-step-item ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
            <span className="docx-step-num">1</span>
            <span>Tải tài liệu</span>
          </div>
          <div className={`docx-step-item ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
            <span className="docx-step-num">2</span>
            <span>Kiểm tra &amp; Xem trước</span>
          </div>
          <div className={`docx-step-item ${step === 3 ? 'active completed' : ''}`}>
            <span className="docx-step-num">3</span>
            <span>Hoàn thành</span>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div style={{ margin: '16px 24px 0', padding: '12px 16px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#991b1b', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {/* Body Content */}
        <div className="docx-import-body">
          {/* STEP 1: UPLOAD */}
          {step === 1 && (
            <div>
              <div className="docx-upload-grid">
                <div className="docx-field">
                  <label>Khóa học đích *</label>
                  <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    required
                  >
                    <option value="">-- Chọn khóa học --</option>
                    {courses.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="docx-field">
                  <label>Bài học đích *</label>
                  <select
                    value={selectedLessonId}
                    onChange={(e) => setSelectedLessonId(e.target.value)}
                    required
                    disabled={!selectedCourseId || lessons.length === 0}
                  >
                    <option value="">
                      {lessons.length === 0 ? '-- Chưa có bài học --' : '-- Chọn bài học --'}
                    </option>
                    {lessons.map((l) => (
                      <option key={l._id} value={l._id}>
                        {l.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mode Switcher */}
              <div className="docx-input-mode-tabs">
                <button
                  type="button"
                  className={`docx-input-tab-btn ${inputMode === 'file' ? 'active' : ''}`}
                  onClick={() => setInputMode('file')}
                >
                  📄 Tải file Word (.docx)
                </button>
                <button
                  type="button"
                  className={`docx-input-tab-btn ${inputMode === 'text' ? 'active' : ''}`}
                  onClick={() => setInputMode('text')}
                >
                  📋 Dán nội dung văn bản trực tiếp
                </button>
              </div>

              {/* File Dropzone */}
              {inputMode === 'file' ? (
                <div>
                  <div className="docx-dropzone">
                    <input
                      type="file"
                      accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={handleFileChange}
                    />
                    <div className="docx-dropzone-icon">📥</div>
                    <div className="docx-dropzone-text">
                      <strong>Kéo &amp; thả file Word (.docx) vào đây, hoặc click để chọn</strong>
                      <span>Dung lượng tối đa 10 MB. Hệ thống hỗ trợ cả định dạng bảng và đoạn văn.</span>
                    </div>
                  </div>

                  {file && (
                    <div className="docx-selected-file">
                      <div className="docx-file-meta">
                        <span>📄</span>
                        <div>
                          <strong>{file.name}</strong>
                          <br />
                          <small>{(file.size / 1024).toFixed(1)} KB</small>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="docx-btn-secondary"
                        onClick={() => setFile(null)}
                      >
                        Đổi file
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="docx-field">
                  <label>Dán nội dung từ vựng (Hỗ trợ cấu trúc Day, số thứ tự, Nghĩa, Ví dụ):</label>
                  <textarea
                    rows={12}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder={`Day 10\n1. fluctuate (v)\nNghĩa:\ndao động\ntăng giảm không ổn định\nVí dụ:\nOil prices fluctuate depending on market conditions.\n→ Giá dầu dao động tùy thuộc vào điều kiện thị trường.\nfluctuate between A and B = dao động giữa A và B\n\n2. abolish (v)...`}
                  />
                </div>
              )}
            </div>
          )}

          {/* STEP 2: PREVIEW */}
          {step === 2 && (
            <div>
              {/* Metrics & Filter Bar */}
              <div className="docx-preview-toolbar">
                <div className="docx-metrics-badges">
                  <span className="docx-metric-pill total">
                    Tổng: {items.length} từ
                  </span>
                  <span className="docx-metric-pill valid">
                    ✓ {items.filter((i) => i.isValid).length} Hợp lệ
                  </span>
                  {items.some((i) => i.isDuplicate) && (
                    <span className="docx-metric-pill duplicate">
                      ⚠ {items.filter((i) => i.isDuplicate).length} Trùng lặp
                    </span>
                  )}
                  {items.some((i) => !i.isValid) && (
                    <span className="docx-metric-pill invalid">
                      ✕ {items.filter((i) => !i.isValid).length} Cần sửa
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {/* Topic Filter */}
                  {previewData?.topics?.length > 1 && (
                    <select
                      value={selectedTopic}
                      onChange={(e) => setSelectedTopic(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #DED7CE', fontSize: '13px' }}
                    >
                      <option value="ALL">Tất cả chủ đề</option>
                      {previewData.topics.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Search box */}
                  <input
                    type="text"
                    placeholder="Tìm từ trong preview..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #DED7CE', fontSize: '13px' }}
                  />

                  {/* Duplicate Policy */}
                  <div className="docx-duplicate-control">
                    <label>Trùng từ:</label>
                    <select
                      value={duplicateAction}
                      onChange={(e) => setDuplicateAction(e.target.value)}
                    >
                      <option value="skip">Bỏ qua từ trùng (Khuyên dùng)</option>
                      <option value="overwrite">Ghi đè/Cập nhật từ cũ</option>
                      <option value="keep_both">Thêm cả hai</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Preview Table */}
              <div className="docx-table-wrap">
                <table className="docx-preview-table">
                  <thead>
                    <tr>
                      <th className="docx-col-check">
                        <input
                          type="checkbox"
                          checked={
                            filteredItems.length > 0 &&
                            filteredItems.every((it) => selectedIds.has(it._clientIdx))
                          }
                          onChange={handleToggleSelectAll}
                        />
                      </th>
                      <th className="docx-col-stt">STT</th>
                      <th className="docx-col-topic">Day</th>
                      <th className="docx-col-word">Từ vựng</th>
                      <th className="docx-col-pos">Từ loại</th>
                      <th className="docx-col-meaning">Nghĩa tiếng Việt</th>
                      <th className="docx-col-example">Ví dụ (EN / VI)</th>
                      <th className="docx-col-notes">Ghi chú / Cụm từ</th>
                      <th className="docx-col-status">Trạng thái</th>
                      <th className="docx-col-action">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => {
                      const isSelected = selectedIds.has(item._clientIdx);
                      const isEditing = editingIndex === item._clientIdx;

                      return (
                        <tr
                          key={item._clientIdx}
                          className={`${item.isDuplicate ? 'is-duplicate' : ''} ${!item.isValid ? 'is-invalid' : ''}`}
                        >
                          <td className="docx-col-check">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!item.isValid}
                              onChange={() => handleToggleItem(item._clientIdx)}
                            />
                          </td>
                          <td className="docx-col-stt">{item.order}</td>
                          <td className="docx-col-topic">
                            {isEditing ? (
                              <input
                                style={{ width: '80px', padding: '4px' }}
                                value={editForm.topic}
                                onChange={(e) => setEditForm({ ...editForm, topic: e.target.value })}
                              />
                            ) : (
                              item.topic
                            )}
                          </td>
                          <td className="docx-col-word">
                            {isEditing ? (
                              <input
                                style={{ width: '100%', padding: '4px', fontWeight: 'bold' }}
                                value={editForm.word}
                                onChange={(e) => setEditForm({ ...editForm, word: e.target.value })}
                              />
                            ) : (
                              <strong>{item.word}</strong>
                            )}
                          </td>
                          <td className="docx-col-pos">
                            {isEditing ? (
                              <input
                                style={{ width: '70px', padding: '4px' }}
                                value={editForm.partOfSpeech}
                                onChange={(e) => setEditForm({ ...editForm, partOfSpeech: e.target.value })}
                              />
                            ) : (
                              <em>{item.partOfSpeech || '—'}</em>
                            )}
                          </td>
                          <td className="docx-col-meaning">
                            {isEditing ? (
                              <textarea
                                rows={3}
                                style={{ width: '100%', padding: '4px' }}
                                value={editForm.meaning}
                                onChange={(e) => setEditForm({ ...editForm, meaning: e.target.value })}
                              />
                            ) : (
                              <span style={{ whiteSpace: 'pre-line' }}>{item.meaning}</span>
                            )}
                          </td>
                          <td className="docx-col-example">
                            {isEditing ? (
                              <div style={{ display: 'grid', gap: '4px' }}>
                                <input
                                  placeholder="Ví dụ tiếng Anh"
                                  value={editForm.exampleEnglish}
                                  onChange={(e) => setEditForm({ ...editForm, exampleEnglish: e.target.value })}
                                />
                                <input
                                  placeholder="Dịch tiếng Việt"
                                  value={editForm.exampleVietnamese}
                                  onChange={(e) => setEditForm({ ...editForm, exampleVietnamese: e.target.value })}
                                />
                              </div>
                            ) : (
                              <div>
                                {item.exampleEnglish && <div>{item.exampleEnglish}</div>}
                                {item.exampleVietnamese && (
                                  <div style={{ color: '#059669', marginTop: '2px' }}>
                                    → {item.exampleVietnamese}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="docx-col-notes">
                            {isEditing ? (
                              <textarea
                                rows={2}
                                style={{ width: '100%', padding: '4px' }}
                                value={editForm.explanation}
                                onChange={(e) => setEditForm({ ...editForm, explanation: e.target.value })}
                              />
                            ) : (
                              <span style={{ whiteSpace: 'pre-line' }}>{item.explanation || '—'}</span>
                            )}
                          </td>
                          <td className="docx-col-status">
                            {item.isDuplicate ? (
                              <span className="docx-status-tag dup">Trùng lặp</span>
                            ) : item.isValid ? (
                              <span className="docx-status-tag ok">Hợp lệ</span>
                            ) : (
                              <span className="docx-status-tag err" title={item.validationErrors?.join(', ')}>
                                Lỗi dữ liệu
                              </span>
                            )}
                          </td>
                          <td className="docx-col-action">
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                  type="button"
                                  style={{ padding: '2px 6px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                  onClick={saveEdit}
                                >
                                  Lưu
                                </button>
                                <button
                                  type="button"
                                  style={{ padding: '2px 6px', background: '#ccc', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                  onClick={() => setEditingIndex(null)}
                                >
                                  Hủy
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                <button
                                  type="button"
                                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#533B27' }}
                                  title="Chỉnh sửa dòng"
                                  onClick={() => startEdit(item)}
                                >
                                  ✎
                                </button>
                                <button
                                  type="button"
                                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#dc2626' }}
                                  title="Xóa dòng"
                                  onClick={() => handleDeleteRow(item._clientIdx)}
                                >
                                  🗑
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Warnings alert */}
              {previewData?.warnings?.length > 0 && (
                <div className="docx-warnings-box">
                  <strong>Lưu ý khi phân tích tài liệu:</strong>
                  <ul>
                    {previewData.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: SUCCESS */}
          {step === 3 && result && (
            <div className="docx-result-screen">
              <div className="docx-result-icon">🎉</div>
              <h3>Import từ vựng thành công!</h3>
              <p>Dữ liệu từ vựng đã được lưu thành công vào bài học của bạn.</p>

              <div className="docx-result-stats">
                <div className="docx-result-stat-box">
                  <strong>{result.created}</strong>
                  <span>Tạo mới</span>
                </div>
                <div className="docx-result-stat-box">
                  <strong>{result.updated}</strong>
                  <span>Cập nhật</span>
                </div>
                <div className="docx-result-stat-box">
                  <strong>{result.skipped}</strong>
                  <span>Bỏ qua (Trùng)</span>
                </div>
                {result.failed > 0 && (
                  <div className="docx-result-stat-box" style={{ borderColor: '#fca5a5' }}>
                    <strong style={{ color: '#dc2626' }}>{result.failed}</strong>
                    <span>Lỗi</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="docx-import-footer">
          {step === 1 && (
            <>
              <button type="button" className="docx-btn-secondary" onClick={onClose}>
                Hủy bỏ
              </button>
              <button
                type="button"
                className="docx-btn-primary"
                onClick={handleAnalyze}
                disabled={loading || !selectedCourseId || !selectedLessonId || (inputMode === 'file' && !file) || (inputMode === 'text' && !rawText.trim())}
              >
                {loading ? 'Đang phân tích...' : 'Phân tích tài liệu →'}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button
                type="button"
                className="docx-btn-secondary"
                onClick={() => setStep(1)}
                disabled={submitting}
              >
                ← Quay lại tải file
              </button>
              <div className="docx-btn-group">
                <button
                  type="button"
                  className="docx-btn-primary"
                  onClick={handleConfirmImport}
                  disabled={submitting || selectedIds.size === 0}
                >
                  {submitting ? 'Đang lưu vào hệ thống...' : `Xác nhận Import (${selectedIds.size} từ)`}
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                className="docx-btn-primary"
                onClick={() => {
                  handleReset();
                  onClose();
                }}
              >
                Hoàn tất &amp; Đóng
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
