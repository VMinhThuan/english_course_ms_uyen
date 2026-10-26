import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { vocabularyCatalogApi } from './api.js';
import { vocabularyPublicationApi, VocabularyPublicationApiError } from './publicationApi.js';
import './publicationWorkspace.css';

const BLOCKER_LABELS = Object.freeze({
  TAG_ARCHIVED: 'Tag đã lưu trữ.',
  TAG_NOT_PUBLISHED: 'Cần xuất bản Tag trước.',
  TAG_ALREADY_PUBLISHED: 'Tag đã xuất bản.',
  TAG_MISSING: 'Không tìm thấy Tag.',
  CHAPTER_ARCHIVED: 'Chapter đã lưu trữ.',
  CHAPTER_NOT_PUBLISHED: 'Cần xuất bản Chapter trước.',
  CHAPTER_ALREADY_PUBLISHED: 'Chapter đã xuất bản.',
  CHAPTER_MISSING: 'Không tìm thấy Chapter.',
  CHAPTER_TAG_MISMATCH: 'Chapter không thuộc Tag này.',
  VOCABULARY_ARCHIVED: 'Vocabulary đã ẩn.',
  VOCABULARY_ALREADY_PUBLISHED: 'Vocabulary đã xuất bản.',
  CATALOG_VOCABULARY_REQUIRED: 'Không phải Vocabulary trong Catalog.',
  CHAPTER_MEMBERSHIP_REQUIRED: 'Thiếu liên kết Vocabulary với Chapter.',
  MEMBERSHIP_CHAPTER_MISMATCH: 'Membership trỏ sai Chapter.',
  MEMBERSHIP_VOCABULARY_MISMATCH: 'Membership trỏ sai Vocabulary.',
  EDITORIAL_REVIEW_REQUIRED: 'Cần editorial review trước khi xuất bản.',
  EDITORIAL_REVIEW_REJECTED: 'Nội dung bị từ chối review.',
  EDITORIAL_REVIEW_STALE: 'Nội dung đã thay đổi sau khi review; cần review lại.',
  CANDIDATE_REJECTED: 'Candidate đã bị từ chối.',
  CANDIDATE_REVIEW_REQUIRED: 'Candidate chưa được duyệt.',
  CANDIDATE_VALIDATION_REQUIRED: 'Candidate chưa vượt qua kiểm tra dữ liệu.',
  CONFIRM_DRAFT_REQUIRED: 'Candidate chưa được Confirm Draft.',
  REVIEW_ACTOR_AND_TIME_REQUIRED: 'Thiếu người duyệt hoặc thời điểm duyệt.',
  IMPORT_BATCH_REQUIRED: 'Không tìm thấy Import Batch.',
  IMPORT_PROVENANCE_REQUIRED: 'Membership thủ công chưa có provenance được duyệt.',
  CANDIDATE_PROVENANCE_REQUIRED: 'Không tìm thấy Candidate gắn với source identity.',
  IMPORTED_REFERENCE_MISMATCH: 'Candidate không trỏ đúng Vocabulary/Chapter/Membership.',
  DUPLICATE_DECISION_REQUIRED: 'Cần quyết định duplicate KEEP_SEPARATE.',
  REVIEW_AUDIT_REQUIRED: 'Thiếu audit quyết định review.',
  REVIEW_CONTENT_EVIDENCE_REQUIRED: 'Thiếu snapshot nội dung tại thời điểm review.',
  REVIEW_CONTENT_CHANGED: 'Candidate đã đổi nội dung sau khi được duyệt.',
  REVIEW_AUDIT_CONTENT_MISMATCH: 'Audit review không khớp snapshot candidate.',
  CONFIRM_AUDIT_REQUIRED: 'Thiếu audit Confirm Draft.',
  CONFIRM_REVIEW_SNAPSHOT_MISMATCH: 'Snapshot Confirm không khớp nội dung đã duyệt.',
  IMPORTED_CONTENT_CHANGED: 'Vocabulary Catalog khác nội dung đã được duyệt.',
  PUBLICATION_BLOCKED: 'Backend chặn Publish; hãy xử lý các điều kiện bên dưới.',
  CONCURRENT_MODIFICATION: 'Dữ liệu vừa thay đổi. Tải lại trước khi thao tác tiếp.',
  IDEMPOTENCY_KEY_REUSED: 'Mã retry đã được dùng cho một thao tác khác.',
});

