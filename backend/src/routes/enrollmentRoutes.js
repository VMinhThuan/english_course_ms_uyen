import express from 'express';
import { enrollCourse, getMyCourses } from '../controllers/enrollmentController.js';
import { verifyToken, requireActiveStudent } from '../middlewares/auth.js';

const router = express.Router();

router.post('/', verifyToken, requireActiveStudent, enrollCourse);
router.get('/my-courses', verifyToken, requireActiveStudent, getMyCourses);

export default router;

