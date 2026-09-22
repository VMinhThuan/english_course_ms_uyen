import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      sparse: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    thumbnail: {
      type: String,
      default: '',
    },
    image: {
      type: String,
      default: '',
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    price: {
      type: Number,
      default: 0,
    },
    discountedPrice: {
      type: Number,
      default: null,
    },
    discount: {
      type: Number,
      default: 0,
    },
    level: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced'],
      required: true,
    },
    category: {
      type: String,
      default: 'general',
      enum: ['reading', 'writing', 'speaking', 'listening', 'all-skills', 'general', 'business'],
    },
    englishType: {
      type: String,
      enum: ['TOEIC', 'IELTS', 'TOEFL', 'General', 'Business'],
      required: true,
    },
    skills: [{
      type: String,
    }],
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingCount: {
      type: Number,
      default: 0,
    },
    modules: {
      type: Number,
      default: 0,
    },
    hoursLeft: {
      type: Number,
      default: 0,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Index for search and filtering
courseSchema.index({ title: 'text', description: 'text' });
courseSchema.index({ englishType: 1, level: 1, category: 1 });
courseSchema.index({ slug: 1 });

const Course = mongoose.model('Course', courseSchema);

export default Course;

