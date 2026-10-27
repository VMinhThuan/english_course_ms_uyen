import PageHeader from '../components/ui/PageHeader.jsx';
import './VocabularyDictationPage.css';

export default function VocabularyDictationPage({ admin = false }) {
  return (
    <div className="vocabulary-dictation-page">
      <PageHeader
        eyebrow={admin ? 'Quản trị bài tập' : 'Luyện tập'}
        title="Chép chính tả từ vựng"
        description="Khu vực luyện nghe và chép từ vựng sẽ được cập nhật sau khi có bộ dữ liệu Excel."
      />
      <section className="vocabulary-dictation-placeholder" aria-labelledby="vocabulary-dictation-placeholder-title">
        <span className="vocabulary-dictation-placeholder__icon" aria-hidden="true">Aa</span>
        <div>
          <h2 id="vocabulary-dictation-placeholder-title">Nội dung đang được chuẩn bị</h2>
          <p>
            {admin
              ? 'Trang này đã được tạo để dành chỗ cho bộ chép chính tả từ vựng. Có thể nạp dữ liệu sau khi nhận file Excel.'
              : 'Bộ chép chính tả từ vựng sẽ xuất hiện tại đây sau khi dữ liệu được cập nhật.'}
          </p>
        </div>
      </section>
    </div>
  );
}
