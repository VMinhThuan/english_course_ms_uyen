import mongoose from 'mongoose';

const part2ChallengeQuestionSchema = new mongoose.Schema({
  number: { type: Number, required: true, min: 1, max: 110 },
  questionText: { type: String, required: true, trim: true, maxlength: 1000 },
  choices: [{
    _id: false,
    letter: { type: String, required: true, enum: ['A', 'B', 'C'] },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
  }],
  correctAnswer: { type: String, required: true, enum: ['A', 'B', 'C'] },
  script: { type: String, required: true, trim: true, maxlength: 4000 },
  translation: { type: String, required: true, trim: true, maxlength: 4000 },
  audioFilename: { type: String, required: true, trim: true },
  audioUrl: { type: String, default: '', trim: true },
  isVisible: { type: Boolean, default: true },
}, { timestamps: true });

part2ChallengeQuestionSchema.index({ number: 1 }, { unique: true, name: 'part2_challenge_question_number' });
part2ChallengeQuestionSchema.index({ isVisible: 1, number: 1 }, { name: 'part2_challenge_student_list' });

const Part2ChallengeQuestion = mongoose.model('Part2ChallengeQuestion', part2ChallengeQuestionSchema);

export default Part2ChallengeQuestion;
