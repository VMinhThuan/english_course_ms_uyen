import mongoose from 'mongoose';

const enrollmentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    progress: {
      completedLessons: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Lesson',
        },
      ],
      completedTests: [
        {
          test: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Test',
          },
          score: Number,
          submittedAt: Date,
        },
      ],
      overallProgress: {
        type: Number,
        default: 0, // percentage
      },
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate enrollments
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });

const Enrollment = mongoose.model('Enrollment', enrollmentSchema);

export default Enrollment;

