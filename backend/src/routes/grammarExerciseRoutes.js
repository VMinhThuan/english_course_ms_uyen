import express from 'express';
import {
  checkStudentGrammarExercise,
  createAdminGrammarExercise,
  deleteAdminGrammarExercise,
  listAdminGrammarExercises,
  listStudentGrammarExercise,
  setAdminGrammarExerciseVisibility,
  updateAdminGrammarExercise,
} from '../controllers/grammarExerciseController.js';
import { checkRole, requireActiveStudent, verifyToken } from '../middlewares/auth.js';

const adminRouter = express.Router();
adminRouter.use(verifyToken, checkRole('admin'));
adminRouter.get('/', listAdminGrammarExercises);
adminRouter.post('/', createAdminGrammarExercise);
adminRouter.put('/:id', updateAdminGrammarExercise);
adminRouter.patch('/:id/visibility', setAdminGrammarExerciseVisibility);
adminRouter.delete('/:id', deleteAdminGrammarExercise);

const studentRouter = express.Router();
studentRouter.use(verifyToken, requireActiveStudent);
studentRouter.get('/:exerciseType', listStudentGrammarExercise);
studentRouter.post('/:exerciseType/check', checkStudentGrammarExercise);

export { adminRouter as adminGrammarExerciseRoutes, studentRouter as studentGrammarExerciseRoutes };
