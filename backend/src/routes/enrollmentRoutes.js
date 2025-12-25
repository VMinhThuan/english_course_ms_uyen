import express from 'express';
import { enrollCourse, getMyCourses } from '../controllers/enrollmentController.js';
import { verifyToken, checkRole } from '../middlewares/auth.js';

const router = express.Router();

router.post('/', verifyToken, checkRole('student'), enrollCourse);
router.get('/my-courses', verifyToken, checkRole('student'), getMyCourses);

export default router;

