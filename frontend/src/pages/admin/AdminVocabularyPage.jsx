import { useCallback, useEffect, useState } from 'react';
import { vocabularyApi } from '../../api/vocabularyApi.js';
import { courseApi } from '../../api/courseApi.js';
import { lessonApi } from '../../api/lessonApi.js';
import { mediaApi } from '../../api/mediaApi.js';
import DocxVocabularyImportModal from '../../components/admin/DocxVocabularyImportModal.jsx';
import './AdminStudentsPage.css';
import './VocabularyAdmin.css';

const blank = {
  word: '',
  partOfSpeech: '',
  pronunciation: '',
  meaning: '',
  exampleEnglish: '',
  exampleVietnamese: '',
  audioUrl: '',
  topic: '',
  order: 0,
  lessonId: '',
  status: 'published',
};

export default function AdminVocabularyPage() {
  const [items, setItems] = useState([]);
  const [topics, setTopics] = useState([]);
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState('');

  // State for DOCX Import Modal
  const [showDocxModal, setShowDocxModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await vocabularyApi.getAdminVocabulary({
        limit: 100,
        ...(query ? { search: query } : {}),
        ...(topic ? { topic } : {}),
      });
      const list = res.data.vocabulary || [];
      setItems(list);
      setTopics([...new Set(list.map((v) => v.topic).filter(Boolean))]);
    } catch {
      setError('Không thể tải danh sách từ vựng. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [query, topic]);

  useEffect(() => {
    const id = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(id);
  }, [load, query]);

  useEffect(() => {
    courseApi
      .getCourses()
      .then((r) => setCourses(r.data.courses || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.courseId) return;
    lessonApi
      .getLessonsByCourse(form.courseId)
      .then((r) => setLessons(r.data.lessons || []))
      .catch(() => setLessons([]));
  }, [form.courseId]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const open = (item) => {
    setForm(
      item
        ? {
            ...blank,
            ...item,
            lessonId: item.lesson?._id || item.lesson || '',
            courseId: item.course?._id || item.course || '',
          }
        : blank
    );
    setModal(item ? { type: 'edit', item } : { type: 'create' });
  };

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await mediaApi.uploadMedia(file, 'import-files');
      setForm((f) => ({ ...f, audioUrl: res.data.fileUrl }));
      setToast('Đã tải audio lên.');
    } catch (err) {
      setToast(err.response?.data?.message || 'Không thể tải audio.');
    } finally {
      setUploading(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.word.trim() || !form.meaning.trim() || !form.lessonId) {
      setModal((m) => ({ ...m, error: 'Vui lòng nhập từ, nghĩa và chọn bài học.' }));
      return;
    }
    setSaving(true);
    try {
      const data = { ...form, order: Number(form.order), lessonId: form.lessonId };
      delete data.courseId;
      const res =
        modal.type === 'edit'
          ? await vocabularyApi.updateVocabulary(modal.item._id, data)
          : await vocabularyApi.createVocabulary(data);
      const saved = res.data.vocabulary;
      setItems((list) =>
        modal.type === 'edit'
          ? list.map((v) =>
              v._id === saved._id
                ? { ...saved, lesson: lessons.find((x) => x._id === saved.lesson) || saved.lesson }
                : v
            )
          : [saved, ...list]
      );
      setModal(null);
      setToast(modal.type === 'edit' ? 'Đã cập nhật từ vựng.' : 'Đã thêm từ vựng.');
      load();
    } catch (err) {
      setModal((m) => ({ ...m, error: err.response?.data?.message || 'Không thể lưu từ vựng.' }));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await vocabularyApi.deleteVocabulary(modal.item._id);
      setItems((list) => list.filter((v) => v._id !== modal.item._id));
      setModal(null);
      setToast('Đã xóa từ vựng.');
    } catch {
      setModal((m) => ({ ...m, error: 'Không thể xóa từ vựng.' }));
    }
  };

  return (
    <div className="admin-page-container">
      <header>
        <p className="admin-eyebrow">Vocabulary bank</p>
        <h1 className="admin-page-title">Quản lý từ vựng</h1>
        <p className="admin-page-sub">Tạo, chỉnh sửa và sắp xếp từ vựng theo Day / chủ đề.</p>
      </header>

      <div className="admin-vocab-toolbar">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm từ hoặc nghĩa..."
          aria-label="Tìm từ vựng"
        />
        <select value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">Tất cả chủ đề</option>
          {topics.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="admin-quiet-button"
            onClick={() => setShowDocxModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            📄 Import từ Word (.docx)
          </button>
          <button type="button" className="admin-primary-button" onClick={() => open()}>
            + Thêm từ vựng
          </button>
        </div>
      </div>

      {error && (
        <div className="admin-error">
          {error}
          <button onClick={load}>Thử lại</button>
        </div>
      )}

      <div className="admin-table-container">
        {loading ? (
          <div className="admin-table-skeleton">
            <i />
            <i />
            <i />
          </div>
        ) : (
          <table className="admin-data-table vocab-admin-table">
            <thead>
              <tr>
                <th>Thứ tự</th>
                <th>Từ vựng</th>
                <th>Nghĩa</th>
                <th>Chủ đề / Day</th>
                <th>Bài học</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? (
                items.map((v) => (
                  <tr key={v._id}>
                    <td>{v.order}</td>
                    <td>
                      <b>{v.word}</b>
                      <small>
                        {v.partOfSpeech && `(${v.partOfSpeech})`}
                        {v.pronunciation && ` · ${v.pronunciation}`}
                      </small>
                    </td>
                    <td style={{ whiteSpace: 'pre-line' }}>{v.meaning}</td>
                    <td>{v.topic || '—'}</td>
                    <td>{v.lesson?.title || '—'}</td>
                    <td>
                      <span className={`status-badge ${v.status === 'published' ? 'active' : 'rejected'}`}>
                        {v.status === 'published' ? 'Đã xuất bản' : 'Đang ẩn'}
                      </span>
                    </td>
                    <td className="student-actions">
                      <button className="admin-quiet-button" onClick={() => open(v)}>
                        Sửa
                      </button>
                      <button className="admin-danger-button" onClick={() => setModal({ type: 'delete', item: v })}>
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7">
                    <div className="admin-empty">Chưa có từ vựng phù hợp.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {modal?.type === 'delete' && (
        <div className="admin-modal-backdrop">
          <section className="admin-confirm-modal">
            <h2>Xóa từ vựng?</h2>
            <p>
              Bạn có chắc muốn xóa từ <strong>“{modal.item.word}”</strong>?
            </p>
            {modal.error && <div className="admin-error">{modal.error}</div>}
            <div className="modal-actions">
              <button className="admin-quiet-button" onClick={() => setModal(null)}>
                Hủy
              </button>
              <button className="admin-danger-button" onClick={remove}>
                Xóa từ
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Single Add/Edit Modal */}
      {modal && (modal.type === 'create' || modal.type === 'edit') && (
        <div className="admin-modal-backdrop">
          <form className="admin-confirm-modal vocab-form" onSubmit={save}>
            <button type="button" className="modal-close" onClick={() => setModal(null)}>
              ×
            </button>
            <h2>{modal.type === 'edit' ? 'Chỉnh sửa từ vựng' : 'Thêm từ vựng'}</h2>
            <div className="vocab-form-grid">
              <label>
                Từ vựng
                <input name="word" value={form.word} onChange={change} required />
              </label>
              <label>
                Từ loại
                <input name="partOfSpeech" value={form.partOfSpeech} onChange={change} placeholder="e.g. v, n, adj" />
              </label>
              <label>
                Phiên âm
                <input name="pronunciation" value={form.pronunciation} onChange={change} placeholder="e.g. /ˈflʌktʃueɪt/" />
              </label>
              <label>
                Nghĩa
                <input name="meaning" value={form.meaning} onChange={change} required />
              </label>
              <label>
                Chủ đề / Day
                <input name="topic" value={form.topic} onChange={change} list="vocab-topics" placeholder="e.g. Day 10" />
                <datalist id="vocab-topics">
                  {topics.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </label>
              <label>
                Thứ tự
                <input name="order" type="number" min="0" value={form.order} onChange={change} />
              </label>
              <label>
                Khóa học
                <select name="courseId" value={form.courseId || ''} onChange={change}>
                  <option value="">Chọn khóa học</option>
                  {courses.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Bài học
                <select name="lessonId" value={form.lessonId} onChange={change} required>
                  <option value="">Chọn bài học</option>
                  {lessons.map((l) => (
                    <option key={l._id} value={l._id}>
                      {l.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Trạng thái
                <select name="status" value={form.status} onChange={change}>
                  <option value="published">Đã xuất bản</option>
                  <option value="hidden">Đang ẩn</option>
                </select>
              </label>
              <label>
                Audio MP3
                <input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/*" onChange={upload} />
                {uploading && <small>Đang tải audio...</small>}
                {form.audioUrl && <audio controls src={form.audioUrl} />}
              </label>
              <label className="wide">
                Ví dụ tiếng Anh
                <textarea
                  name="exampleEnglish"
                  value={form.exampleEnglish || form.example || ''}
                  onChange={change}
                />
              </label>
              <label className="wide">
                Ví dụ tiếng Việt
                <textarea
                  name="exampleVietnamese"
                  value={form.exampleVietnamese || ''}
                  onChange={change}
                />
              </label>
            </div>
            {modal.error && <div className="admin-error">{modal.error}</div>}
            <div className="modal-actions">
              <button type="button" className="admin-quiet-button" onClick={() => setModal(null)}>
                Hủy
              </button>
              <button className="admin-primary-button" disabled={saving || uploading}>
                {saving ? 'Đang lưu...' : 'Lưu từ vựng'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DOCX Import Modal */}
      <DocxVocabularyImportModal
        isOpen={showDocxModal}
        onClose={() => setShowDocxModal(false)}
        onSuccess={() => {
          setToast('Đã import từ vựng từ file Word thành công!');
          load();
        }}
      />

      {toast && <div className="admin-toast">{toast}</div>}
    </div>
  );
}
