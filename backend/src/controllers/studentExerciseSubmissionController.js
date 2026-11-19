import ExerciseSubmission from '../models/ExerciseSubmission.js';

export const getMyExerciseSubmissions = async (req, res, next) => {
  try {
    const filter = { student: req.user._id };
    const submissions = await ExerciseSubmission.find(filter)
      .select('-student')
      .sort({ submittedAt: -1, _id: -1 })
      .lean();

    return res.json({
      status: 'success',
      data: {
        submissions,
        total: submissions.length,
      },
    });
  } catch (error) {
    return next(error);
  }
};
