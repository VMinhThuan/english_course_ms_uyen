import mongoose from 'mongoose';

const learningActivitySchema = new mongoose.Schema(
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
      index: true,
      default: null,
    },
    // Backward-compatible alias for courseId
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      index: true,
      default: null,
    },
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      index: true,
      default: null,
    },
    // Backward-compatible alias for lessonId
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      index: true,
      default: null,
    },
    assessment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      index: true,
      default: null,
    },
    eventType: {
      type: String,
      enum: [
        'started_lesson',
        'resumed_lesson',
        'completed_lesson',
        'submitted_assessment',
        'submitted_test',
        'submitted_exercise',
        'completed_course',
      ],
      required: true,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

learningActivitySchema.pre('save', function (next) {
  if (this.student && !this.userId) this.userId = this.student;
  if (!this.student && this.userId) this.student = this.userId;
  if (this.course && !this.courseId) this.courseId = this.course;
  if (!this.course && this.courseId) this.course = this.courseId;
  if (this.lesson && !this.lessonId) this.lessonId = this.lesson;
  if (!this.lesson && this.lessonId) this.lesson = this.lessonId;
  next();
});

learningActivitySchema.index({ student: 1, createdAt: -1 });
learningActivitySchema.index({ student: 1, course: 1, createdAt: -1 });
learningActivitySchema.index({ course: 1, createdAt: -1 });
learningActivitySchema.index({ lesson: 1, createdAt: -1 });

const LearningActivity = mongoose.model('LearningActivity', learningActivitySchema);

export default LearningActivity;
