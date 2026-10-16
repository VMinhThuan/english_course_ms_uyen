import express from 'express';
import {
  getStudents,
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
} from '../controllers/vocabularyController.js';
import { getAdminStudentProgress } from '../controllers/progressController.js';
import {
  createQuestion,
  getQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
} from '../controllers/questionController.js';
import {
  createAssessment,
  getAdminAssessments,
  getAdminAssessmentById,
  updateAssessment,
  updateAssessmentStatus,
  deleteAssessment,
} from '../controllers/assessmentController.js';
import { getAdminResults } from '../controllers/attemptController.js';
import { verifyToken, checkRole } from '../middlewares/auth.js';
import multer from 'multer';
import { getUploadDir } from '../utils/uploadConfig.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getUploadDir());
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({ storage });

// Require authenticated Admin or Teacher token for admin endpoints
router.use(verifyToken, checkRole('admin', 'teacher'));

// System stats
router.get('/stats', getAdminStats);

// Student management
router.get('/students', getStudents);
router.get('/students/:id', getStudent);
router.patch('/students/:id/approve', approveStudent);
router.patch('/students/:id/reject', rejectStudent);
router.patch('/students/:id/suspend', suspendStudent);
router.patch('/students/:id/activate', activateStudent);

// Student progress inspector
router.get('/students/:studentId/progress', getAdminStudentProgress);

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
router.post('/lessons', upload.array('attachments', 10), createLesson);
router.put('/lessons/:id', upload.array('attachments', 10), updateLesson);
router.patch('/lessons/:id/status', updateLessonStatus);
router.delete('/lessons/:id', deleteLesson);

// Material admin endpoints
router.post('/materials', upload.single('file'), createMaterial);
router.get('/materials', getAdminMaterials);
router.get('/materials/:id', getAdminMaterialById);
router.put('/materials/:id', upload.single('file'), updateMaterial);
router.patch('/materials/:id', upload.single('file'), updateMaterial);
router.delete('/materials/:id', deleteMaterial);

// Vocabulary admin endpoints
router.post('/vocabulary', createVocabulary);
router.get('/vocabulary', getAdminVocabulary);
router.get('/vocabulary/:id', getAdminVocabularyById);
router.put('/vocabulary/:id', updateVocabulary);
router.patch('/vocabulary/:id', updateVocabulary);
router.delete('/vocabulary/:id', deleteVocabulary);

// Question Bank admin endpoints
router.post('/questions', createQuestion);
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
router.get('/results', getAdminResults);

export default router;
