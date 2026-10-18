import mongoose from 'mongoose';

const questionGroupSchema = new mongoose.Schema(
  {
    assessment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true,
    },
    partNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 7,
    },
    type: {
      type: String,
      enum: ['single', 'image', 'audio', 'audio_image', 'passage', 'multi_passage', 'audio_passage'],
      default: 'single',
    },
    title: {
      type: String,
      default: '',
    },
    instructions: {
      type: String,
      default: '',
    },
    imageUrl: {
      type: String,
      default: '',
    },
    imageUrls: {
      type: [String],
      default: [],
    },
    imagePageNumbers: {
      type: [Number],
      default: [],
    },
    audioUrl: {
      type: String,
      default: '',
    },
    passages: [
      {
        title: { type: String, default: '' },
        content: { type: String, default: '' },
        imageUrl: { type: String, default: '' },
        imageUrls: { type: [String], default: [] },
        imagePageNumbers: { type: [Number], default: [] },
        order: { type: Number, default: 1 },
      },
    ],
    questionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question',
      },
    ],
    order: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

questionGroupSchema.index({ assessment: 1, partNumber: 1, order: 1 });

const QuestionGroup = mongoose.model('QuestionGroup', questionGroupSchema);

export default QuestionGroup;
