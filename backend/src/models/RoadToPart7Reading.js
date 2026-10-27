import mongoose from 'mongoose';

const roadToPart7ReadingSchema = new mongoose.Schema({
  sourceKey: { type: String, required: true, trim: true, unique: true },
  sourceWorkbook: { type: String, trim: true, default: '' },
  sourceRow: { type: Number, min: 1 },
  order: { type: Number, required: true, min: 1 },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  englishText: { type: String, required: true, trim: true, maxlength: 30000 },
  bilingualPairs: [
    {
      english: { type: String, required: true, trim: true, maxlength: 4000 },
      vietnamese: { type: String, required: true, trim: true, maxlength: 4000 },
      order: { type: Number, required: true, min: 1 },
    },
  ],
  isPublished: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

roadToPart7ReadingSchema.index({ isPublished: 1, order: 1 }, { name: 'road_to_part7_student_list' });

const RoadToPart7Reading = mongoose.model('RoadToPart7Reading', roadToPart7ReadingSchema);

export default RoadToPart7Reading;
