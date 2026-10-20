import mongoose from 'mongoose';

const lessonSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      default: '',
    },
    videoUrl: {
      type: String,
      default: '',
    },
    audioUrl: {
      type: String,
      default: '',
    },
    attachments: [
      {
        filename: String,
        originalName: String,
        url: String,
        type: String,
      },
    ],
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    topic: {
      type: String,
      default: 'General',
    },
    // Optional for legacy lessons. No default/backfill is applied to existing records.
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', null],
      default: undefined,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'hidden'],
      default: 'draft',
    },
    order: {
      type: Number,
      default: 0,
    },
    duration: {
      type: Number, // minutes
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

lessonSchema.index({ course: 1, status: 1, order: 1, _id: 1 }, { name: 'lesson_course_status_order' });

const Lesson = mongoose.model('Lesson', lessonSchema);

export default Lesson;

