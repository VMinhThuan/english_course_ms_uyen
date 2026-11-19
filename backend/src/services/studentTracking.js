import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import LearningActivity from '../models/LearningActivity.js';
import ExerciseSubmission from '../models/ExerciseSubmission.js';

const cleanText = (value, maxLength = 200) => String(value || '').trim().slice(0, maxLength);

export const getHoChiMinhDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const getHoChiMinhDateKeyOffset = (offsetDays, date = new Date()) => {
  const [year, month, day] = getHoChiMinhDateKey(date).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - offsetDays)).toISOString().slice(0, 10);
};

export const getHoChiMinhWeekDateRange = (date = new Date()) => {
  const todayKey = getHoChiMinhDateKey(date);
  const [year, month, day] = todayKey.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return {
    todayKey,
    weekStartDateKey: getHoChiMinhDateKeyOffset(daysSinceMonday, date),
    weekEndDateKey: getHoChiMinhDateKeyOffset(daysSinceMonday - 6, date),
  };
};

export const getSubmissionId = (value) => {
  const provided = cleanText(value, 128);
  return provided || randomUUID();
};

const activityIdForSubmission = (studentId, exerciseType, sourceId, clientSubmissionId) => new mongoose.Types.ObjectId(
  createHash('sha256').update(`${studentId}:${exerciseType}:${sourceId || 'global'}:${clientSubmissionId}`).digest('hex').slice(0, 24),
);

export const recordExerciseSubmission = async ({
  role,
  studentId,
  clientSubmissionId,
  exerciseType,
  sourceId = null,
  sourceTitle = '',
  submittedAt = new Date(),
  total = 0,
  correctCount = 0,
  incorrectCount = 0,
  partialCount = 0,
  unansweredCount = 0,
  correctFieldCount = null,
  totalFieldCount = null,
  metadata = {},
  questions = [],
}) => {
  if (role !== 'student') return null;
  const normalizedSubmissionId = getSubmissionId(clientSubmissionId);
  const studentKey = String(studentId);
  const submissionDocumentId = `${studentKey}:${exerciseType}:${sourceId || 'global'}:${normalizedSubmissionId}`;
  let submission;
  try {
    submission = await ExerciseSubmission.findByIdAndUpdate(
      submissionDocumentId,
      {
        $setOnInsert: {
          _id: submissionDocumentId,
          student: studentId,
          clientSubmissionId: normalizedSubmissionId,
          exerciseType,
          sourceId,
          sourceTitle: cleanText(sourceTitle),
          submittedAt,
          total,
          correctCount,
          incorrectCount,
          partialCount,
          unansweredCount,
          correctFieldCount,
          totalFieldCount,
          metadata,
          questions,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    submission = await ExerciseSubmission.findById(submissionDocumentId);
    if (!submission) throw error;
  }

  const activityId = activityIdForSubmission(studentId, exerciseType, sourceId, normalizedSubmissionId);
  try {
    await LearningActivity.updateOne(
      { _id: activityId },
      {
        $setOnInsert: {
          _id: activityId,
          student: studentId,
          eventType: 'submitted_exercise',
          metadata: {
            submissionId: submission._id,
            exerciseType,
            sourceTitle: cleanText(sourceTitle),
            correctCount,
            total,
          },
          createdAt: submittedAt,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  return submission;
};
