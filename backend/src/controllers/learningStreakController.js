import mongoose from 'mongoose';
import User from '../models/User.js';
import DailyLearningProgress from '../models/DailyLearningProgress.js';
import {
  getDateKeyInTimezone,
  getLearningStreakOverview,
  getUserTimezone,
  shiftDateKey,
  STREAK_MILESTONES,
} from '../services/learningStreakService.js';

const isObjectId = (value) => typeof value === 'string' && /^[\da-f]{24}$/i.test(value);

export const getMyLearningStreak = async (req, res, next) => {
  try {
    const timezone = getUserTimezone(req.user);
    const data = await getLearningStreakOverview(req.user._id, timezone);
    return res.json({ status: 'success', data });
  } catch (error) {
    return next(error);
  }
};

export const getMyLearningStreakCalendar = async (req, res, next) => {
  try {
    const timezone = getUserTimezone(req.user);
    const data = await getLearningStreakOverview(req.user._id, timezone);
    return res.json({ status: 'success', data: { timezone, calendar: data.calendar, milestones: data.milestones } });
  } catch (error) {
    return next(error);
  }
};

export const getMyLearningStreakMilestones = async (req, res, next) => {
  try {
    const data = await getLearningStreakOverview(req.user._id, getUserTimezone(req.user));
    return res.json({ status: 'success', data: data.milestones, available: STREAK_MILESTONES });
  } catch (error) {
    return next(error);
  }
};

const getStudent = async (studentId) => {
  if (!isObjectId(studentId)) return null;
  return User.findOne({ _id: new mongoose.Types.ObjectId(studentId), role: 'student' })
    .select('_id fullName email username timezone')
    .lean();
};

export const getAdminStudentStreak = async (req, res, next) => {
  try {
    const student = await getStudent(req.params.studentId);
    if (!student) return res.status(404).json({ status: 'error', code: 'STUDENT_NOT_FOUND', message: 'Không tìm thấy thông tin học viên.' });
    const data = await getLearningStreakOverview(student._id, getUserTimezone(student));
    return res.json({ status: 'success', data });
  } catch (error) {
    return next(error);
  }
};

export const getAdminStudentStreakCalendar = async (req, res, next) => {
  try {
    const student = await getStudent(req.params.studentId);
    if (!student) return res.status(404).json({ status: 'error', code: 'STUDENT_NOT_FOUND', message: 'Không tìm thấy thông tin học viên.' });
    const timezone = getUserTimezone(student);
    const todayKey = getDateKeyInTimezone(new Date(), timezone);
    const from = typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)
      ? req.query.from
      : shiftDateKey(todayKey, -89);
    const to = typeof req.query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : todayKey;
    const rows = await DailyLearningProgress.find({ student: student._id, localDate: { $gte: from, $lte: to } })
      .select('localDate validStudySeconds targetSeconds completed completedAt activitySeconds')
      .sort({ localDate: 1 })
      .lean();
    return res.json({ status: 'success', data: { timezone, from, to, rows } });
  } catch (error) {
    return next(error);
  }
};

export const getAdminStudentStreakActivity = async (req, res, next) => {
  try {
    const student = await getStudent(req.params.studentId);
    if (!student) return res.status(404).json({ status: 'error', code: 'STUDENT_NOT_FOUND', message: 'Không tìm thấy thông tin học viên.' });
    const timezone = getUserTimezone(student);
    const todayKey = getDateKeyInTimezone(new Date(), timezone);
    const days = Math.min(90, Math.max(7, Number.parseInt(req.query.days, 10) || 30));
    const from = shiftDateKey(todayKey, -(days - 1));
    const rows = await DailyLearningProgress.find({ student: student._id, localDate: { $gte: from, $lte: todayKey } })
      .select('localDate validStudySeconds targetSeconds completed activitySeconds')
      .sort({ localDate: 1 })
      .lean();
    return res.json({ status: 'success', data: { timezone, from, to: todayKey, targetSeconds: 900, rows } });
  } catch (error) {
    return next(error);
  }
};
