import dotenv from 'dotenv';
import connectDB from '../configs/database.js';
import DailyLearningProgress from '../models/DailyLearningProgress.js';
import LearningSessionHeartbeat from '../models/LearningSessionHeartbeat.js';
import LearningStreak from '../models/LearningStreak.js';

dotenv.config();

await connectDB();
await Promise.all([
  DailyLearningProgress.createIndexes(),
  LearningSessionHeartbeat.createIndexes(),
  LearningStreak.createIndexes(),
]);
console.log('Learning streak indexes are ready.');
process.exit(0);
