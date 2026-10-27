import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore.js';

// Layouts
import StudentLayout from '../components/layouts/StudentLayout.jsx';
import TeacherLayout from '../components/layouts/TeacherLayout.jsx';
import AdminLayout from '../components/layouts/AdminLayout.jsx';
import PublicLayout from '../components/layouts/PublicLayout.jsx';

// Pages
import LoginPage from '../pages/LoginPage.jsx';
import RegisterPage from '../pages/RegisterPage.jsx';
import AccountStatusPage from '../pages/AccountStatusPage.jsx';
import HomePage from '../pages/HomePage.jsx';
import CourseListPage from '../pages/CourseListPage.jsx';
import CourseDetailPage from '../pages/CourseDetailPage.jsx';
import CheckoutPage from '../pages/CheckoutPage.jsx';
import EnrollCoursePage from '../pages/EnrollCoursePage.jsx';
import MyCoursesPage from '../pages/MyCoursesPage.jsx';
import LessonPage from '../pages/LessonPage.jsx';
import TestPage from '../pages/TestPage.jsx';
import CreateLessonPage from '../pages/CreateLessonPage.jsx';

// Student New Pages
import StudentDashboardPage from '../pages/StudentDashboardPage.jsx';
import StudentAssessmentsPage from '../pages/StudentAssessmentsPage.jsx';
import StudentHistoryPage from '../pages/StudentHistoryPage.jsx';
import StudentResultDetailPage from '../pages/StudentResultDetailPage.jsx';
import StudentProfilePage from '../pages/StudentProfilePage.jsx';
import StudentVocabularyPage from '../pages/StudentVocabularyPage.jsx';
import VocabularyDictationPage from '../pages/VocabularyDictationPage.jsx';
import FlashcardPage from '../pages/FlashcardPage.jsx';
import StudentVocabularyCatalogPage from '../features/vocabulary-catalog/StudentVocabularyCatalogPage.jsx';
import VocabularyCatalogWorkspace from '../features/vocabulary-catalog/VocabularyCatalogWorkspace.jsx';
import AdminVocabularyQuickPage from '../features/vocabulary-catalog/AdminVocabularyQuickPage.jsx';

// Admin Pages
import AdminDashboardPage from '../pages/admin/AdminDashboardPage.jsx';
import AdminCoursesPage from '../pages/admin/AdminCoursesPage.jsx';
import AdminStudentsPage from '../pages/admin/AdminStudentsPage.jsx';
import AdminStudentDetailPage from '../pages/admin/AdminStudentDetailPage.jsx';
import AdminLessonsPage from '../pages/admin/AdminLessonsPage.jsx';
import AdminMaterialsPage from '../pages/admin/AdminMaterialsPage.jsx';
import AdminVocabularyPage from '../pages/admin/AdminVocabularyPage.jsx';
import AdminQuestionsPage from '../pages/admin/AdminQuestionsPage.jsx';
import AdminAssessmentsPage from '../pages/admin/AdminAssessmentsPage.jsx';
import AdminResultsPage from '../pages/admin/AdminResultsPage.jsx';
import AdminStatisticsPage from '../pages/admin/AdminStatisticsPage.jsx';

// Student TOEIC Pages
import StudentToeicLibraryPage from '../pages/StudentToeicLibraryPage.jsx';
import StudentToeicPart1Page from '../pages/StudentToeicPart1Page.jsx';
import StudentToeicPart5BankPage from '../pages/StudentToeicPart5BankPage.jsx';
import StudentPart5Page from '../pages/StudentPart5Page.jsx';
import StudentToeicOverviewPage from '../pages/StudentToeicOverviewPage.jsx';
import StudentToeicExamPage from '../pages/StudentToeicExamPage.jsx';
import StudentToeicResultPage from '../pages/StudentToeicResultPage.jsx';

// Admin TOEIC Pages
import AdminToeicListPage from '../pages/admin/AdminToeicListPage.jsx';
import AdminToeicBuilderPage from '../pages/admin/AdminToeicBuilderPage.jsx';
import AdminToeicPreviewPage from '../pages/admin/AdminToeicPreviewPage.jsx';
import AdminPart1DictationPage from '../pages/admin/AdminPart1DictationPage.jsx';

// Protected Route Component
const ProtectedRoute = ({ children, requiredRole }) => {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasInitializedAuth = useAuthStore((state) => state.hasInitializedAuth);

  if (!hasInitializedAuth) {
    return <div className="auth-session-loading" role="status" aria-label="Đang kiểm tra phiên đăng nhập"><span /></div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role === 'student' && user.status && user.status !== 'active') {
    return <Navigate to="/account-status" replace state={{ status: user.status }} />;
  }

  const canAccessRole = !requiredRole
    || user?.role === requiredRole
    || (requiredRole === 'teacher' && user?.role === 'admin');

  if (!canAccessRole) {
    return <Navigate to={user?.role === 'student' ? '/student/dashboard' : '/admin'} replace />;
  }

  return children;
};



const AdminToeicPart5ImportPage = lazy(() => import('../pages/admin/AdminToeicPart5ImportPage.jsx'));