const idOf = (value) => String(value?._id || value || '');
const statusLabel = (value) => ({
  draft: 'Draft', published: 'Published', archived: 'Archived',
  REVIEW_APPROVED: 'Review Approved', REVIEW_REJECTED: 'Review Rejected', NEEDS_REVIEW: 'Needs Review',
}[value] || value || '—');

function newIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.()
    || `v5a-${Date.now()}-${Math.random().toString(36).slice(2, 18)}`;
}

function errorMessage(error) {
  if (!(error instanceof VocabularyPublicationApiError)) return error?.message || 'Publication API thất bại.';
  const blockers = error.details?.blockers || [];
  const labels = blockers.map((code) => BLOCKER_LABELS[code] || code);
  return labels.length ? `${BLOCKER_LABELS[error.code] || error.message} ${labels.join(' ')}` : error.message;
}

function Blockers({ items = [] }) {
  if (!items.length) return <p className="vpub-clear">Đã đủ điều kiện.</p>;
  return <ul className="vpub-blockers">{items.map((code) => <li key={code}>{BLOCKER_LABELS[code] || code}</li>)}</ul>;
}

function StatePill({ value }) {
  const tone = value === 'published' || value === 'REVIEW_APPROVED'
    ? 'good'
    : value === 'archived' || value === 'REVIEW_REJECTED' ? 'quiet' : 'pending';
  return <span className={`vpub-state vpub-state--${tone}`}>{statusLabel(value)}</span>;
}

