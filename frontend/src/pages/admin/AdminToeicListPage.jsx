import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toeicApi } from '../../api/toeicApi.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import UiButton from '../../components/ui/UiButton.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import './AdminStudentsPage.css';

export default function AdminToeicListPage() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // PDF Import Modal State
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfMode, setPdfMode] = useState('full_test');
  const [pdfDuration, setPdfDuration] = useState(120);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfImportReport, setPdfImportReport] = useState(null);
  const [pdfError, setPdfError] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    fetchToeicTests();
  }, []);

  const fetchToeicTests = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await toeicApi.getAdminToeicTests();
      if (res.status === 'success') {
        setTests(res.data.tests || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách đề thi TOEIC');
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async (id) => {
    try {
      setActionLoadingId(id);
      setFeedback({ type: '', text: '' });
      const res = await toeicApi.duplicateToeicTest(id);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Nhân bản đề thi TOEIC thành công!' });
        fetchToeicTests();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Lỗi khi nhân bản đề thi' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePublish = async (id) => {
    try {
      setActionLoadingId(id);
      setFeedback({ type: '', text: '' });
      const res = await toeicApi.publishToeicTest(id);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Đã xuất bản đề thi TOEIC thành công! Học viên hiện đã có thể làm bài.' });
        fetchToeicTests();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Không thể xuất bản đề thi.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUnpublish = async (id) => {
    try {
      setActionLoadingId(id);
      setFeedback({ type: '', text: '' });
      const res = await toeicApi.unpublishToeicTest(id);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Đã chuyển đề thi về Bản nháp (Học viên sẽ không thấy đề này).' });
        fetchToeicTests();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Không thể gỡ xuất bản đề thi.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setFeedback({ type: '', text: '' });
      const res = await toeicApi.deleteToeicTest(deleteTarget._id);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Đã xóa đề thi TOEIC thành công!' });
        setDeleteTarget(null);
        fetchToeicTests();
      }
    } catch (err) {
      const isConflict = err.response?.status === 409;
      const msg = isConflict
        ? (err.response?.data?.message || 'Đề thi đã có lượt nộp bài của học viên, không thể xóa.')
        : (err.response?.data?.message || 'Xóa đề thi thất bại.');
      setFeedback({ type: 'error', text: msg });
      setDeleteTarget(null);
    }
  };

  // PDF Import Submit
  const handlePdfUploadSubmit = async (e) => {
    e.preventDefault();
    if (!pdfFile) {
      setPdfError('Vui lòng chọn một file PDF đề thi TOEIC (.pdf)');
      return;
    }

    try {
      setPdfUploading(true);
      setPdfError(null);
      setPdfImportReport(null);

      const res = await toeicApi.importToeicPdf(pdfFile, {
        title: pdfTitle.trim() || undefined,
        toeicMode: pdfMode,
        durationMinutes: pdfDuration,
      });

      if (res.status === 'success') {
        setPdfImportReport(res.data);
        fetchToeicTests();
      }
    } catch (err) {
      setPdfError(err.response?.data?.message || 'Không thể import file PDF. Vui lòng kiểm tra lại định dạng file.');
    } finally {
      setPdfUploading(false);
    }
  };

  const handleClosePdfModal = () => {
    setShowPdfModal(false);
    setPdfFile(null);
    setPdfTitle('');
    setPdfImportReport(null);
    setPdfError(null);
  };

  // Filtered Tests
  const filteredTests = useMemo(() => {
    return tests.filter((t) => {
      const matchesSearch =
        !searchQuery.trim() ||
        t.title?.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        t.description?.toLowerCase().includes(searchQuery.toLowerCase().trim());

      const matchesMode = modeFilter === 'ALL' || t.toeicMode === modeFilter;
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;

      return matchesSearch && matchesMode && matchesStatus;
    });
  }, [tests, searchQuery, modeFilter, statusFilter]);

  return (
    <div className="admin-page-container">
      <PageHeader
        title="Quản Lý Đề Thi TOEIC"
        description="Tạo đề thi thủ công, import đề từ PDF hoặc CSV, chỉnh sửa câu hỏi và quản lý xuất bản cho học viên."
        actions={(
          <>
          <UiButton variant="secondary" onClick={() => setShowPdfModal(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="12" y1="18" x2="12" y2="12"></line>
              <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
            Import Đề Từ PDF
          </UiButton>
          <Link
            to="/admin/toeic-tests/new"
            className="ds-button ds-button--primary"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            + Tạo Đề Mới (Builder)
          </Link>
          </>
        )}
      />

      {/* Feedback banner */}
      {feedback.text && (
        <div style={{ padding: '0.85rem 1.25rem', borderRadius: '10px', marginBottom: '1.25rem', background: feedback.type === 'success' ? 'var(--brand-success-bg)' : 'var(--brand-danger-bg)', border: `1px solid ${feedback.type === 'success' ? 'var(--brand-success-border)' : 'var(--brand-danger-border)'}`, color: feedback.type === 'success' ? 'var(--brand-success)' : 'var(--brand-danger)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback({ type: '', text: '' })} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 'bold' }}>×</button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{ background: 'var(--brand-surface)', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid var(--brand-border)', marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: '280px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <input
              type="text"
              placeholder="Tìm kiếm theo tên đề thi, mô tả..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '0.65rem 1rem', paddingLeft: '2.5rem', borderRadius: '8px', border: '1px solid var(--brand-border)', fontSize: '0.9rem' }}
            />
            <svg style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--brand-muted)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>

          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)', fontSize: '0.85rem', background: 'var(--brand-surface)', color: 'var(--brand-text)', fontWeight: 500 }}
          >
            <option value="ALL">Tất cả định dạng</option>
            <option value="full_test">Full Test (200 câu)</option>
            <option value="mini_test">Mini Test</option>
            <option value="practice">Luyện tập (Practice)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)', fontSize: '0.85rem', background: 'var(--brand-surface)', color: 'var(--brand-text)', fontWeight: 500 }}
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="published">Đã xuất bản (Published)</option>
            <option value="draft">Bản nháp (Draft)</option>
          </select>
        </div>

        <div style={{ fontSize: '0.85rem', color: 'var(--brand-muted)', fontWeight: 600 }}>
          Hiển thị: {filteredTests.length} / {tests.length} đề thi
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--brand-muted)', background: 'var(--brand-surface)', borderRadius: '12px', border: '1px solid var(--brand-border)' }}>
          <div style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid var(--brand-border)', borderTopColor: 'var(--brand-yellow)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '1rem' }} />
          <div>Đang tải danh sách đề thi TOEIC...</div>
        </div>
      ) : error ? (
        <div style={{ padding: '1.5rem', background: 'var(--brand-danger-bg)', color: 'var(--brand-danger)', borderRadius: '12px', border: '1px solid var(--brand-danger-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>{error}</div>
          <button onClick={fetchToeicTests} style={{ padding: '0.4rem 0.8rem', background: 'var(--brand-danger)', color: 'var(--brand-surface)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Thử lại</button>
        </div>
      ) : filteredTests.length === 0 ? (
        <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: 'var(--brand-muted)', background: 'var(--brand-surface)', borderRadius: '16px', border: '1px solid var(--brand-border)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📄</div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-text)', marginBottom: '0.5rem' }}>
            {tests.length === 0 ? 'Chưa có đề thi TOEIC nào trong hệ thống' : 'Không tìm thấy đề thi phù hợp với bộ lọc'}
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-muted)', maxWidth: '480px', margin: '0 auto 1.5rem' }}>
            {tests.length === 0
              ? 'Bắt đầu bằng cách tạo một đề thi mới thủ công hoặc import nhanh từ file PDF đề thi có sẵn.'
              : 'Hãy thử xóa từ khóa tìm kiếm hoặc chọn bộ lọc trạng thái khác để xem kết quả.'}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            {tests.length === 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowPdfModal(true)}
                  style={{ background: 'var(--brand-yellow)', color: 'var(--brand-text)', padding: '0.65rem 1.25rem', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                >
                  Import File PDF
                </button>
                <Link
                  to="/admin/toeic-tests/new"
                  style={{ background: 'var(--brand-yellow)', color: 'var(--brand-text)', padding: '0.65rem 1.25rem', borderRadius: '8px', textDecoration: 'none', fontWeight: 700 }}
                >
                  Tạo Đề Mới
                </Link>
              </>
            ) : (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setModeFilter('ALL'); setStatusFilter('ALL'); }}
                style={{ padding: '0.5rem 1rem', background: 'var(--brand-bg-sub)', border: '1px solid var(--brand-border)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
              >
                Đặt lại bộ lọc
              </button>
            )}
          </div>
        </div>
      ) : (
        <DataTable className="table-responsive" tableClassName="admin-table">
            <thead>
              <tr style={{ background: 'var(--brand-bg-sub)', borderBottom: '1px solid var(--brand-border)', textAlign: 'left' }}>
                <th style={{ padding: '1rem' }}>Tên Đề Thi</th>
                <th style={{ padding: '1rem' }}>Loại Đề</th>
                <th style={{ padding: '1rem' }}>Cấu Trúc</th>
                <th style={{ padding: '1rem' }}>Thời Gian</th>
                <th style={{ padding: '1rem' }}>Trạng Thái</th>
                <th style={{ padding: '1rem' }}>Lượt Thi</th>
                <th style={{ padding: '1rem', minWidth: '240px' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredTests.map((t) => (
                <tr key={t._id} style={{ borderBottom: '1px solid var(--brand-border-light)' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 700, color: 'var(--brand-text)', fontSize: '0.95rem' }}>{t.title}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--brand-muted)', marginTop: '0.2rem' }}>{t.description || 'Không có mô tả'}</div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <StatusBadge
                      status={t.toeicMode}
                      label={t.toeicMode === 'full_test' ? 'FULL TEST (200 câu)' : t.toeicMode === 'mini_test' ? 'MINI TEST' : 'PRACTICE'}
                      variant={t.toeicMode === 'mini_test' ? 'warning' : 'neutral'}
                    />
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 700, color: 'var(--brand-text)' }}>{t.questions?.length || 0} câu</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--brand-muted)' }}>{t.questionGroups?.length || 0} nhóm câu</div>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--brand-text)' }}>
                    {t.durationMinutes || 120} phút
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <StatusBadge status={t.status} label={t.status === 'published' ? 'Đã Xuất Bản' : 'Bản Nháp (Draft)'} />
                  </td>
                  <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--brand-text)' }}>
                    {t.attemptCount || 0}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => navigate(`/admin/toeic-tests/${t._id}/edit`)}
                        title="Chỉnh sửa chi tiết đề thi và câu hỏi"
                        style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid var(--brand-border)', background: 'var(--brand-surface)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand-text)' }}
                      >
                        Sửa Builder
                      </button>
                      <button
                        onClick={() => navigate(`/admin/toeic-tests/${t._id}/preview`)}
                        title="Xem trước toàn bộ 7 Part đề thi"
                        style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid var(--brand-yellow)', background: 'var(--brand-yellow-soft)', color: 'var(--brand-coffee)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => handleDuplicate(t._id)}
                        disabled={actionLoadingId === t._id}
                        title="Tạo bản sao của đề thi này"
                        style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid var(--brand-border)', background: 'var(--brand-bg-sub)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand-muted)' }}
                      >
                        Nhân bản
                      </button>
                      {t.status === 'published' ? (
                        <button
                          onClick={() => handleUnpublish(t._id)}
                          disabled={actionLoadingId === t._id}
                          title="Chuyển về bản nháp (ẩn với học viên)"
                          style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', background: 'var(--brand-warning-bg)', color: 'var(--brand-warning)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                        >
                          Gỡ XB
                        </button>
                      ) : (
                        <button
                          onClick={() => handlePublish(t._id)}
                          disabled={actionLoadingId === t._id}
                          title="Xuất bản để học viên có thể làm bài"
                          style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', background: 'var(--brand-success-bg)', color: 'var(--brand-success)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
                        >
                          Xuất bản
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteTarget(t)}
                        title="Xóa đề thi"
                        style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', background: 'var(--brand-danger-bg)', color: 'var(--brand-danger)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
        </DataTable>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="ds-modal-overlay">
          <div className="ds-modal-content ds-modal-content--sm">
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--brand-text)', marginBottom: '0.75rem' }}>Xác Nhận Xóa Đề Thi TOEIC</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--brand-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Bạn có chắc chắn muốn xóa đề thi <strong>"{deleteTarget.title}"</strong>? Toàn bộ nhóm câu hỏi và câu hỏi liên kết sẽ bị xóa khỏi hệ thống.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button onClick={() => setDeleteTarget(null)} style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: '1px solid var(--brand-border)', background: 'var(--brand-surface)', cursor: 'pointer', fontWeight: 600 }}>Hủy</button>
              <button onClick={handleDeleteConfirm} style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: 'var(--brand-danger)', color: 'var(--brand-surface)', cursor: 'pointer', fontWeight: 700 }}>Xác Nhận Xóa</button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Import Modal */}
      {showPdfModal && (
        <div className="ds-modal-overlay ds-modal-overlay--scroll">
          <div className="ds-modal-content ds-modal-content--lg">
            
            {!pdfImportReport ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--brand-text)' }}>Import Đề Thi TOEIC Từ PDF</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--brand-muted)', marginTop: '0.2rem' }}>Tải lên file PDF đề thi TOEIC. Hệ thống sẽ tự động nhận diện Part, nhóm bài đọc và câu hỏi.</p>
                  </div>
                  <button onClick={handleClosePdfModal} disabled={pdfUploading} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--brand-muted)' }}>×</button>
                </div>

                {pdfError && (
                  <div style={{ padding: '0.85rem', borderRadius: '8px', background: 'var(--brand-danger-bg)', border: '1px solid var(--brand-danger-border)', color: 'var(--brand-danger)', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
                    {pdfError}
                  </div>
                )}

                <form onSubmit={handlePdfUploadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* File Upload Zone */}
                  <div style={{ border: '2px dashed var(--brand-border)', borderRadius: '12px', padding: '2rem 1.5rem', textAlign: 'center', background: 'var(--brand-bg-sub)', position: 'relative' }}>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          setPdfFile(file);
                          if (!pdfTitle) {
                            setPdfTitle(file.name.replace(/\.pdf$/i, ''));
                          }
                        }
                      }}
                      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                    />
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📑</div>
                    {pdfFile ? (
                      <div>
                        <strong style={{ color: 'var(--brand-coffee)', fontSize: '1rem' }}>{pdfFile.name}</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--brand-muted)', marginTop: '0.25rem' }}>{(pdfFile.size / (1024 * 1024)).toFixed(2)} MB</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--brand-success)', marginTop: '0.4rem', fontWeight: 600 }}>✓ Đã chọn file, nhấn nút bên dưới để bắt đầu phân tích</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--brand-text)' }}>Kéo thả hoặc nhấp để chọn file PDF đề thi</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--brand-muted)', marginTop: '0.35rem' }}>Hỗ trợ file PDF đề thi TOEIC tối đa 30MB</div>
                      </div>
                    )}
                  </div>

                  {/* Settings fields */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-text)', marginBottom: '0.4rem' }}>Tên Đề Thi (Tùy chọn)</label>
                    <input
                      type="text"
                      placeholder="VD: ETS TOEIC 2026 Test 01 (PDF Import)"
                      value={pdfTitle}
                      onChange={(e) => setPdfTitle(e.target.value)}
                      style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)' }}
                    />
                  </div>

                  <div className="admin-form-grid">
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-text)', marginBottom: '0.4rem' }}>Loại Đề Thi</label>
                      <select
                        value={pdfMode}
                        onChange={(e) => setPdfMode(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)', background: 'var(--brand-surface)' }}
                      >
                        <option value="full_test">Full Test (200 câu)</option>
                        <option value="mini_test">Mini Test</option>
                        <option value="practice">Luyện tập</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-text)', marginBottom: '0.4rem' }}>Thời Gian (Phút)</label>
                      <input
                        type="number"
                        min="1"
                        value={pdfDuration}
                        onChange={(e) => setPdfDuration(Number(e.target.value))}
                        style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)' }}
                      />
                    </div>
                  </div>

                  <div style={{ background: 'var(--brand-yellow-soft)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--brand-border)', fontSize: '0.8rem', color: 'var(--brand-coffee)', lineHeight: 1.5 }}>
                    <strong>Quy trình xử lý an toàn:</strong> Đề thi sau khi import sẽ được lưu ở trạng thái <strong>BẢN NHÁP (Draft)</strong> và KHÔNG hiển thị cho học viên cho đến khi Giáo viên duyệt và bấm "Xuất bản".
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <button type="button" onClick={handleClosePdfModal} disabled={pdfUploading} style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', border: '1px solid var(--brand-border)', background: 'var(--brand-surface)', cursor: 'pointer', fontWeight: 600 }}>Hủy</button>
                    <button
                      type="submit"
                      disabled={pdfUploading || !pdfFile}
                      style={{
                        padding: '0.65rem 1.5rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: pdfUploading ? 'var(--brand-bg-sub)' : 'var(--brand-yellow)',
                        color: 'var(--brand-text)',
                        fontWeight: 700,
                        cursor: pdfUploading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      {pdfUploading ? (
                        <>
                          <div style={{ width: '16px', height: '16px', border: '2px solid var(--brand-surface)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                          Đang phân tích PDF...
                        </>
                      ) : (
                        'Bắt Đầu Import'
                      )}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* IMPORT RESULT REPORT */
              <div>
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎉</div>
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand-text)' }}>Import PDF Thành Công!</h3>
                  <p style={{ color: 'var(--brand-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                    Đề thi <strong>"{pdfImportReport.title}"</strong> đã được tạo ở trạng thái <strong>BẢN NHÁP (Draft)</strong>.
                  </p>
                </div>

                {/* Detected Stats Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <div style={{ background: 'var(--brand-bg-sub)', padding: '1rem', borderRadius: '10px', textAlign: 'center', border: '1px solid var(--brand-border)' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand-coffee)' }}>{pdfImportReport.detected?.parts?.length || 0}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--brand-muted)', fontWeight: 600 }}>Part Nhận Diện</div>
                  </div>
                  <div style={{ background: 'var(--brand-bg-sub)', padding: '1rem', borderRadius: '10px', textAlign: 'center', border: '1px solid var(--brand-border)' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand-coffee)' }}>{pdfImportReport.detected?.questionGroups || 0}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--brand-muted)', fontWeight: 600 }}>Nhóm Câu Hỏi</div>
                  </div>
                  <div style={{ background: 'var(--brand-bg-sub)', padding: '1rem', borderRadius: '10px', textAlign: 'center', border: '1px solid var(--brand-border)' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand-success)' }}>{pdfImportReport.detected?.questions || 0}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--brand-muted)', fontWeight: 600 }}>Tổng Số Câu Hỏi</div>
                  </div>
                  <div style={{ background: 'var(--brand-bg-sub)', padding: '1rem', borderRadius: '10px', textAlign: 'center', border: '1px solid var(--brand-border)' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand-coffee)' }}>{pdfImportReport.detected?.images || 0}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--brand-muted)', fontWeight: 600 }}>Hình Ảnh Trích Xuất</div>
                  </div>
                </div>

                {/* Warnings / Missing Notices */}
                {pdfImportReport.missing && pdfImportReport.missing.length > 0 && (
                  <div style={{ background: 'var(--brand-warning-bg)', border: '1px solid var(--brand-warning-border)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-warning)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                      Lưu Ý Phần Nghe Listening (Audio)
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: 'var(--brand-warning)', lineHeight: 1.4 }}>
                      {pdfImportReport.missing.map((m, idx) => (
                        <li key={idx}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {pdfImportReport.warnings && pdfImportReport.warnings.length > 0 && (
                  <div style={{ background: 'var(--brand-danger-bg)', border: '1px solid var(--brand-danger-border)', borderRadius: '10px', padding: '1rem', marginBottom: '1.5rem' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-danger)', marginBottom: '0.4rem' }}>
                      Cảnh Báo Cần Kiểm Tra ({pdfImportReport.warnings.length})
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: 'var(--brand-danger)', lineHeight: 1.4 }}>
                      {pdfImportReport.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                  <button
                    type="button"
                    onClick={handleClosePdfModal}
                    style={{ padding: '0.75rem 1.25rem', borderRadius: '8px', border: '1px solid var(--brand-border)', background: 'var(--brand-surface)', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const testId = pdfImportReport.testId;
                      handleClosePdfModal();
                      navigate(`/admin/toeic-tests/${testId}/edit`);
                    }}
                    style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: 'var(--brand-yellow)', color: 'var(--brand-text)', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Mở Builder Để Kiểm Tra & Sửa →
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
