import express from 'express';
import {
  getStudents,
  createStudent,
  getStudent,
  approveStudent,
  rejectStudent,
  suspendStudent,
  activateStudent,
  getAdminStats,
} from '../controllers/adminController.js';
import {
  getAdminCourses,
  getAdminCourseById,
  createCourse,
  updateCourse,
  updateCourseStatus,
  reorderCourseLessons,
  deleteCourse,
} from '../controllers/courseController.js';
import { updateLessonStatus, createLesson, updateLesson, deleteLesson } from '../controllers/lessonController.js';
import {
  createMaterial,
  getAdminMaterials,
  getAdminMaterialById,
  updateMaterial,
  deleteMaterial,
} from '../controllers/materialController.js';
import {
  createVocabulary,
  getAdminVocabulary,
  getAdminVocabularyById,
  updateVocabulary,
  deleteVocabulary,
  previewDocxVocabulary,
  confirmDocxVocabularyImport,
} from '../controllers/vocabularyController.js';
import { getAdminStudentProgress } from '../controllers/progressController.js';
import { getAdminStudentAttempts, getAdminReportAssessments } from '../controllers/adminReportingController.js';
import {
  createQuestion,
  getQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  publishPart5BankQuestions,
} from '../controllers/questionController.js';
import {
  createAssessment,
  getAdminAssessments,
  getAdminAssessmentById,
  updateAssessment,
  updateAssessmentStatus,
  deleteAssessment,
} from '../controllers/assessmentController.js';
import { getAdminResults } from '../controllers/adminReportingController.js';
import { verifyToken, checkRole } from '../middlewares/auth.js';
import multer from 'multer';
import { getPrivateUploadDir } from '../utils/uploadConfig.js';
import {
  createSafeDiskStorage,
  createUpload,
  DOCX_UPLOAD_POLICIES,
  GENERAL_UPLOAD_POLICIES,
  MAX_DOCX_IMPORT_BYTES,
  MAX_GENERAL_UPLOAD_BYTES,
  MAX_LESSON_ATTACHMENTS,
} from '../utils/uploadValidation.js';

const router = express.Router();

const lessonUpload = createUpload({
  storage: createSafeDiskStorage({ directory: getPrivateUploadDir, prefix: 'lesson' }),
  policies: GENERAL_UPLOAD_POLICIES,
  maxFileSize: MAX_GENERAL_UPLOAD_BYTES,
  maxFiles: MAX_LESSON_ATTACHMENTS,
});

const materialUpload = createUpload({
  storage: createSafeDiskStorage({ directory: getPrivateUploadDir, prefix: 'material' }),
  policies: GENERAL_UPLOAD_POLICIES,
  maxFileSize: MAX_GENERAL_UPLOAD_BYTES,
  maxFiles: 1,
});

const docxUpload = createUpload({
  storage: multer.memoryStorage(),
  policies: DOCX_UPLOAD_POLICIES,
  maxFileSize: MAX_DOCX_IMPORT_BYTES,
  maxFiles: 1,
});
const handleDocxUpload = docxUpload.single('file', { required: true });

// Require authenticated Admin or Teacher token for admin endpoints
router.use(verifyToken, checkRole('admin', 'teacher'));

// System stats
router.get('/stats', getAdminStats);

// Student management
router.get('/students', getStudents);
router.post('/students', createStudent);
router.get('/students/:id', getStudent);
router.patch('/students/:id/approve', approveStudent);
router.patch('/students/:id/reject', rejectStudent);
router.patch('/students/:id/suspend', suspendStudent);
router.patch('/students/:id/activate', activateStudent);

// Student progress inspector
router.get('/students/:studentId/progress', getAdminStudentProgress);
router.get('/students/:studentId/attempts', getAdminStudentAttempts);

// Course admin endpoints
router.get('/courses', getAdminCourses);
router.get('/courses/:id', getAdminCourseById);
router.post('/courses', createCourse);
router.put('/courses/:id', updateCourse);
router.patch('/courses/:id', updateCourse);
router.patch('/courses/:id/status', updateCourseStatus);
router.put('/courses/:id/reorder-lessons', reorderCourseLessons);
router.delete('/courses/:id', deleteCourse);

// Lesson admin endpoints
router.post('/lessons', lessonUpload.array('attachments', MAX_LESSON_ATTACHMENTS), createLesson);
router.put('/lessons/:id', lessonUpload.array('attachments', MAX_LESSON_ATTACHMENTS), updateLesson);
router.patch('/lessons/:id/status', updateLessonStatus);
router.delete('/lessons/:id', deleteLesson);

// Material admin endpoints
router.post('/materials', materialUpload.single('file'), createMaterial);
router.get('/materials', getAdminMaterials);
router.get('/materials/:id', getAdminMaterialById);
router.put('/materials/:id', materialUpload.single('file'), updateMaterial);
router.patch('/materials/:id', materialUpload.single('file'), updateMaterial);
router.delete('/materials/:id', deleteMaterial);

// Vocabulary admin endpoints
router.post('/vocabulary/import-docx/preview', handleDocxUpload, previewDocxVocabulary);
router.post('/vocabulary/import-docx/confirm', confirmDocxVocabularyImport);
router.post('/vocabulary', createVocabulary);
router.get('/vocabulary', getAdminVocabulary);
router.get('/vocabulary/:id', getAdminVocabularyById);
router.put('/vocabulary/:id', updateVocabulary);
router.patch('/vocabulary/:id', updateVocabulary);
router.delete('/vocabulary/:id', deleteVocabulary);

// Question Bank admin endpoints
router.post('/questions', createQuestion);
router.post('/questions/publish-part5-bank', checkRole('admin'), publishPart5BankQuestions);
router.get('/questions', getQuestions);
router.get('/questions/:id', getQuestionById);
router.put('/questions/:id', updateQuestion);
router.patch('/questions/:id', updateQuestion);
router.delete('/questions/:id', deleteQuestion);

// Assessment (Exercise & Exam) admin endpoints
router.post('/assessments', createAssessment);
router.get('/assessments', getAdminAssessments);
router.get('/assessments/:id', getAdminAssessmentById);
router.put('/assessments/:id', updateAssessment);
router.patch('/assessments/:id', updateAssessment);
router.patch('/assessments/:id/status', updateAssessmentStatus);
router.delete('/assessments/:id', deleteAssessment);

// Admin Results inspector
router.get('/report-assessments', getAdminReportAssessments);
router.get('/results', getAdminResults);

export default router;