function AdminVocabularyLanding() {
  const role = useAuthStore((state) => state.user?.role);
  return role === 'admin' ? <Navigate to="/admin/vocabulary/catalog" replace /> : <AdminVocabularyPage />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Home Page */}
      <Route path="/" element={<HomePage />} />

      {/* Auth Pages */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/account-status" element={<AccountStatusPage />} />

      {/* Public Routes */}
      <Route path="courses" element={<CourseListPage />} />
      <Route path="courses/:id" element={<CourseDetailPage />} />

      {/* Student Routes */}
      <Route path="/dashboard" element={<ProtectedRoute requiredRole="student"><Navigate to="/student/dashboard" replace /></ProtectedRoute>} />
      <Route
        path="/student"
        element={
          <ProtectedRoute requiredRole="student">
            <StudentLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/student/dashboard" replace />} />
        <Route path="dashboard" element={<StudentDashboardPage />} />
        <Route path="enroll/:courseId" element={<EnrollCoursePage />} />
        <Route path="my-courses" element={<MyCoursesPage />} />
        <Route path="courses" element={<CourseListPage studentMode />} />
        <Route path="courses/:id" element={<CourseDetailPage />} />
        <Route path="assessments" element={<StudentAssessmentsPage />} />
        <Route path="vocabulary-dictation" element={<VocabularyDictationPage />} />
        <Route path="toeic" element={<StudentToeicLibraryPage />} />
        <Route path="toeic/part-1" element={<StudentToeicPart1Page />} />
        <Route path="toeic/part-5" element={<StudentToeicPart5BankPage />} />
        <Route path="part-1" element={<StudentToeicPart1Page />} />
        <Route path="part-5" element={<StudentPart5Page />} />
        <Route path="toeic/:assessmentId" element={<StudentToeicOverviewPage />} />
        <Route path="toeic/attempt/:attemptId" element={<StudentToeicExamPage />} />
        <Route path="toeic/results/:attemptId" element={<StudentToeicResultPage />} />
        <Route path="history" element={<StudentHistoryPage />} />
        <Route path="results/:attemptId" element={<StudentResultDetailPage />} />
        <Route path="profile" element={<StudentProfilePage />} />
        <Route path="vocabulary" element={<StudentVocabularyPage />} />
        <Route path="vocabulary-catalog" element={<StudentVocabularyCatalogPage />} />
        <Route path="flashcards" element={<FlashcardPage />} />
        <Route path="courses/:courseId/lessons/:lessonId" element={<LessonPage />} />
        <Route path="tests/:testId" element={<TestPage />} />
      </Route>

      {/* Teacher Routes */}
      <Route
        path="/teacher"
        element={
          <ProtectedRoute requiredRole="teacher">
            <TeacherLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/courses" replace />} />
        <Route path="courses" element={<Navigate to="/admin/courses" replace />} />
        <Route path="lessons" element={<Navigate to="/admin/lessons" replace />} />
        <Route path="materials" element={<Navigate to="/admin/materials" replace />} />
        <Route path="lessons/create" element={<CreateLessonPage />} />
        <Route path="lessons/:lessonId/edit" element={<CreateLessonPage />} />
        <Route path="toeic-tests" element={<Navigate to="/admin/toeic-tests" replace />} />
        <Route path="toeic-tests/new" element={<Navigate to="/admin/toeic-tests/new" replace />} />
        <Route path="toeic-tests/:id/edit" element={<Navigate to="/admin/toeic-tests/:id/edit" replace />} />
        <Route path="toeic-tests/:id/preview" element={<Navigate to="/admin/toeic-tests/:id/preview" replace />} />
      </Route>

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute requiredRole="teacher">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="courses" element={<AdminCoursesPage />} />
        <Route path="students" element={<AdminStudentsPage />} />
        <Route path="students/:id" element={<AdminStudentDetailPage />} />
        <Route path="lessons" element={<AdminLessonsPage />} />
        <Route path="part1-dictations" element={<ProtectedRoute requiredRole="admin"><AdminPart1DictationPage /></ProtectedRoute>} />
        <Route path="vocabulary-dictation" element={<ProtectedRoute requiredRole="admin"><VocabularyDictationPage admin /></ProtectedRoute>} />
        <Route path="materials" element={<AdminMaterialsPage />} />
        <Route path="vocabulary" element={<AdminVocabularyLanding />} />
        <Route path="vocabulary/quick" element={<ProtectedRoute requiredRole="admin"><AdminVocabularyQuickPage /></ProtectedRoute>} />
        <Route path="vocabulary/catalog" element={<ProtectedRoute requiredRole="admin"><VocabularyCatalogWorkspace /></ProtectedRoute>} />
        <Route path="vocabulary/import" element={<Navigate to="/admin/vocabulary/catalog" replace />} />
        <Route path="vocabulary/publication" element={<Navigate to="/admin/vocabulary/catalog" replace />} />
        <Route path="questions" element={<AdminQuestionsPage />} />
        <Route path="questions/import-part5" element={<ProtectedRoute requiredRole="admin"><Suspense fallback={<div role="status">Đang tải trang…</div>}><AdminToeicPart5ImportPage /></Suspense></ProtectedRoute>} />
        <Route path="assessments" element={<AdminAssessmentsPage />} />
        <Route path="toeic-tests" element={<AdminToeicListPage />} />
        <Route path="toeic-tests/new" element={<AdminToeicBuilderPage />} />
        <Route path="toeic-tests/:id/edit" element={<AdminToeicBuilderPage />} />
        <Route path="toeic-tests/:id/preview" element={<AdminToeicPreviewPage />} />
        <Route path="results" element={<AdminResultsPage />} />
        <Route path="statistics" element={<AdminStatisticsPage />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default AppRoutes;