export default function VocabularyPublicationWorkspace({ catalogApi = vocabularyCatalogApi, publicationApi = vocabularyPublicationApi }) {
  const [tags, setTags] = useState([]);
  const [tagId, setTagId] = useState('');
  const [summary, setSummary] = useState(null);
  const [reviewReason, setReviewReason] = useState('Đã đối chiếu nội dung và quan hệ Catalog.');
  const [busyKey, setBusyKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [candidateDetails, setCandidateDetails] = useState(null);
  const idempotencyKeysRef = useRef(new Map());

  const idempotencyKeyFor = (action, entityId) => {
    const key = `${action}:${entityId}`;
    if (!idempotencyKeysRef.current.has(key)) idempotencyKeysRef.current.set(key, newIdempotencyKey());
    return { key, value: idempotencyKeysRef.current.get(key) };
  };

  const loadTags = useCallback(async () => {
    try {
      const result = await catalogApi.listTags({ page: 1, limit: 100 });
      const items = result.items || [];
      setTags(items);
      setTagId((current) => current && items.some((tag) => idOf(tag) === current) ? current : idOf(items[0]));
    } catch (loadError) {
      setError(loadError?.message || 'Không tải được Tag.');
    }
  }, [catalogApi]);

  const loadSummary = useCallback(async (selectedId = tagId) => {
    if (!selectedId) { setSummary(null); return; }
    setLoading(true);
    setError('');
    try { setSummary(await publicationApi.getTagSummary(selectedId)); }
    catch (loadError) { setSummary(null); setError(errorMessage(loadError)); }
    finally { setLoading(false); }
  }, [publicationApi, tagId]);

  useEffect(() => { loadTags(); }, [loadTags]);
  useEffect(() => { if (tagId) loadSummary(tagId); }, [tagId, loadSummary]);

  const counts = useMemo(() => summary?.counts || {
    vocabularyTotal: 0, reviewed: 0, unreviewed: 0, canPublish: 0, blocked: 0,
  }, [summary]);

  const mutate = async (key, callback, { confirmText = '' } = {}) => {
    if (busyKey) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      const result = await callback();
      setNotice(result?.idempotent ? 'Thao tác trước đã hoàn tất; trạng thái hiện tại đã được xác nhận.' : 'Đã cập nhật trạng thái Publication.');
      await Promise.all([loadSummary(tagId), loadTags()]);
    } catch (operationError) {
      setError(errorMessage(operationError));
      if (operationError?.status === 409) await Promise.all([loadSummary(tagId), loadTags()]);
    } finally { setBusyKey(''); }
  };

  const review = (type, entity) => mutate(`${type}-${idOf(entity)}-review`, () => {
    const body = { expectedVersion: entity.version, decision: 'APPROVE', reason: reviewReason.trim() };
    return type === 'TAG' ? publicationApi.reviewTag(idOf(entity), body) : publicationApi.reviewChapter(idOf(entity), body);
  });

  const publish = (type, entity, membershipId = null) => {
    const requestKey = idempotencyKeyFor(`PUBLISH-${type}`, idOf(entity));
    return mutate(
      `${type}-${idOf(entity)}-publish`,
      async () => {
        const body = { expectedVersion: entity.version, idempotencyKey: requestKey.value, ...(membershipId ? { membershipId } : {}) };
        let result;
        if (type === 'TAG') result = await publicationApi.publishTag(idOf(entity), body);
        else if (type === 'CHAPTER') result = await publicationApi.publishChapter(idOf(entity), body);
        else result = await publicationApi.publishVocabulary(idOf(entity), body);
        idempotencyKeysRef.current.delete(requestKey.key);
        return result;
      },
      { confirmText: `Xuất bản ${type === 'TAG' ? 'Tag' : type === 'CHAPTER' ? 'Chapter' : 'Vocabulary'} “${entity.name || entity.title || entity.word}”?` },
    );
  };

  const archive = (type, entity, membershipId = null) => {
    const action = type === 'VOCABULARY' ? 'HIDE-VOCABULARY' : `ARCHIVE-${type}`;
    const requestKey = idempotencyKeyFor(action, idOf(entity));
    return mutate(
      `${type}-${idOf(entity)}-archive`,
      async () => {
        const body = { expectedVersion: entity.version, idempotencyKey: requestKey.value, ...(membershipId ? { membershipId } : {}) };
        let result;
        if (type === 'TAG') result = await publicationApi.archiveTag(idOf(entity), body);
        else if (type === 'CHAPTER') result = await publicationApi.archiveChapter(idOf(entity), body);
        else result = await publicationApi.hideVocabulary(idOf(entity), body);
        idempotencyKeysRef.current.delete(requestKey.key);
        return result;
      },
      { confirmText: `Ẩn hoặc lưu trữ “${entity.name || entity.title || entity.word}”? Vocabulary, membership và LearningProgress liên quan vẫn được giữ.` },
    );
  };

  const openCandidate = (candidate, row) => setCandidateDetails({ candidate, row });

  return (
    <main className="vpub-page" aria-busy={loading}>
      <header className="vpub-header">
        <div>
          <p className="vpub-eyebrow">Vocabulary · Editorial → Publication</p>
          <h1>Publish có bằng chứng</h1>
          <p>Xuất bản lần lượt Tag → Chapter → Vocabulary. Mỗi bước kiểm tra lại review, phiên bản, quan hệ và audit ở backend.</p>
        </div>
        <div className="vpub-policy"><span aria-hidden="true">●</span><strong>PENDING_PO</strong><small>Prototype cô lập</small></div>
      </header>

      <nav className="vpub-rail" aria-label="Trình tự Publication">
        <span className="vpub-rail__node">Tag <small>Review · Publish</small></span><i aria-hidden="true" />
        <span className="vpub-rail__node">Chapter <small>Đúng Tag · Review · Publish</small></span><i aria-hidden="true" />
        <span className="vpub-rail__node">Vocabulary <small>Candidate · Membership · Audit</small></span>
      </nav>

      <section className="vpub-control-bar">
        <label className="vpub-select"><span>Tag đang kiểm tra</span>
          <select value={tagId} onChange={(event) => setTagId(event.target.value)} disabled={!tags.length}>
            {!tags.length && <option value="">Chưa có Tag</option>}
            {tags.map((tag) => <option value={idOf(tag)} key={idOf(tag)}>{tag.name} · {statusLabel(tag.status)}</option>)}
          </select>
        </label>
        <label className="vpub-review-note"><span>Ghi chú editorial review</span>
          <input value={reviewReason} maxLength={500} onChange={(event) => setReviewReason(event.target.value)} />
        </label>
        <button type="button" className="vpub-button vpub-button--quiet" onClick={() => loadSummary(tagId)} disabled={!tagId || loading || Boolean(busyKey)}>Tải lại</button>
      </section>

      {notice && <div className="vpub-notice" role="status">{notice}</div>}
      {error && <div className="vpub-error" role="alert">{error}<button type="button" onClick={() => setError('')}>Đóng</button></div>}
      {loading && <div className="vpub-statebox" role="status">Đang kiểm tra các điều kiện Publication…</div>}
      {!loading && !summary && !error && <div className="vpub-statebox">Tạo hoặc chọn một Tag để xem trạng thái kiểm duyệt.</div>}

      {!loading && summary && <>
        <section className="vpub-metrics" aria-label="Tổng quan Vocabulary">
          <Metric label="Occurrences" value={counts.vocabularyTotal} />
          <Metric label="Đã review" value={counts.reviewed} />
          <Metric label="Chưa review" value={counts.unreviewed} />
          <Metric label="Có thể Publish" value={counts.canPublish} tone="ready" />
          <Metric label="Bị chặn" value={counts.blocked} tone="blocked" />
        </section>

        <section className="vpub-entity vpub-entity--tag" aria-labelledby="vpub-tag-title">
          <div className="vpub-entity__heading">
            <div><p className="vpub-kicker">Container · không tự mở Vocabulary bên trong</p><h2 id="vpub-tag-title">{summary.tag.name}</h2><small>{summary.tag.slug} · version {summary.tag.version}</small></div>
            <div className="vpub-status-stack"><StatePill value={summary.tag.status} /><StatePill value={summary.review.status} /></div>
          </div>
          <Blockers items={summary.eligibility.blockers} />
          <div className="vpub-actions">
            {summary.tag.status === 'draft' && summary.review.status !== 'REVIEW_APPROVED' && <button type="button" className="vpub-button vpub-button--secondary" disabled={Boolean(busyKey) || !reviewReason.trim()} onClick={() => review('TAG', summary.tag)}>Duyệt Tag</button>}
            {summary.tag.status === 'draft' && <button type="button" className="vpub-button vpub-button--primary" disabled={!summary.eligibility.eligible || Boolean(busyKey)} onClick={() => publish('TAG', summary.tag)}>Publish Tag</button>}
            {summary.tag.status !== 'archived' && <button type="button" className="vpub-button vpub-button--danger" disabled={Boolean(busyKey)} onClick={() => archive('TAG', summary.tag)}>Archive Tag</button>}
          </div>
        </section>

        <section className="vpub-chapters" aria-labelledby="vpub-chapters-title">
          <div className="vpub-section-heading"><div><p className="vpub-kicker">Parent → Child</p><h2 id="vpub-chapters-title">Chapter & Vocabulary</h2></div><span>{summary.counts.chapterTotal} Chapter</span></div>
          {!summary.chapters.length && <div className="vpub-statebox">Tag này chưa có Chapter. Tạo Draft Chapter trong Catalog workspace.</div>}
          {summary.chapters.map((chapterBlock) => <article className="vpub-chapter" key={chapterBlock.entity._id}>
            <div className="vpub-chapter__head">
              <div><p className="vpub-kicker">{chapterBlock.entity.chapterNumber ? `Chapter ${chapterBlock.entity.chapterNumber}` : 'Chapter'}</p><h3>{chapterBlock.entity.title}</h3><small>version {chapterBlock.entity.version} · {chapterBlock.counts.vocabularyTotal} occurrence</small></div>
              <div className="vpub-status-stack"><StatePill value={chapterBlock.entity.status} /><StatePill value={chapterBlock.review.status} /></div>
            </div>
            <div className="vpub-chapter-stats"><span><b>{chapterBlock.counts.reviewed}</b> reviewed</span><span><b>{chapterBlock.counts.unreviewed}</b> unreviewed</span><span><b>{chapterBlock.counts.canPublish}</b> ready</span><span><b>{chapterBlock.counts.blocked}</b> blocked</span></div>
            <Blockers items={chapterBlock.eligibility.blockers} />
            <div className="vpub-actions">
              {chapterBlock.entity.status === 'draft' && chapterBlock.review.status !== 'REVIEW_APPROVED' && <button type="button" className="vpub-button vpub-button--secondary" disabled={Boolean(busyKey) || !reviewReason.trim()} onClick={() => review('CHAPTER', chapterBlock.entity)}>Duyệt Chapter</button>}
              {chapterBlock.entity.status === 'draft' && <button type="button" className="vpub-button vpub-button--primary" disabled={!chapterBlock.eligibility.eligible || Boolean(busyKey)} onClick={() => publish('CHAPTER', chapterBlock.entity)}>Publish Chapter</button>}
              {chapterBlock.entity.status !== 'archived' && <button type="button" className="vpub-button vpub-button--danger" disabled={Boolean(busyKey)} onClick={() => archive('CHAPTER', chapterBlock.entity)}>Archive Chapter</button>}
            </div>

            <div className="vpub-word-list" aria-label={`Vocabulary trong ${chapterBlock.entity.title}`}>
              {chapterBlock.items.length === 0 && <p className="vpub-empty-words">Chưa có membership nào trong Chapter.</p>}
              {chapterBlock.items.map((row) => <div className="vpub-word" key={row.membershipId}>
                <div className="vpub-word__main"><strong>{row.word}</strong><div className="vpub-status-stack"><StatePill value={row.catalogStatus} /><StatePill value={row.reviewStatus} /></div>
                  {row.blockers.length > 0 && <Blockers items={row.blockers} />}
                  <div className="vpub-word__actions">
                    {row.candidate && <button type="button" className="vpub-link-button" onClick={() => openCandidate(row.candidate, row)}>Xem candidate cần xử lý</button>}
                    {row.eligible && <button type="button" className="vpub-button vpub-button--primary vpub-button--small" disabled={Boolean(busyKey)} onClick={() => publish('VOCABULARY', { _id: row.vocabularyId, word: row.word, version: row.version }, row.membershipId)}>Publish Vocabulary</button>}
                    {row.catalogStatus === 'published' && <button type="button" className="vpub-button vpub-button--danger vpub-button--small" disabled={Boolean(busyKey)} onClick={() => archive('VOCABULARY', { _id: row.vocabularyId, word: row.word, version: row.version }, row.membershipId)}>Hide Vocabulary</button>}
                  </div>
                </div>
              </div>)}
            </div>
          </article>)}
        </section>

        <section className="vpub-audit" aria-labelledby="vpub-audit-title">
          <div className="vpub-section-heading"><div><p className="vpub-kicker">Server-recorded transitions</p><h2 id="vpub-audit-title">Publication audit</h2></div><span>{summary.audit.length} sự kiện gần nhất</span></div>
          {summary.audit.length === 0 ? <p className="vpub-audit-empty">Chưa có review hoặc publication event.</p> : <ol>{summary.audit.map((entry) => <li key={entry._id}><span className={`vpub-audit-dot vpub-audit-dot--${entry.action.toLowerCase()}`} /><div><strong>{auditLabel(entry)}</strong><small>{entry.entityType} · {entry.entityId} · actor {entry.actorId}</small>{entry.reason && <p>{entry.reason}</p>}</div><time>{new Date(entry.occurredAt).toLocaleString()}</time></li>)}</ol>}
        </section>
      </>}

      {candidateDetails && <div className="vpub-modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCandidateDetails(null); }}>
        <section className="vpub-candidate-dialog" role="dialog" aria-modal="true" aria-labelledby="vpub-candidate-title">
          <button type="button" className="vpub-dialog-close" aria-label="Đóng chi tiết candidate" onClick={() => setCandidateDetails(null)}>×</button>
          <p className="vpub-kicker">Import provenance · Admin only</p><h2 id="vpub-candidate-title">Candidate review evidence</h2>
          <dl>{Object.entries({
            Vocabulary: candidateDetails.row.word,
            'Candidate ID': candidateDetails.candidate.candidateId,
            'Batch ID': candidateDetails.candidate.batchId,
            'Tệp nguồn': candidateDetails.candidate.sourceFileName,
            'Occurrence': candidateDetails.candidate.sourceOrdinal,
            Validation: candidateDetails.candidate.validationStatus,
            Review: statusLabel(candidateDetails.candidate.reviewStatus),
            Import: candidateDetails.candidate.importStatus,
            'Reviewer ID': candidateDetails.candidate.reviewedBy,
            'Reviewed at': candidateDetails.candidate.reviewedAt ? new Date(candidateDetails.candidate.reviewedAt).toLocaleString() : null,
            'Duplicate decision': candidateDetails.candidate.duplicateDecision,
          }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl>
          <Blockers items={candidateDetails.row.blockers} />
          <button type="button" className="vpub-button vpub-button--secondary" onClick={() => setCandidateDetails(null)}>Đóng</button>
        </section>
      </div>}
    </main>
  );
}

function Metric({ label, value, tone = '' }) {
  return <div className={`vpub-metric${tone ? ` vpub-metric--${tone}` : ''}`}><strong>{value}</strong><span>{label}</span></div>;
}

function auditLabel(entry) {
  if (entry.action === 'EDITORIAL_REVIEW_DECISION') return entry.decision === 'APPROVE' ? 'Editorial review approved' : 'Editorial review rejected';
  if (entry.action === 'PUBLISHED') return 'Published';
  if (entry.action === 'ARCHIVED') return 'Archived';
  return 'Vocabulary hidden';
}
