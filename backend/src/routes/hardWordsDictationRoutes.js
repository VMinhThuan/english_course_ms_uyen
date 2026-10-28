import express from 'express';
import {
  createHardWordsDictation,
  deleteHardWordsDictation,
  getStudentHardWordsDictation,
  importHardWordsDictationSeed,
  listAdminHardWordsDictations,
  listStudentHardWordsDictations,
  setHardWordsDictationVisibility,
  submitStudentHardWordsDictation,
  updateHardWordsDictation,
} from '../controllers/hardWordsDictationController.js';
import { checkRole, requireActiveStudent, verifyToken } from '../middlewares/auth.js';

const adminRouter = express.Router();
adminRouter.use(verifyToken, checkRole('admin'));
adminRouter.get('/', listAdminHardWordsDictations);
adminRouter.post('/import-seed', importHardWordsDictationSeed);
adminRouter.post('/', createHardWordsDictation);
adminRouter.put('/:id', updateHardWordsDictation);
adminRouter.patch('/:id/visibility', setHardWordsDictationVisibility);
adminRouter.delete('/:id', deleteHardWordsDictation);

const studentRouter = express.Router();
studentRouter.use(verifyToken, requireActiveStudent);
studentRouter.get('/', listStudentHardWordsDictations);
studentRouter.get('/:id', getStudentHardWordsDictation);
studentRouter.post('/:id/submit', submitStudentHardWordsDictation);

export { adminRouter as adminHardWordsDictationRoutes, studentRouter as studentHardWordsDictationRoutes };
