import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toeicApi } from '../../api/toeicApi.js';
import { mediaApi } from '../../api/mediaApi.js';
import './AdminStudentsPage.css';

export default function AdminToeicBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [activeTab, setActiveTab] = useState('overview');
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  // Form states for Overview / Settings
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [toeicMode, setToeicMode] = useState('full_test');
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [attemptLimit, setAttemptLimit] = useState(0);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(true);

  // Group Editor state for active part
  const [activePartNumber, setActivePartNumber] = useState(1);
  const [groupType, setGroupType] = useState('single');
  const [groupTitle, setGroupTitle] = useState('');
  const [groupInstructions, setGroupInstructions] = useState('');
  const [groupImageUrl, setGroupImageUrl] = useState('');
  const [groupAudioUrl, setGroupAudioUrl] = useState('');
  const [passages, setPassages] = useState([{ title: 'Passage 1', content: '', imageUrl: '', order: 1 }]);

  // Questions inside group
  const [questions, setQuestions] = useState([
    {
      questionNumber: 1,
      questionText: '',
      type: 'single_choice',
      options: [
        { id: 'opt_1', text: 'A' },
        { id: 'opt_2', text: 'B' },
        { id: 'opt_3', text: 'C' },
        { id: 'opt_4', text: 'D' },
      ],
      correctAnswer: 'opt_1',
      explanation: '',
    },
  ]);

  // CSV Import state
  const [csvContent, setCsvContent] = useState('');
  const [csvPreview, setCsvPreview] = useState(null);

  useEffect(() => {
    if (isEdit) {
      fetchToeicTestDetails();
    }
  }, [id]);

  const fetchToeicTestDetails = async () => {
    try {
      setLoading(true);
      const res = await toeicApi.getAdminToeicTestById(id);
      if (res.status === 'success') {
        const doc = res.data.assessment;
        setAssessment(doc);
        setTitle(doc.title);
        setDescription(doc.description || '');
        setToeicMode(doc.toeicMode || 'full_test');
        setDurationMinutes(doc.durationMinutes || 120);
        setAttemptLimit(doc.attemptLimit || 0);
        setShowCorrectAnswers(doc.showCorrectAnswers !== false);
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Không thể tải chi tiết đề thi' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOverview = async (e) => {
    e.preventDefault();
    setFeedback({ type: '', text: '' });
    if (!title.trim()) {
      setFeedback({ type: 'error', text: 'Tên đề thi không được để trống' });
      return;
    }

    try {
      setSaving(true);
      if (!isEdit) {
        const res = await toeicApi.createToeicTest({
          title,
          description,
          toeicMode,
          durationMinutes,
          attemptLimit,
          showCorrectAnswers,
        });
        if (res.status === 'success') {
          setFeedback({ type: 'success', text: 'Tạo cấu trúc đề thi TOEIC mới thành công!' });
          navigate(`/admin/toeic-tests/${res.data.assessment._id}/edit`);
        }
      } else {
        const res = await toeicApi.updateToeicTest(id, {
          title,
          description,
          toeicMode,
          durationMinutes,
          attemptLimit,
          showCorrectAnswers,
        });
        if (res.status === 'success') {
          setFeedback({ type: 'success', text: 'Cập nhật thông tin tổng quan thành công!' });
          setAssessment(res.data.assessment);
        }
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Lưu đề thi thất bại' });
    } finally {
      setSaving(false);
    }
  };

  const handleMediaUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setFeedback({ type: 'success', text: 'Đang upload file...' });
      const res = await mediaApi.uploadMedia(file);
      if (res.status === 'success') {
        if (type === 'group_image') setGroupImageUrl(res.data.fileUrl);
        else if (type === 'group_audio') setGroupAudioUrl(res.data.fileUrl);
        setFeedback({ type: 'success', text: `Upload file ${res.data.originalName} thành công!` });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Lỗi khi upload file' });
    }
  };

  const handleSaveQuestionGroup = async () => {
    if (!isEdit || !id) {
      setFeedback({ type: 'error', text: 'Vui lòng lưu thông tin tổng quan trước khi thêm câu hỏi.' });
      return;
    }

    try {
      setSaving(true);
      setFeedback({ type: '', text: '' });

      const payload = {
        partNumber: activePartNumber,
        type: groupType,
        title: groupTitle,
        instructions: groupInstructions,
        imageUrl: groupImageUrl,
        audioUrl: groupAudioUrl,
        passages,
        questions,
      };

      const res = await toeicApi.upsertQuestionGroup(id, payload);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: `Đã lưu nhóm câu hỏi vào Part ${activePartNumber} thành công!` });
        await fetchToeicTestDetails();
        // Reset editor
        setGroupTitle('');
        setGroupImageUrl('');
        setGroupAudioUrl('');
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Lỗi khi lưu nhóm câu hỏi' });
    } finally {
      setSaving(false);
    }
  };

  const handleParseCsvPreview = async () => {
    if (!csvContent.trim()) {
      setFeedback({ type: 'error', text: 'Vui lòng dán hoặc chọn file CSV' });
      return;
    }

    try {
      setFeedback({ type: '', text: '' });
      const res = await toeicApi.importToeicCsv(id, csvContent, true);
      if (res.status === 'success') {
        setCsvPreview(res.data);
        setFeedback({ type: 'success', text: res.message });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Lỗi khi phân tích CSV' });
    }
  };

  const handleConfirmImportCsv = async () => {
    try {
      setSaving(true);
      setFeedback({ type: '', text: '' });
      const res = await toeicApi.importToeicCsv(id, csvContent, false);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: res.message });
        setCsvContent('');
        setCsvPreview(null);
        await fetchToeicTestDetails();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Lỗi khi nhập câu hỏi từ CSV' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="admin-page-container"><div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>Đang tải chi tiết đề thi TOEIC...</div></div>;
  }

  return (
    <div className="admin-page-container">
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <Link to="/admin/toeic-tests" style={{ color: '#0284C7', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem' }}>
            ← Quay lại Danh sách đề thi TOEIC
          </Link>
          <h1 className="admin-page-title">{isEdit ? `Chỉnh Sửa Đề Thi: ${title}` : 'Tạo Đề Thi TOEIC Mới'}</h1>
        </div>
        {isEdit && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Link to={`/admin/toeic-tests/${id}/preview`} className="btn-action-approve" style={{ textDecoration: 'none', background: '#E0F2FE', color: '#0369A1' }}>
              Preview Đề Thi
            </Link>
          </div>
        )}
      </div>

      {feedback.text && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', background: feedback.type === 'success' ? '#DCFCE7' : '#FEF2F2', border: `1px solid ${feedback.type === 'success' ? '#86EFAC' : '#FCA5A5'}`, color: feedback.type === 'success' ? '#166534' : '#991B1B' }}>
          {feedback.text}
        </div>
      )}

      {/* Tabs Bar */}
      <div style={{ display: 'flex', gap: '0.5rem', background: '#FFFFFF', padding: '0.75rem', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('overview')}
          style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', background: activeTab === 'overview' ? '#0284C7' : '#F1F5F9', color: activeTab === 'overview' ? '#FFFFFF' : '#475569' }}
        >
          Tổng Quan & Cấu Hình
        </button>

        {[1, 2, 3, 4, 5, 6, 7].map((pNum) => (
          <button
            key={pNum}
            disabled={!isEdit}
            onClick={() => {
              setActiveTab(`part_${pNum}`);
              setActivePartNumber(pNum);
              if (pNum === 1) setGroupType('audio_image');
              else if (pNum === 2 || pNum === 3 || pNum === 4) setGroupType('audio');
              else if (pNum === 5) setGroupType('single');
              else setGroupType('passage');
            }}
            style={{
              padding: '0.5rem 0.8rem',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 600,
              cursor: isEdit ? 'pointer' : 'not-allowed',
              opacity: isEdit ? 1 : 0.5,
              background: activeTab === `part_${pNum}` ? '#0284C7' : '#F1F5F9',
              color: activeTab === `part_${pNum}` ? '#FFFFFF' : '#475569',
            }}
          >
            Part {pNum}
          </button>
        ))}

        <button
          disabled={!isEdit}
          onClick={() => setActiveTab('csv_import')}
          style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: isEdit ? 'pointer' : 'not-allowed', opacity: isEdit ? 1 : 0.5, background: activeTab === 'csv_import' ? '#0284C7' : '#F1F5F9', color: activeTab === 'csv_import' ? '#FFFFFF' : '#475569' }}
        >
          Import CSV Hàng Loạt
        </button>
      </div>

      {/* TAB CONTENT: Overview */}
      {activeTab === 'overview' && (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.75rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '1.25rem' }}>Cấu Hình Tổng Quan Đề Thi</h2>
          <form onSubmit={handleCreateOverview} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="form-group">
              <label>Tên Đề Thi TOEIC *</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: ETS TOEIC 2026 Test 01" required />
            </div>

            <div className="form-group">
              <label>Mô Tả Hướng Dẫn</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Nhập mô tả đề thi..." rows={3} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
              <div className="form-group">
                <label>Loại Đề Thi</label>
                <select value={toeicMode} onChange={(e) => setToeicMode(e.target.value)} style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                  <option value="full_test">Full Test (200 câu - 120 phút)</option>
                  <option value="mini_test">Mini Test (Rút gọn)</option>
                  <option value="practice">Luyện tập theo Part</option>
                </select>
              </div>

              <div className="form-group">
                <label>Thời Gian Làm Bài (Phút) *</label>
                <input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} min={1} required />
              </div>

              <div className="form-group">
                <label>Giới Hạn Lần Thi (0 = Không giới hạn)</label>
                <input type="number" value={attemptLimit} onChange={(e) => setAttemptLimit(Number(e.target.value))} min={0} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input type="checkbox" id="showAnswers" checked={showCorrectAnswers} onChange={(e) => setShowCorrectAnswers(e.target.checked)} />
              <label htmlFor="showAnswers" style={{ fontWeight: 600, color: '#334155', cursor: 'pointer' }}>Cho phép xem đáp án và giải thích chi tiết sau khi nộp bài</label>
            </div>

            <button type="submit" className="btn-save-profile" disabled={saving} style={{ marginTop: '1rem', width: '220px' }}>
              {saving ? 'Đang lưu...' : isEdit ? 'Lưu Thay Đổi' : 'Tiếp Tục Xây Dựng Câu Hỏi →'}
            </button>
          </form>
        </div>
      )}

      {/* TAB CONTENT: Part 1 - 7 Question Group Editor */}
      {activeTab.startsWith('part_') && (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>Chỉnh Sửa Part {activePartNumber}</h2>
            <p style={{ fontSize: '0.875rem', color: '#64748B' }}>Thêm câu hỏi hoặc nhóm câu hỏi (Question Group) dùng chung File âm thanh hoặc Bài đọc passage.</p>
          </div>

          {/* Group Stimulus Setup */}
          <div style={{ background: '#F8FAFC', padding: '1.25rem', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>1. Thông Tin Nhóm Câu Hỏi (Group Stimulus)</h3>
            
            {(activePartNumber <= 4) && (
              <div className="form-group">
                <label>Upload/Chọn Audio Cho Group Part {activePartNumber} (.mp3, .m4a)</label>
                <input type="file" accept="audio/*" onChange={(e) => handleMediaUpload(e, 'group_audio')} />
                {groupAudioUrl && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <audio controls src={groupAudioUrl} style={{ width: '100%', maxWidth: '400px' }} />
                  </div>
                )}
              </div>
            )}

            {(activePartNumber === 1 || activePartNumber === 6 || activePartNumber === 7) && (
              <div className="form-group">
                <label>Upload Hình Ảnh (.png, .jpg, .webp)</label>
                <input type="file" accept="image/*" onChange={(e) => handleMediaUpload(e, 'group_image')} />
                {groupImageUrl && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <img src={groupImageUrl} alt="Group preview" style={{ maxWidth: '300px', borderRadius: '8px', border: '1px solid #CBD5E1' }} />
                  </div>
                )}
              </div>
            )}

            {(activePartNumber === 6 || activePartNumber === 7) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label style={{ fontWeight: 700, color: '#334155' }}>Nội Dung Bài Đọc (Passage)</label>
                {passages.map((p, pIdx) => (
                  <div key={pIdx} style={{ background: '#FFFFFF', padding: '1rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                    <input
                      type="text"
                      placeholder={`Tiêu đề Passage ${pIdx + 1}`}
                      value={p.title}
                      onChange={(e) => {
                        const updated = [...passages];
                        updated[pIdx].title = e.target.value;
                        setPassages(updated);
                      }}
                      style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                    />
                    <textarea
                      placeholder="Nhập nội dung văn bản đoạn văn..."
                      rows={5}
                      value={p.content}
                      onChange={(e) => {
                        const updated = [...passages];
                        updated[pIdx].content = e.target.value;
                        setPassages(updated);
                      }}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                    />
                  </div>
                ))}
                {activePartNumber === 7 && passages.length < 3 && (
                  <button
                    type="button"
                    onClick={() => setPassages([...passages, { title: `Passage ${passages.length + 1}`, content: '', imageUrl: '', order: passages.length + 1 }])}
                    style={{ background: '#F1F5F9', border: '1px dashed #94A3B8', padding: '0.5rem', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    + Thêm Đoạn Văn (Double/Triple Passage)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Individual Questions List inside Group */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>2. Danh Sách Câu Hỏi Trong Nhóm</h3>
              <button
                type="button"
                onClick={() => setQuestions([...questions, { questionNumber: questions.length + 1, questionText: '', type: 'single_choice', options: [{ id: 'opt_1', text: 'A' }, { id: 'opt_2', text: 'B' }, { id: 'opt_3', text: 'C' }, { id: 'opt_4', text: 'D' }], correctAnswer: 'opt_1', explanation: '' }])}
                style={{ background: '#0284C7', color: '#FFFFFF', padding: '0.4rem 0.8rem', borderRadius: '6px', border: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                + Thêm Câu Hỏi
              </button>
            </div>

            {questions.map((q, qIdx) => (
              <div key={qIdx} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <strong>Câu #{q.questionNumber || qIdx + 1}</strong>
                  <input
                    type="text"
                    placeholder="Nội dung câu hỏi (Nếu có)..."
                    value={q.questionText}
                    onChange={(e) => {
                      const updated = [...questions];
                      updated[qIdx].questionText = e.target.value;
                      setQuestions(updated);
                    }}
                    style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                  {q.options.map((opt, optIdx) => (
                    <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontWeight: 700 }}>{String.fromCharCode(65 + optIdx)}:</span>
                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => {
                          const updated = [...questions];
                          updated[qIdx].options[optIdx].text = e.target.value;
                          setQuestions(updated);
                        }}
                        style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                      />
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Đáp án đúng:</label>
                  <select
                    value={q.correctAnswer}
                    onChange={(e) => {
                      const updated = [...questions];
                      updated[qIdx].correctAnswer = e.target.value;
                      setQuestions(updated);
                    }}
                    style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                  >
                    {q.options.map((opt, optIdx) => (
                      <option key={opt.id} value={opt.id}>
                        Đáp án {String.fromCharCode(65 + optIdx)} ({opt.text})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleSaveQuestionGroup}
            disabled={saving}
            style={{ background: '#0284C7', color: '#FFFFFF', padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', width: '220px' }}
          >
            {saving ? 'Đang lưu...' : 'Lưu Nhóm Câu Hỏi'}
          </button>
        </div>
      )}

      {/* TAB CONTENT: CSV Bulk Import */}
      {activeTab === 'csv_import' && (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>Import Hàng Loạt Từ File CSV</h2>
          <p style={{ fontSize: '0.875rem', color: '#64748B' }}>Dán nội dung định dạng CSV bên dưới để nhập 50-200 câu hỏi nhanh chóng vào đề thi.</p>

          <textarea
            rows={10}
            placeholder="part,question_number,question_text,option_a,option_b,option_c,option_d,correct_answer&#10;1,1,Look at the picture,A,B,C,D,A&#10;5,101,He ____ to the office.,go,went,gone,going,B"
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontFamily: 'monospace' }}
          />

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" onClick={handleParseCsvPreview} style={{ background: '#E0F2FE', color: '#0369A1', padding: '0.6rem 1.25rem', borderRadius: '8px', border: '1px solid #0284C7', fontWeight: 700, cursor: 'pointer' }}>
              Kiểm Tra & Xem Trước
            </button>
            {csvPreview && (
              <button type="button" onClick={handleConfirmImportCsv} disabled={saving} style={{ background: '#166534', color: '#FFFFFF', padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Đang import...' : `Xác Nhận Import (${csvPreview.totalParsed} câu)`}
              </button>
            )}
          </div>

          {csvPreview && (
            <div style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
              <h4>Dữ Liệu Xem Trước (Top 10 câu):</h4>
              <pre style={{ fontSize: '0.8rem', overflowX: 'auto' }}>{JSON.stringify(csvPreview.preview, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
