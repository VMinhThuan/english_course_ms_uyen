import mongoose from 'mongoose';

const part1DictationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    audioUrl: {
      type: String,
      required: true,
      trim: true,
    },
    answers: [
      {
        text: {
          type: String,
          required: true,
          trim: true,
          maxlength: 1000,
        },
        order: {
          type: Number,
          required: true,
          min: 1,
        },
      },
    ],
    isVisible: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

part1DictationSchema.index({ isVisible: 1, createdAt: -1 });

const Part1Dictation = mongoose.model('Part1Dictation', part1DictationSchema);

export default Part1Dictation;
