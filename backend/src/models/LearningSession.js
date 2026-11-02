import mongoose from 'mongoose';

const learningSessionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Backward-compatible alias for userId
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    // Backward-compatible alias for courseId
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      index: true,
    },
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      required: true,
      index: true,
    },
    // Backward-compatible alias for lessonId
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    lastHeartbeatAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    accumulatedActiveSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'completed'],
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Sync userId/courseId/lessonId aliases on save
learningSessionSchema.pre('save', function (next) {
  if (this.student && !this.userId) this.userId = this.student;
  if (!this.student && this.userId) this.student = this.userId;
  if (this.course && !this.courseId) this.courseId = this.course;
  if (!this.course && this.courseId) this.course = this.courseId;
  if (this.lesson && !this.lessonId) this.lessonId = this.lesson;
  if (!this.lesson && this.lessonId) this.lesson = this.lessonId;
  next();
});

learningSessionSchema.index({ student: 1, lesson: 1, status: 1 });
learningSessionSchema.index({ student: 1, startedAt: -1 });
learningSessionSchema.index({ course: 1, student: 1 });
learningSessionSchema.index({ lesson: 1, startedAt: -1 });

const LearningSession = mongoose.model('LearningSession', learningSessionSchema);

export default LearningSession;
