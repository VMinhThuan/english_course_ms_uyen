import express from 'express';
import {
  getInstructors,
  getInstructorById,
  getInstructorsByCourse,
} from '../controllers/instructorController.js';

const router = express.Router();

router.get('/', getInstructors);
router.get('/course/:courseId', getInstructorsByCourse);
router.get('/:id', getInstructorById);

export default router;


