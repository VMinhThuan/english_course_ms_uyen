import mongoose from 'mongoose';

const materialSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    filePath: {
      type: String,
      default: '',
    },
    originalName: {
      type: String,
      default: '',
      trim: true,
    },
    fileType: {
      type: String,
      default: 'document',
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    allowDownload: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['published', 'hidden'],
      default: 'published',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_document, returned) {
        delete returned.filePath;
        return returned;
      },
    },
  }
);

const Material = mongoose.model('Material', materialSchema);

export default Material;
