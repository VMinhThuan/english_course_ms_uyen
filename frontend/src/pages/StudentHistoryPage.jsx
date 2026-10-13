import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { assessmentApi } from '../api/assessmentApi.js';

export default function StudentHistoryPage() {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await assessmentApi.getStudentHistory();
      if (res.status === 'success') {
        setAttempts(res.data.history || []);
      }

    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải lịch sử làm bài');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.25rem' }}>
          Lịch Sử Làm Bài Cá Nhân
        </h1>
        <p style={{ fontSize: '0.95rem', color: '#64748B' }}>
          Xem lại các bài tập và đề thi bạn đã thực hiện cùng chi tiết kết quả.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          Đang tải lịch sử...
        </div>
      ) : error ? (
        <div style={{ padding: '1rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '12px' }}>
          {error}
        </div>
      ) : attempts.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
          Bạn chưa nộp bài tập hoặc đề thi nào.
          <div style={{ marginTop: '1rem' }}>
            <Link to="/student/assessments" style={{ color: '#0284C7', fontWeight: 600, textDecoration: 'none' }}>
              Làm bài ngay →
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Tên Bài Đánh Giá</th>
                  <th>Phân Loại</th>
                  <th>Ngày Nộp Bài</th>
                  <th>Điểm Số</th>
                  <th>Tỷ Lệ</th>
                  <th>Kết Quả</th>
                  <th>Thời Gian</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((att) => {
                  const isToeic = att.assessment?.examFormat === 'toeic' || !!att.toeicBreakdown?.estimatedToeicScore;
                  const isPass = att.passed === true;
                  const resultUrl = isToeic ? `/student/toeic/results/${att._id}` : `/student/results/${att._id}`;

                  return (
                    <tr key={att._id}>
                      <td>
                        <strong>{att.assessment?.title || (isToeic ? 'Đề thi TOEIC' : 'Bài đánh giá')}</strong>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            background: isToeic ? '#E0F2FE' : att.assessment?.type === 'exam' ? '#FEE2E2' : '#DCFCE7',
                            color: isToeic ? '#0369A1' : att.assessment?.type === 'exam' ? '#991B1B' : '#166534',
                          }}
                        >
                          {isToeic ? 'TOEIC' : att.assessment?.type === 'exam' ? 'Bài kiểm tra' : 'Bài tập'}
                        </span>
                      </td>
                      <td>{att.submittedAt ? new Date(att.submittedAt).toLocaleString('vi-VN') : '---'}</td>
                      <td>
                        {isToeic && att.toeicBreakdown?.estimatedToeicScore !== undefined ? (
                          <div>
                            <strong style={{ color: '#0284C7' }}>{att.toeicBreakdown.estimatedToeicScore}</strong> / 990
                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                              L: {att.toeicBreakdown.listeningScore ?? 0} | R: {att.toeicBreakdown.readingScore ?? 0}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <strong>{att.score}</strong> / {att.totalScore || att.maxScore}
                          </div>
                        )}
                      </td>
                      <td>
                        <strong style={{ color: isToeic ? '#0284C7' : isPass ? '#166534' : '#991B1B' }}>
                          {att.scorePercentage ?? att.percentage}%
                        </strong>
                      </td>
                      <td>
                        <strong style={{ color: isToeic ? '#166534' : isPass ? '#166534' : '#991B1B' }}>
                          {isToeic ? 'HOÀN THÀNH' : isPass ? 'ĐẠT' : 'CHƯA ĐẠT'}
                        </strong>
                      </td>
                      <td>{att.duration ? `${Math.round(att.duration / 60)} phút` : '---'}</td>
                      <td>
                        <Link
                          to={resultUrl}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '0.4rem 0.8rem',
                            background: isToeic ? '#0F172A' : '#0284C7',
                            color: '#FFFFFF',
                            borderRadius: '6px',
                            textDecoration: 'none',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                          }}
                        >
                          Xem Chi Tiết
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
