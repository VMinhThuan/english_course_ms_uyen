import { useState, useEffect, useMemo } from 'react';
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
  const [publishing, setPublishing] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
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
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [groupType, setGroupType] = useState('audio_image');
  const [groupTitle, setGroupTitle] = useState('');
  const [groupInstructions, setGroupInstructions] = useState('');
  const [groupImageUrl, setGroupImageUrl] = useState('');
  const [groupAudioUrl, setGroupAudioUrl] = useState('');
  const [groupOrder, setGroupOrder] = useState(1);
  const [passages, setPassages] = useState([{ title: 'Passage 1', content: '', imageUrl: '', order: 1 }]);

  // Questions inside group
  const [questions, setQuestions] = useState([
    {
      questionNumber: 1,
      questionText: '',
      type: 'single_choice',
      options: [
        { id: 'opt_1', text: '' },
        { id: 'opt_2', text: '' },
        { id: 'opt_3', text: '' },
        { id: 'opt_4', text: '' },
      ],
      correctAnswer: 'opt_1',
      explanation: '',
      score: 1,
    },
  ]);

  // CSV Import state
  const [csvContent, setCsvContent] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState(null);
  const [csvErrors, setCsvErrors] = useState([]);

  // PDF Import state inside Builder
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfReport, setPdfReport] = useState(null);
  const [pdfError, setPdfError] = useState(null);

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
        setTitle(doc.title || '');
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

  // Switch Part helper
  const handleSelectPart = (pNum) => {
    setActiveTab(`part_${pNum}`);
    setActivePartNumber(pNum);
    resetGroupEditor(pNum);
  };

  // Reset group form according to Part defaults
  const resetGroupEditor = (pNum = activePartNumber) => {
    setEditingGroupId(null);
    let defaultType = 'single';
    if (pNum === 1) defaultType = 'audio_image';
    else if (pNum >= 2 && pNum <= 4) defaultType = 'audio';
    else if (pNum === 5) defaultType = 'single';
    else if (pNum === 6) defaultType = 'passage';
    else if (pNum === 7) defaultType = 'passage';

    setGroupType(defaultType);
    setGroupTitle(`Nhóm câu hỏi Part ${pNum}`);
    setGroupInstructions('');
    setGroupImageUrl('');
    setGroupAudioUrl('');
    setGroupOrder(1);
    setPassages([{ title: 'Passage 1', content: '', imageUrl: '', order: 1 }]);

    const defaultOptions = pNum === 2
      ? [{ id: 'opt_1', text: 'A' }, { id: 'opt_2', text: 'B' }, { id: 'opt_3', text: 'C' }]
      : [{ id: 'opt_1', text: '' }, { id: 'opt_2', text: '' }, { id: 'opt_3', text: '' }, { id: 'opt_4', text: '' }];

    setQuestions([
      {
        questionNumber: 1,
        questionText: pNum === 1 ? 'Look at the photograph and select the best statement.' : '',
        type: 'single_choice',
        options: defaultOptions,
        correctAnswer: 'opt_1',
        explanation: '',
        score: 1,
      },
    ]);
  };

  // Load existing group into editor
  const handleEditExistingGroup = (group) => {
    setEditingGroupId(group._id);
    setGroupType(group.type || 'single');
    setGroupTitle(group.title || '');
    setGroupInstructions(group.instructions || '');
    setGroupImageUrl(group.imageUrl || '');
    setGroupAudioUrl(group.audioUrl || '');
    setGroupOrder(group.order || 1);
    setPassages(group.passages && group.passages.length > 0 ? group.passages : [{ title: 'Passage 1', content: '', imageUrl: '', order: 1 }]);

    if (group.questionIds && group.questionIds.length > 0) {
      setQuestions(
        group.questionIds.map((q, idx) => ({
          _id: q._id,
          questionNumber: q.questionNumber || idx + 1,
          questionText: q.questionText || '',
          type: q.type || 'single_choice',
          options: q.options && q.options.length > 0 ? q.options : [
            { id: 'opt_1', text: '' },
            { id: 'opt_2', text: '' },
            { id: 'opt_3', text: '' },
            { id: 'opt_4', text: '' },
          ],
          correctAnswer: q.correctAnswers && q.correctAnswers[0] ? q.correctAnswers[0] : 'opt_1',
          explanation: q.explanation || '',
          score: q.score || 1,
        }))
      );
    } else {
      resetGroupEditor(group.partNumber);
      setEditingGroupId(group._id);
    }

    // Scroll to group editor
    window.scrollTo({ top: 380, behavior: 'smooth' });
  };

  // Delete QuestionGroup
  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa nhóm câu hỏi này? Toàn bộ câu hỏi trong nhóm sẽ bị xóa khỏi đề thi.')) {
      return;
    }

    try {
      setSaving(true);
      setFeedback({ type: '', text: '' });
      const res = await toeicApi.deleteQuestionGroup(id, groupId);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Đã xóa nhóm câu hỏi thành công!' });
        if (editingGroupId === groupId) {
          resetGroupEditor(activePartNumber);
        }
        await fetchToeicTestDetails();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Xóa nhóm câu hỏi thất bại' });
    } finally {
      setSaving(false);
    }
  };

  // Delete question inside editor
  const handleDeleteQuestion = async (qIdx) => {
    const q = questions[qIdx];
    if (q._id && id) {
      if (!window.confirm(`Bạn có chắc chắn muốn xóa câu #${q.questionNumber || qIdx + 1}?`)) return;
      try {
        setSaving(true);
        const res = await toeicApi.deleteQuestion(id, q._id);
        if (res.status === 'success') {
          setQuestions((prev) => prev.filter((_, i) => i !== qIdx));
          await fetchToeicTestDetails();
          setFeedback({ type: 'success', text: 'Đã xóa câu hỏi khỏi đề thi!' });
        }
      } catch (err) {
        setFeedback({ type: 'error', text: err.response?.data?.message || 'Xóa câu hỏi thất bại' });
      } finally {
        setSaving(false);
      }
    } else {
      // Unsaved local question
      setQuestions((prev) => prev.filter((_, i) => i !== qIdx));
    }
  };

  // Save Overview / General Settings
  const handleSaveOverview = async (e) => {
    if (e) e.preventDefault();
    setFeedback({ type: '', text: '' });
    if (!title.trim()) {
      setFeedback({ type: 'error', text: 'Tên đề thi không được để trống' });
      return;
    }

    try {
      setSaving(true);
      if (!isEdit) {
        const res = await toeicApi.createToeicTest({
          title: title.trim(),
          description,
          toeicMode,
          durationMinutes,
          attemptLimit,
          showCorrectAnswers,
          status: 'draft',
        });
        if (res.status === 'success') {
          setFeedback({ type: 'success', text: 'Tạo cấu trúc đề thi TOEIC mới thành công! Bạn có thể tiếp tục thêm câu hỏi.' });
          navigate(`/admin/toeic-tests/${res.data.assessment._id}/edit`);
        }
      } else {
        const res = await toeicApi.updateToeicTest(id, {
          title: title.trim(),
          description,
          toeicMode,
          durationMinutes,
          attemptLimit,
          showCorrectAnswers,
          status: 'draft',
        });
        if (res.status === 'success') {
          setFeedback({ type: 'success', text: 'Cập nhật thông tin tổng quan thành công (Lưu bản nháp)!' });
          setAssessment(res.data.assessment);
        }
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Lưu đề thi thất bại' });
    } finally {
      setSaving(false);
    }
  };

  // Media Upload handler
  const handleMediaUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setMediaUploading(true);
      setFeedback({ type: '', text: '' });
      const res = await mediaApi.uploadMedia(file);
      if (res.status === 'success') {
        if (type === 'group_image') setGroupImageUrl(res.data.fileUrl);
        else if (type === 'group_audio') setGroupAudioUrl(res.data.fileUrl);
        setFeedback({ type: 'success', text: `Upload file ${res.data.originalName || file.name} thành công!` });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Lỗi khi upload media' });
    } finally {
      setMediaUploading(false);
    }
  };

  // Save Question Group (Upsert)
  const handleSaveQuestionGroup = async () => {
    if (!isEdit || !id) {
      setFeedback({ type: 'error', text: 'Vui lòng lưu thông tin tổng quan trước khi thêm nhóm câu hỏi.' });
      return;
    }

    if (questions.length === 0) {
      setFeedback({ type: 'error', text: 'Nhóm phải có ít nhất 1 câu hỏi.' });
      return;
    }

    try {
      setSaving(true);
      setFeedback({ type: '', text: '' });

      const payload = {
        groupId: editingGroupId || undefined,
        partNumber: activePartNumber,
        type: groupType,
        title: groupTitle || `Group Part ${activePartNumber}`,
        instructions: groupInstructions,
        imageUrl: groupImageUrl,
        audioUrl: groupAudioUrl,
        passages: passages.filter((p) => p.content?.trim() || p.title?.trim()),
        order: groupOrder,
        questions: questions.map((q, idx) => ({
          _id: q._id || undefined,
          questionNumber: q.questionNumber || idx + 1,
          questionText: q.questionText || '',
          type: q.type || 'single_choice',
          options: q.options.map((opt, oIdx) => ({
            id: opt.id || `opt_${oIdx + 1}`,
            text: opt.text || `Đáp án ${String.fromCharCode(65 + oIdx)}`,
          })),
          correctAnswers: [q.correctAnswer || 'opt_1'],
          explanation: q.explanation || '',
          score: q.score || 1,
          order: q.questionNumber || idx + 1,
        })),
      };

      const res = await toeicApi.upsertQuestionGroup(id, payload);
      if (res.status === 'success') {
        setFeedback({
          type: 'success',
          text: editingGroupId
            ? `Cập nhật nhóm câu hỏi Part ${activePartNumber} thành công!`
            : `Đã thêm nhóm mới vào Part ${activePartNumber} thành công!`,
        });
        await fetchToeicTestDetails();
        resetGroupEditor(activePartNumber);
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Lỗi khi lưu nhóm câu hỏi' });
    } finally {
      setSaving(false);
    }
  };

  // Publish Test
  const handlePublishTest = async () => {
    if (!isEdit || !id) return;

    if (!window.confirm('Bạn có chắc chắn muốn XUẤT BẢN đề thi TOEIC này? Sau khi xuất bản, học viên có thể nhìn thấy và làm bài.')) {
      return;
    }

    try {
      setPublishing(true);
      setFeedback({ type: '', text: '' });
      const res = await toeicApi.publishToeicTest(id);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Xuất bản đề thi TOEIC thành công! Đề thi đã mở cho học viên.' });
        await fetchToeicTestDetails();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Không thể xuất bản đề thi' });
    } finally {
      setPublishing(false);
    }
  };

  // Unpublish Test
  const handleUnpublishTest = async () => {
    if (!isEdit || !id) return;
    try {
      setPublishing(true);
      setFeedback({ type: '', text: '' });
      const res = await toeicApi.unpublishToeicTest(id);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Đã chuyển đề thi về Bản nháp (ẩn khỏi học viên).' });
        await fetchToeicTestDetails();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Không thể gỡ xuất bản đề thi' });
    } finally {
      setPublishing(false);
    }
  };

  // PDF Import within Builder
  const handlePdfImportInBuilder = async (e) => {
    e.preventDefault();
    if (!pdfFile) {
      setPdfError('Vui lòng chọn file PDF để import.');
      return;
    }

    try {
      setPdfUploading(true);
      setPdfError(null);
      setPdfReport(null);

      const res = await toeicApi.importToeicPdf(pdfFile, {
        targetTestId: id,
        toeicMode,
      });

      if (res.status === 'success') {
        setPdfReport(res.data);
        setFeedback({ type: 'success', text: 'Import PDF vào đề thi thành công! Vui lòng duyệt và kiểm tra câu hỏi.' });
        await fetchToeicTestDetails();
      }
    } catch (err) {
      setPdfError(err.response?.data?.message || 'Lỗi khi import file PDF đề thi');
    } finally {
      setPdfUploading(false);
    }
  };

  // CSV Preview & Import
  const handleParseCsvPreview = async () => {
    if (!csvContent.trim()) {
      setFeedback({ type: 'error', text: 'Vui lòng dán nội dung CSV hoặc chọn file' });
      return;
    }

    try {
      setFeedback({ type: '', text: '' });
      setCsvErrors([]);
      const res = await toeicApi.importToeicCsv(id, csvContent, true);
      if (res.status === 'success') {
        setCsvPreview(res.data);
        setFeedback({ type: 'success', text: res.message });
      }
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.errors) {
        setCsvErrors(errData.errors);
      }
      setFeedback({ type: 'error', text: errData?.message || 'Lỗi khi kiểm tra nội dung CSV' });
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
        setCsvFile(null);
        setCsvPreview(null);
        setCsvErrors([]);
        await fetchToeicTestDetails();
      }
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.errors) setCsvErrors(errData.errors);
      setFeedback({ type: 'error', text: errData?.message || 'Import CSV thất bại' });
    } finally {
      setSaving(false);
    }
  };

  // Groups for current Part
  const currentPartGroups = useMemo(() => {
    if (!assessment || !assessment.questionGroups) return [];
    return assessment.questionGroups.filter((g) => g.partNumber === activePartNumber);
  }, [assessment, activePartNumber]);

  const totalQuestionCount = useMemo(() => {
    return assessment?.questions?.length || 0;
  }, [assessment]);

  if (loading) {
    return (
      <div className="admin-page-container">
        <div style={{ padding: '4rem', textAlign: 'center', color: '#64748B' }}>
          <div style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid #E2E8F0', borderTopColor: '#0284C7', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '1rem' }} />
          <div>Đang tải chi tiết đề thi TOEIC...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page-container">
      {/* Top Breadcrumb & Action Bar */}
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '1.25rem' }}>
        <div>
          <Link to="/admin/toeic-tests" style={{ color: '#0284C7', textDecoration: 'none', fontWeight: 600, fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            ← Quay lại Danh sách đề thi TOEIC
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.4rem' }}>
            <h1 className="admin-page-title" style={{ margin: 0 }}>
              {isEdit ? `Builder: ${title}` : 'Tạo Đề Thi TOEIC Mới'}
            </h1>
            {isEdit && (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.25rem 0.6rem',
                  borderRadius: '12px',
                  background: assessment?.status === 'published' ? '#DCFCE7' : '#FEF3C7',
                  color: assessment?.status === 'published' ? '#166534' : '#B45309',
                }}
              >
                {assessment?.status === 'published' ? '● ĐÃ XUẤT BẢN' : '● BẢN NHÁP (DRAFT)'}
              </span>
            )}
          </div>
          {isEdit && (
            <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '0.25rem' }}>
              Tổng cộng: <strong>{totalQuestionCount} câu hỏi</strong> | {assessment?.questionGroups?.length || 0} nhóm câu | {durationMinutes} phút
            </div>
          )}
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {isEdit && (
            <>
              <Link
                to={`/admin/toeic-tests/${id}/preview`}
                style={{
                  textDecoration: 'none',
                  background: '#E0F2FE',
                  color: '#0369A1',
                  padding: '0.65rem 1rem',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                👁 Preview Đề Thi
              </Link>

              {assessment?.status === 'published' ? (
                <button
                  type="button"
                  onClick={handleUnpublishTest}
                  disabled={publishing}
                  style={{
                    background: '#FEF3C7',
                    color: '#B45309',
                    padding: '0.65rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid #FCD34D',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Gỡ Xuất Bản (Về Draft)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePublishTest}
                  disabled={publishing}
                  style={{
                    background: '#16A34A',
                    color: '#FFFFFF',
                    padding: '0.65rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)',
                  }}
                >
                  {publishing ? 'Đang xuất bản...' : '🚀 Xuất Bản Đề Thi'}
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={handleSaveOverview}
            disabled={saving}
            style={{
              background: '#0284C7',
              color: '#FFFFFF',
              padding: '0.65rem 1.25rem',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Đang lưu...' : '💾 Lưu Bản Nháp'}
          </button>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback.text && (
        <div style={{ padding: '0.85rem 1.25rem', borderRadius: '10px', margin: '1rem 0', background: feedback.type === 'success' ? '#DCFCE7' : '#FEF2F2', border: `1px solid ${feedback.type === 'success' ? '#86EFAC' : '#FCA5A5'}`, color: feedback.type === 'success' ? '#166534' : '#991B1B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback({ type: '', text: '' })} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 'bold' }}>×</button>
        </div>
      )}

      {/* Navigation Tabs Bar */}
      <div style={{ display: 'flex', gap: '0.4rem', background: '#FFFFFF', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E2E8F0', margin: '1.25rem 0', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('overview')}
          style={{
            padding: '0.55rem 1rem',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
            background: activeTab === 'overview' ? '#0284C7' : '#F8FAFC',
            color: activeTab === 'overview' ? '#FFFFFF' : '#475569',
          }}
        >
          ⚙ Cấu Hình Chung
        </button>

        {[1, 2, 3, 4, 5, 6, 7].map((pNum) => {
          const groupCount = (assessment?.questionGroups || []).filter((g) => g.partNumber === pNum).length;
          return (
            <button
              key={pNum}
              disabled={!isEdit}
              onClick={() => handleSelectPart(pNum)}
              style={{
                padding: '0.55rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: isEdit ? 'pointer' : 'not-allowed',
                opacity: isEdit ? 1 : 0.5,
                background: activeTab === `part_${pNum}` ? '#0284C7' : '#F8FAFC',
                color: activeTab === `part_${pNum}` ? '#FFFFFF' : '#475569',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              Part {pNum}
              {isEdit && groupCount > 0 && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    background: activeTab === `part_${pNum}` ? '#FFFFFF' : '#E2E8F0',
                    color: activeTab === `part_${pNum}` ? '#0284C7' : '#475569',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    fontWeight: 800,
                  }}
                >
                  {groupCount}
                </span>
              )}
            </button>
          );
        })}

        <button
          disabled={!isEdit}
          onClick={() => setActiveTab('pdf_import')}
          style={{
            padding: '0.55rem 1rem',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: isEdit ? 'pointer' : 'not-allowed',
            opacity: isEdit ? 1 : 0.5,
            background: activeTab === 'pdf_import' ? '#0D9488' : '#F8FAFC',
            color: activeTab === 'pdf_import' ? '#FFFFFF' : '#0D9488',
          }}
        >
          📄 Import PDF
        </button>

        <button
          disabled={!isEdit}
          onClick={() => setActiveTab('csv_import')}
          style={{
            padding: '0.55rem 1rem',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: isEdit ? 'pointer' : 'not-allowed',
            opacity: isEdit ? 1 : 0.5,
            background: activeTab === 'csv_import' ? '#4F46E5' : '#F8FAFC',
            color: activeTab === 'csv_import' ? '#FFFFFF' : '#4F46E5',
          }}
        >
          📊 Import CSV
        </button>
      </div>

      {/* TAB 1: OVERVIEW SETTINGS */}
      {activeTab === 'overview' && (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '1.25rem' }}>Cấu Hình Tổng Quan Đề Thi</h2>
          <form onSubmit={handleSaveOverview} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="form-group">
              <label style={{ fontWeight: 700, color: '#334155' }}>Tên Đề Thi TOEIC *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ví dụ: ETS TOEIC 2026 Test 01 - Full Test"
                required
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
              />
            </div>

            <div className="form-group">
              <label style={{ fontWeight: 700, color: '#334155' }}>Mô Tả & Hướng Dẫn Làm Bài</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả cấu trúc đề thi, mục tiêu luyện tập..."
                rows={3}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
              <div className="form-group">
                <label style={{ fontWeight: 700, color: '#334155' }}>Định Dạng Đề Thi</label>
                <select
                  value={toeicMode}
                  onChange={(e) => setToeicMode(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF' }}
                >
                  <option value="full_test">Full Test (200 câu - 120 phút)</option>
                  <option value="mini_test">Mini Test (Rút gọn)</option>
                  <option value="practice">Luyện tập theo Part (Practice)</option>
                </select>
              </div>

              <div className="form-group">
                <label style={{ fontWeight: 700, color: '#334155' }}>Thời Gian Làm Bài (Phút) *</label>
                <input
                  type="number"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  min={1}
                  required
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div className="form-group">
                <label style={{ fontWeight: 700, color: '#334155' }}>Giới Hạn Lần Thi (0 = Không giới hạn)</label>
                <input
                  type="number"
                  value={attemptLimit}
                  onChange={(e) => setAttemptLimit(Number(e.target.value))}
                  min={0}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.5rem' }}>
              <input
                type="checkbox"
                id="showAnswers"
                checked={showCorrectAnswers}
                onChange={(e) => setShowCorrectAnswers(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="showAnswers" style={{ fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                Cho phép học viên xem đáp án chi tiết và giải thích sau khi hoàn thành bài thi
              </label>
            </div>

            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '1rem' }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  background: '#0284C7',
                  color: '#FFFFFF',
                  padding: '0.85rem 1.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Đang lưu...' : isEdit ? 'Lưu Thông Tin Đề Thi' : 'Tạo Đề & Bắt Đầu Xây Dựng Câu Hỏi →'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: PART 1 TO 7 BUILDER */}
      {activeTab.startsWith('part_') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Part Header & Existing Groups List */}
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Part {activePartNumber}: {
                    activePartNumber === 1 ? 'Photographs (Hình ảnh)' :
                    activePartNumber === 2 ? 'Question - Response (Hỏi đáp)' :
                    activePartNumber === 3 ? 'Conversations (Hội thoại)' :
                    activePartNumber === 4 ? 'Talks (Bài nói ngắn)' :
                    activePartNumber === 5 ? 'Incomplete Sentences (Điền câu)' :
                    activePartNumber === 6 ? 'Text Completion (Điền đoạn văn)' :
                    'Reading Comprehension (Đọc hiểu)'
                  }
                </h2>
                <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '0.2rem' }}>
                  Hiện có <strong>{currentPartGroups.length} nhóm câu hỏi</strong> trong Part này.
                </div>
              </div>

              <button
                type="button"
                onClick={() => resetGroupEditor(activePartNumber)}
                style={{
                  background: '#0284C7',
                  color: '#FFFFFF',
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                + Thêm Nhóm Mới
              </button>
            </div>

            {/* List of Existing Groups in Current Part */}
            {currentPartGroups.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748B', background: '#F8FAFC', borderRadius: '10px' }}>
                Part {activePartNumber} chưa có nhóm câu hỏi nào. Bạn hãy điền thông tin bên dưới và bấm <strong>"Lưu Nhóm Câu Hỏi"</strong>.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {currentPartGroups.map((g, gIdx) => {
                  const isCurrentEditing = editingGroupId === g._id;
                  return (
                    <div
                      key={g._id || gIdx}
                      style={{
                        padding: '1rem',
                        borderRadius: '10px',
                        border: isCurrentEditing ? '2px solid #0284C7' : '1px solid #E2E8F0',
                        background: isCurrentEditing ? '#F0F9FF' : '#F8FAFC',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.95rem' }}>
                          Nhóm #{gIdx + 1}: {g.title || `Group Part ${activePartNumber}`}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.2rem', display: 'flex', gap: '1rem' }}>
                          <span>Loại: <strong>{g.type}</strong></span>
                          <span>Số câu: <strong>{g.questionIds?.length || 0} câu</strong></span>
                          {g.audioUrl && <span style={{ color: '#0284C7' }}>🎧 Có Audio</span>}
                          {g.imageUrl && <span style={{ color: '#0D9488' }}>🖼 Có Hình ảnh</span>}
                          {g.passages && g.passages.length > 0 && <span style={{ color: '#7E22CE' }}>📖 {g.passages.length} đoạn văn</span>}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => handleEditExistingGroup(g)}
                          style={{
                            padding: '0.4rem 0.75rem',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            background: isCurrentEditing ? '#0284C7' : '#FFFFFF',
                            color: isCurrentEditing ? '#FFFFFF' : '#0F172A',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                          }}
                        >
                          {isCurrentEditing ? 'Đang sửa' : 'Chỉnh sửa'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteGroup(g._id)}
                          style={{
                            padding: '0.4rem 0.75rem',
                            borderRadius: '6px',
                            border: 'none',
                            background: '#FEE2E2',
                            color: '#991B1B',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                          }}
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ACTIVE GROUP EDITOR FORM */}
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  {editingGroupId ? 'Chỉnh Sửa Nhóm Câu Hỏi Hiện Tại' : `Tạo Nhóm Câu Hỏi Mới Cho Part ${activePartNumber}`}
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '0.2rem 0 0' }}>
                  Cấu hình stimulus (Audio, Hình ảnh, Bài đọc) và các câu hỏi trong nhóm.
                </p>
              </div>

              {editingGroupId && (
                <button
                  type="button"
                  onClick={() => resetGroupEditor(activePartNumber)}
                  style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Hủy sửa (Tạo mới)
                </button>
              )}
            </div>

            {/* Stimulus settings */}
            <div style={{ background: '#F8FAFC', padding: '1.25rem', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>Tiêu Đề Nhóm</label>
                  <input
                    type="text"
                    value={groupTitle}
                    onChange={(e) => setGroupTitle(e.target.value)}
                    placeholder="VD: Questions 32-34 refer to the following conversation"
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>Loại Nhóm (Stimulus Type)</label>
                  <select
                    value={groupType}
                    onChange={(e) => setGroupType(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF' }}
                  >
                    <option value="single">single (Đơn lẻ / Không stimulus)</option>
                    <option value="audio">audio (Chỉ có Audio)</option>
                    <option value="image">image (Chỉ có Hình ảnh)</option>
                    <option value="audio_image">audio_image (Cả Audio và Hình ảnh)</option>
                    <option value="passage">passage (Một bài đọc)</option>
                    <option value="multi_passage">multi_passage (Nhiều bài đọc Part 7)</option>
                    <option value="audio_passage">audio_passage (Audio và bài đọc)</option>
                  </select>
                </div>
              </div>

              {/* Audio Upload for Listening (Parts 1-4) or when groupType contains audio */}
              {(activePartNumber <= 4 || groupType.includes('audio')) && (
                <div style={{ background: '#FFFFFF', padding: '1rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>
                    File Audio Âm Thanh (.mp3, .wav, .m4a)
                  </label>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => handleMediaUpload(e, 'group_audio')}
                      disabled={mediaUploading}
                    />
                    {mediaUploading && <span style={{ fontSize: '0.8rem', color: '#0284C7' }}>Đang upload audio...</span>}
                    {groupAudioUrl && (
                      <button
                        type="button"
                        onClick={() => setGroupAudioUrl('')}
                        style={{ padding: '0.3rem 0.6rem', background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        Gỡ Audio
                      </button>
                    )}
                  </div>
                  {groupAudioUrl && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <audio controls src={groupAudioUrl} style={{ width: '100%', maxWidth: '450px' }} />
                      <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.2rem' }}>URL: {groupAudioUrl}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Image Upload for Part 1 or Visual Stimulus */}
              {(activePartNumber === 1 || groupType.includes('image')) && (
                <div style={{ background: '#FFFFFF', padding: '1rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>
                    Hình Ảnh Minh Họa (.png, .jpg, .webp)
                  </label>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleMediaUpload(e, 'group_image')}
                      disabled={mediaUploading}
                    />
                    {groupImageUrl && (
                      <button
                        type="button"
                        onClick={() => setGroupImageUrl('')}
                        style={{ padding: '0.3rem 0.6rem', background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        Gỡ Hình Ảnh
                      </button>
                    )}
                  </div>
                  {groupImageUrl && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <img src={groupImageUrl} alt="Group preview" style={{ maxWidth: '280px', maxHeight: '200px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #CBD5E1' }} />
                      <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.2rem' }}>URL: {groupImageUrl}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Reading Passages for Part 6 & 7 */}
              {(activePartNumber >= 6 || groupType.includes('passage')) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155' }}>Nội Dung Bài Đọc (Passage)</label>
                    <button
                      type="button"
                      onClick={() => setPassages([...passages, { title: `Passage ${passages.length + 1}`, content: '', imageUrl: '', order: passages.length + 1 }])}
                      style={{ background: '#E0F2FE', color: '#0369A1', border: 'none', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      + Thêm Đoạn Văn
                    </button>
                  </div>

                  {passages.map((p, pIdx) => (
                    <div key={pIdx} style={{ background: '#FFFFFF', padding: '1rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <input
                          type="text"
                          placeholder={`Tiêu đề đoạn văn ${pIdx + 1}`}
                          value={p.title}
                          onChange={(e) => {
                            const updated = [...passages];
                            updated[pIdx].title = e.target.value;
                            setPassages(updated);
                          }}
                          style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid #CBD5E1', marginRight: '0.5rem', fontWeight: 600 }}
                        />
                        {passages.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setPassages(passages.filter((_, i) => i !== pIdx))}
                            style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', padding: '0.4rem 0.65rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
                          >
                            Xóa đoạn này
                          </button>
                        )}
                      </div>
                      <textarea
                        placeholder="Dán hoặc nhập nội dung văn bản đoạn văn tại đây..."
                        rows={6}
                        value={p.content}
                        onChange={(e) => {
                          const updated = [...passages];
                          updated[pIdx].content = e.target.value;
                          setPassages(updated);
                        }}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.5 }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Questions List Inside Group */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  2. Danh Sách Câu Hỏi Trong Nhóm ({questions.length} câu)
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    const nextNum = questions.length > 0 ? (questions[questions.length - 1].questionNumber || questions.length) + 1 : 1;
                    const defaultOptions = activePartNumber === 2
                      ? [{ id: 'opt_1', text: 'A' }, { id: 'opt_2', text: 'B' }, { id: 'opt_3', text: 'C' }]
                      : [{ id: 'opt_1', text: '' }, { id: 'opt_2', text: '' }, { id: 'opt_3', text: '' }, { id: 'opt_4', text: '' }];

                    setQuestions([
                      ...questions,
                      {
                        questionNumber: nextNum,
                        questionText: '',
                        type: 'single_choice',
                        options: defaultOptions,
                        correctAnswer: 'opt_1',
                        explanation: '',
                        score: 1,
                      },
                    ]);
                  }}
                  style={{ background: '#0284C7', color: '#FFFFFF', padding: '0.4rem 0.85rem', borderRadius: '6px', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  + Thêm Câu Hỏi Vào Nhóm
                </button>
              </div>

              {questions.map((q, qIdx) => (
                <div key={q._id || qIdx} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ background: '#0284C7', color: '#FFFFFF', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 800, fontSize: '0.85rem' }}>
                        Câu #{q.questionNumber || qIdx + 1}
                      </span>
                      <input
                        type="number"
                        title="Số thứ tự câu hỏi"
                        value={q.questionNumber || qIdx + 1}
                        onChange={(e) => {
                          const updated = [...questions];
                          updated[qIdx].questionNumber = Number(e.target.value);
                          setQuestions(updated);
                        }}
                        style={{ width: '80px', padding: '0.4rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteQuestion(qIdx)}
                      style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Xóa câu hỏi
                    </button>
                  </div>

                  {/* Question Text / Prompt */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                      Nội Dung Câu Hỏi / Prompt {activePartNumber === 1 ? '(Có thể để trống hoặc hướng dẫn nhìn tranh)' : ''}
                    </label>
                    <input
                      type="text"
                      placeholder="Nhập nội dung câu hỏi..."
                      value={q.questionText}
                      onChange={(e) => {
                        const updated = [...questions];
                        updated[qIdx].questionText = e.target.value;
                        setQuestions(updated);
                      }}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                    />
                  </div>

                  {/* Options List */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>
                      Các Lựa Chọn Đáp Án (Tích chọn nút tròn để đặt làm ĐÁP ÁN ĐÚNG)
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                      {q.options.map((opt, optIdx) => {
                        const isCorrect = q.correctAnswer === opt.id;
                        return (
                          <div
                            key={opt.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              background: isCorrect ? '#DCFCE7' : '#FFFFFF',
                              padding: '0.5rem 0.75rem',
                              borderRadius: '8px',
                              border: isCorrect ? '1.5px solid #16A34A' : '1px solid #CBD5E1',
                            }}
                          >
                            <input
                              type="radio"
                              name={`correct_${qIdx}_${q._id || 'temp'}`}
                              checked={isCorrect}
                              onChange={() => {
                                const updated = [...questions];
                                updated[qIdx].correctAnswer = opt.id;
                                setQuestions(updated);
                              }}
                              title="Chọn làm đáp án đúng"
                              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            />
                            <span style={{ fontWeight: 800, color: isCorrect ? '#166534' : '#0F172A', minWidth: '20px' }}>
                              {String.fromCharCode(65 + optIdx)}:
                            </span>
                            <input
                              type="text"
                              value={opt.text}
                              onChange={(e) => {
                                const updated = [...questions];
                                updated[qIdx].options[optIdx].text = e.target.value;
                                setQuestions(updated);
                              }}
                              placeholder={`Lựa chọn ${String.fromCharCode(65 + optIdx)}`}
                              style={{ flex: 1, padding: '0.4rem', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Explanation Field */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                      Giải Thích Chi Tiết & Từ Vựng (Explanation)
                    </label>
                    <textarea
                      placeholder="Giải thích vì sao đáp án đúng, dịch nghĩa câu hoặc bẫy thường gặp..."
                      rows={2}
                      value={q.explanation || ''}
                      onChange={(e) => {
                        const updated = [...questions];
                        updated[qIdx].explanation = e.target.value;
                        setQuestions(updated);
                      }}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Save Group Action */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={handleSaveQuestionGroup}
                disabled={saving}
                style={{
                  background: '#0284C7',
                  color: '#FFFFFF',
                  padding: '0.85rem 2rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 4px rgba(2, 132, 199, 0.25)',
                }}
              >
                {saving ? 'Đang lưu...' : editingGroupId ? 'Cập Nhật Nhóm Câu Hỏi' : 'Lưu Nhóm Câu Hỏi Vào Đề'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PDF IMPORT IN BUILDER */}
      {activeTab === 'pdf_import' && (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '2rem' }}>
          <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #F1F5F9', paddingBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Import Trực Tiếp Từ File PDF Đề Thi</h2>
            <p style={{ fontSize: '0.875rem', color: '#64748B', marginTop: '0.25rem' }}>
              Upload file PDF đề thi TOEIC để tự động phân tích và thêm các Part, QuestionGroup và Questions vào đề thi này. Đề thi vẫn sẽ được giữ ở trạng thái <strong>BẢN NHÁP (Draft)</strong> để bạn duyệt.
            </p>
          </div>

          {pdfError && (
            <div style={{ padding: '0.85rem 1.25rem', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', marginBottom: '1.25rem' }}>
              {pdfError}
            </div>
          )}

          {!pdfReport ? (
            <form onSubmit={handlePdfImportInBuilder} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ border: '2px dashed #CBD5E1', borderRadius: '12px', padding: '2.5rem 1.5rem', textAlign: 'center', background: '#F8FAFC', position: 'relative' }}>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setPdfFile(e.target.files[0] || null)}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                />
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📑</div>
                {pdfFile ? (
                  <div>
                    <strong style={{ color: '#0284C7', fontSize: '1.1rem' }}>{pdfFile.name}</strong>
                    <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '0.25rem' }}>{(pdfFile.size / (1024 * 1024)).toFixed(2)} MB</div>
                    <div style={{ fontSize: '0.85rem', color: '#059669', marginTop: '0.5rem', fontWeight: 700 }}>✓ File đã sẵn sàng để phân tích</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontWeight: 700, color: '#334155', fontSize: '1rem' }}>Chọn hoặc kéo thả file PDF đề thi TOEIC</div>
                    <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginTop: '0.35rem' }}>Hỗ trợ file scan dạng text hoặc văn bản PDF (tối đa 30MB)</div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <button
                  type="submit"
                  disabled={pdfUploading || !pdfFile}
                  style={{
                    background: pdfUploading ? '#94A3B8' : '#0D9488',
                    color: '#FFFFFF',
                    padding: '0.85rem 2rem',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: pdfUploading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  {pdfUploading ? (
                    <>
                      <div style={{ width: '18px', height: '18px', border: '2px solid #FFFFFF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      Đang đọc và phân tích file PDF đề thi...
                    </>
                  ) : (
                    'Bắt Đầu Phân Tích & Import PDF'
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <div style={{ background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#166534', margin: 0 }}>
                  ✓ Đã Phân Tích & Import PDF Thành Công!
                </h3>
                <p style={{ color: '#166534', fontSize: '0.9rem', marginTop: '0.35rem' }}>
                  Đề thi hiện có tổng cộng <strong>{assessment?.questions?.length || 0} câu hỏi</strong>.
                </p>
              </div>

              {/* Detected breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '10px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0284C7' }}>{pdfReport.detected?.parts?.length || 0}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Part Nhận Diện</div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '10px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0D9488' }}>{pdfReport.detected?.questionGroups || 0}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Nhóm Câu Hỏi</div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '10px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#166534' }}>{pdfReport.detected?.questions || 0}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Câu Hỏi Đã Tạo</div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '10px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#7E22CE' }}>{pdfReport.detected?.images || 0}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Hình Ảnh Đã Trích</div>
                </div>
              </div>

              {pdfReport.missing && pdfReport.missing.length > 0 && (
                <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#B45309', marginBottom: '0.4rem' }}>
                    Lưu ý về File Audio (Listening)
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: '#92400E', lineHeight: 1.4 }}>
                    {pdfReport.missing.map((m, idx) => (
                      <li key={idx}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}

              {pdfReport.warnings && pdfReport.warnings.length > 0 && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '10px', padding: '1rem', marginBottom: '1.5rem' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#991B1B', marginBottom: '0.4rem' }}>
                    Cảnh Báo Kiểm Tra ({pdfReport.warnings.length})
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: '#B91C1C', lineHeight: 1.4 }}>
                    {pdfReport.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setPdfReport(null);
                  setPdfFile(null);
                  setActiveTab('part_1');
                  setActivePartNumber(1);
                  resetGroupEditor(1);
                }}
                style={{ background: '#0284C7', color: '#FFFFFF', padding: '0.75rem 1.75rem', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer' }}
              >
                Chuyển Sang Duyệt Part 1–7 →
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CSV BULK IMPORT */}
      {activeTab === 'csv_import' && (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '2rem' }}>
          <div style={{ marginBottom: '1.25rem', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Import Câu Hỏi Hàng Loạt Bằng CSV</h2>
            <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '0.25rem' }}>
              Dán nội dung CSV hoặc chọn file để nhập hàng loạt câu hỏi cho các Part 1–7.
            </p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>
              Nội Dung Định Dạng CSV
            </label>
            <textarea
              rows={8}
              placeholder="part,question_number,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation&#10;5,101,Mr. Park will ______ the meeting tomorrow.,attend,attended,attending,attendance,A,Cần động từ nguyên mẫu sau will&#10;5,102,The report must be completed ______ Friday.,by,on,at,in,A,By Friday nghĩa là trước hoặc đúng thứ Sáu"
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
          </div>

          {/* CSV Errors if any */}
          {csvErrors.length > 0 && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#991B1B', marginBottom: '0.4rem' }}>
                Lỗi Xác Thực CSV ({csvErrors.length} lỗi)
              </h4>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: '#B91C1C', lineHeight: 1.4 }}>
                {csvErrors.map((errStr, idx) => (
                  <li key={idx}>{errStr}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleParseCsvPreview}
              style={{ background: '#E0F2FE', color: '#0369A1', padding: '0.65rem 1.25rem', borderRadius: '8px', border: '1px solid #0284C7', fontWeight: 700, cursor: 'pointer' }}
            >
              Kiểm Tra & Xem Trước
            </button>
            {csvPreview && (
              <button
                type="button"
                onClick={handleConfirmImportCsv}
                disabled={saving}
                style={{ background: '#166534', color: '#FFFFFF', padding: '0.65rem 1.5rem', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer' }}
              >
                {saving ? 'Đang import...' : `Xác Nhận Import (${csvPreview.totalParsed} câu)`}
              </button>
            )}
          </div>

          {csvPreview && (
            <div style={{ background: '#F8FAFC', padding: '1.25rem', borderRadius: '10px', border: '1px solid #E2E8F0', marginTop: '1.25rem' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.5rem' }}>
                Dữ Liệu Hợp Lệ ({csvPreview.totalParsed} câu được phân tích):
              </h4>
              <pre style={{ fontSize: '0.8rem', overflowX: 'auto', background: '#FFFFFF', padding: '0.75rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}>
                {JSON.stringify(csvPreview.preview, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
