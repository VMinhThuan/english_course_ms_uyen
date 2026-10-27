import express from 'express';
import { listAdminRoadToPart7Readings, listStudentRoadToPart7Readings } from '../controllers/roadToPart7Controller.js';
import { checkRole, requireActiveStudent, verifyToken } from '../middlewares/auth.js';

const adminRouter = express.Router();
adminRouter.use(verifyToken, checkRole('admin', 'teacher'));
adminRouter.get('/', listAdminRoadToPart7Readings);

const studentRouter = express.Router();
studentRouter.use(verifyToken, requireActiveStudent);
studentRouter.get('/', listStudentRoadToPart7Readings);

export { adminRouter as adminRoadToPart7Routes, studentRouter as studentRoadToPart7Routes };
