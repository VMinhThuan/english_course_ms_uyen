import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../api/adminApi.js';
import { progressApi } from '../../api/progressApi.js';
import './AdminStudentsPage.css';

export default function AdminStudentsPage() {
  // Progress modal state
  const [selectedStudentForProgress, setSelectedStudentForProgress] = useState(null);
  const [progressData, setProgressData] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(false);

  const handleViewProgress = async (student) => {
    setSelectedStudentForProgress(student);
    setLoadingProgress(true);
    setProgressData(null);
    try {
      const res = await progressApi.getStudentProgress(student._id || student.id);
      setProgressData(res.data);
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể tải dữ liệu tiến độ của học viên.');
    } finally {
      setLoadingProgress(false);
    }
  };

  return (
    <div className="admin-page-container">
      {/* Toast Notification Banner */}
      {toastMsg && (
        <div style={{ position: 'fixed', top: '80px', right: '24px', background: '#0284C7', color: '#FFF', padding: '12px 20px', borderRadius: '10px', boxShadow: '0 4px 15px rgba(0,0,0,0.15)', zIndex: 3000, fontWeight: 600 }}>
          ✓ {toastMsg}
        </div>
      )}

      {/* Progress Inspector Modal */}
      {selectedStudentForProgress && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#FFF', borderRadius: '16px', maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0F172A' }}>Tiến Độ Học Tập - {selectedStudentForProgress.fullName}</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>{selectedStudentForProgress.email}</p>
              </div>
              <button onClick={() => setSelectedStudentForProgress(null)} style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>

            {loadingProgress ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>Đang tải dữ liệu tiến độ từ cơ sở dữ liệu MongoDB...</div>
            ) : progressData ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '1.5rem' }}>
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0284C7' }}>{progressData.completionPercentage}%</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Tỷ lệ hoàn thành</div>
                  </div>
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#16A34A' }}>{progressData.completedLessons}/{progressData.totalLessons}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Đã hoàn thành</div>
                  </div>
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#D97706' }}>{progressData.inProgressLessons}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Đang học</div>
                  </div>
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#64748B' }}>{progressData.notStartedLessons}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Chưa học</div>
                  </div>
                </div>

                <h4 style={{ margin: '0 0 0.5rem 0', color: '#334155' }}>Chi tiết từng bài học:</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {progressData.lessons?.length === 0 ? (
                    <div style={{ color: '#94A3B8', fontSize: '0.9rem' }}>Chưa có bài học nào được xuất bản trong hệ thống.</div>
                  ) : (
                    progressData.lessons?.map((les) => (
                      <div key={les._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', borderLeft: les.status === 'completed' ? '4px solid #16A34A' : les.status === 'in_progress' ? '4px solid #D97706' : '4px solid #CBD5E1' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1E293B' }}>{les.title}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{les.course?.title || 'Khóa học'}</div>
                        </div>
                        <div>
                          {les.status === 'completed' && <span style={{ background: '#DCFCE7', color: '#15803D', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>✓ Hoàn thành (100%)</span>}
                          {les.status === 'in_progress' && <span style={{ background: '#FEF3C7', color: '#B45309', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>⏳ Đang học</span>}
                          {les.status === 'not_started' && <span style={{ background: '#F1F5F9', color: '#64748B', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>Chưa mở</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Quản Lý Phê Duyệt & Tiến Độ Học Viên</h1>
          <p className="admin-page-sub">
            Xem danh sách học viên đăng ký, thực hiện phê duyệt tài khoản và theo dõi tiến độ học tập thực tế từ MongoDB.
          </p>
        </div>
      </div>

      {/* Toolbar Filters */}
      <div className="admin-toolbar">
        <input
          type="text"
          className="admin-search-input"
          placeholder="Tìm theo Tên, Email hoặc Số điện thoại..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          className="admin-filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">Tất cả trạng thái</option>
          <option value="PENDING">Chờ phê duyệt (PENDING)</option>
          <option value="ACTIVE">Đã duyệt (ACTIVE)</option>
          <option value="REJECTED">Đã từ chối (REJECTED)</option>
          <option value="SUSPENDED">Tạm khóa (SUSPENDED)</option>
        </select>
      </div>

      {errorMsg && (
        <div style={{ background: '#FEE2E2', color: '#DC2626', padding: '1rem', borderRadius: '10px' }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
          Đang kết nối API lấy danh sách học viên...
        </div>
      ) : (
        <>
          {/* Desktop Data Table View (Visible >=768px) */}
          <div className="admin-table-container">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>Họ & Tên Học Viên</th>
                  <th>Email</th>
                  <th>Số Điện Thoại</th>
                  <th>Ngày Đăng Ký</th>
                  <th>Trạng Thái</th>
                  <th style={{ textAlign: 'right' }}>Thao Tác Phê Duyệt / Tiến Độ</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                      Không tìm thấy học viên nào trong cơ sở dữ liệu.
                    </td>
                  </tr>
                ) : (
                  students.map((student) => (
                    <tr key={student._id || student.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div className="student-card-avatar">{getInitials(student.fullName)}</div>
                          <span style={{ fontWeight: 600, color: '#0F172A' }}>{student.fullName || 'Học viên'}</span>
                        </div>
                      </td>
                      <td>{student.email}</td>
                      <td>{student.phoneNumber || 'N/A'}</td>
                      <td>{student.createdAt ? new Date(student.createdAt).toLocaleDateString('vi-VN') : 'Mới đăng ký'}</td>
                      <td>
                        {student.status === 'pending' && <span className="status-badge pending">Chờ Duyệt (PENDING)</span>}
                        {student.status === 'active' && <span className="status-badge active">Hoạt Động (ACTIVE)</span>}
                        {student.status === 'rejected' && <span className="status-badge rejected">Từ Chối (REJECTED)</span>}
                        {student.status === 'suspended' && <span className="status-badge rejected" style={{ background: '#F3E8FF', color: '#7E22CE' }}>Tạm Khóa (SUSPENDED)</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="action-btn-group" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn-action-approve" style={{ background: '#0284C7' }} onClick={() => handleViewProgress(student)}>
                            📊 Tiến Độ
                          </button>
                          {student.status === 'pending' && (
                            <>
                              <button className="btn-action-approve" onClick={() => handleApprove(student._id || student.id)}>
                                ✓ Duyệt
                              </button>
                              <button className="btn-action-reject" onClick={() => handleReject(student._id || student.id)}>
                                ✕ Từ Chối
                              </button>
                            </>
                          )}
                          {student.status === 'active' && (
                            <button className="btn-action-reject" style={{ background: '#7E22CE' }} onClick={() => handleSuspend(student._id || student.id)}>
                              🔒 Tạm Khóa
                            </button>
                          )}
                          {student.status === 'suspended' && (
                            <button className="btn-action-approve" onClick={() => handleActivate(student._id || student.id)}>
                              🔓 Kích Hoạt Lại
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Touch Card View (Visible <768px) */}
          <div className="admin-mobile-card-list">
            {students.length === 0 ? (
              <div style={{ background: '#FFF', borderRadius: '12px', padding: '2rem', textAlign: 'center', color: '#64748B' }}>
                Không tìm thấy học viên nào.
              </div>
            ) : (
              students.map((student) => (
                <div key={student._id || student.id} className="admin-student-card">
                  <div className="student-card-header">
                    <div className="student-card-user">
                      <div className="student-card-avatar">{getInitials(student.fullName)}</div>
                      <div>
                        <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '1rem' }}>{student.fullName || 'Học viên'}</div>
                        <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Mã: {student._id?.substring(0, 8)}</div>
                      </div>
                    </div>
                    {student.status === 'pending' && <span className="status-badge pending">Chờ Duyệt</span>}
                    {student.status === 'active' && <span className="status-badge active">Hoạt Động</span>}
                    {student.status === 'rejected' && <span className="status-badge rejected">Từ Chối</span>}
                    {student.status === 'suspended' && <span className="status-badge rejected" style={{ background: '#F3E8FF', color: '#7E22CE' }}>Tạm Khóa</span>}
                  </div>

                  <div className="student-card-details">
                    <div><strong>Email:</strong> {student.email}</div>
                    <div><strong>SĐT:</strong> {student.phoneNumber || 'N/A'}</div>
                    <div><strong>Đăng ký:</strong> {student.createdAt ? new Date(student.createdAt).toLocaleDateString('vi-VN') : 'N/A'}</div>
                  </div>

                  <div className="action-btn-group" style={{ marginTop: '0.5rem' }}>
                    <button className="btn-action-approve" style={{ width: '100%', minHeight: '44px', background: '#0284C7' }} onClick={() => handleViewProgress(student)}>
                      📊 Xem Tiến Độ Học Tập
                    </button>
                    {student.status === 'pending' && (
                      <>
                        <button className="btn-action-approve" style={{ flex: 1, minHeight: '44px' }} onClick={() => handleApprove(student._id || student.id)}>
                          ✓ Duyệt Học Viên
                        </button>
                        <button className="btn-action-reject" style={{ flex: 1, minHeight: '44px' }} onClick={() => handleReject(student._id || student.id)}>
                          ✕ Từ Chối
                        </button>
                      </>
                    )}
                    {student.status === 'active' && (
                      <button className="btn-action-reject" style={{ width: '100%', minHeight: '44px', background: '#7E22CE' }} onClick={() => handleSuspend(student._id || student.id)}>
                        🔒 Tạm Khóa Tài Khoản
                      </button>
                    )}
                    {student.status === 'suspended' && (
                      <button className="btn-action-approve" style={{ width: '100%', minHeight: '44px' }} onClick={() => handleActivate(student._id || student.id)}>
                        🔓 Kích Hoạt Lại Tài Khoản
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
