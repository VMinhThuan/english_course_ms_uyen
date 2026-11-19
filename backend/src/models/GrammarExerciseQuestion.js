import mongoose from 'mongoose';

export const GRAMMAR_EXERCISE_TYPES = ['tense-classification', 'active-to-passive'];

const grammarExerciseQuestionSchema = new mongoose.Schema({
  exerciseType: { type: String, required: true, enum: GRAMMAR_EXERCISE_TYPES },
  number: { type: Number, required: true, min: 1, max: 9999 },
  prompt: { type: String, required: true, trim: true, maxlength: 2000 },
  tense: { type: String, default: '', trim: true, maxlength: 120 },
  sentenceForm: { type: String, default: '', trim: true, maxlength: 80 },
  answer: { type: String, required: true, trim: true, maxlength: 2000 },
  translation: { type: String, default: '', trim: true, maxlength: 2000 },
  sourceWorkbook: { type: String, default: '', trim: true, maxlength: 200 },
  isVisible: { type: Boolean, default: false },
}, { timestamps: true });

grammarExerciseQuestionSchema.index(
  { exerciseType: 1, number: 1 },
  { unique: true, name: 'grammar_exercise_type_number' },
);
grammarExerciseQuestionSchema.index(
  { exerciseType: 1, isVisible: 1, number: 1 },
  { name: 'grammar_exercise_student_list' },
);

const GrammarExerciseQuestion = mongoose.model('GrammarExerciseQuestion', grammarExerciseQuestionSchema);

export default GrammarExerciseQuestion;
