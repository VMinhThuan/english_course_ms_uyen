import DailyVocabularyChallenge from '../models/DailyVocabularyChallenge.js';
import Vocabulary from '../models/Vocabulary.js';
import VocabularyQuestAttempt from '../models/VocabularyQuestAttempt.js';
import VocabularyQuestProgress from '../models/VocabularyQuestProgress.js';
import { getDateKey } from '../utils/gamificationUtils.js';
import {
  getGamificationConfig,
  getGamificationConfigs,
  getGamificationHistory,
  updateGamificationConfig,
} from '../services/gamificationConfigService.js';
import { previewQuestAssessment } from '../services/gamificationService.js';

export async function getConfigs(req, res, next) {
  try {
    return res.json({ status: 'success', data: { configs: await getGamificationConfigs() } });
  } catch (error) { return next(error); }
}

export async function updateConfig(req, res, next) {
  try {
    const config = await updateGamificationConfig(req.params.game, req.body || {}, req.user._id || req.user.id);
    return res.json({ status: 'success', data: { config } });
  } catch (error) { return next(error); }
}

const publishedVocabularyFilter = {
  $or: [
    { catalogOnly: { $ne: true }, status: 'published' },
    { catalogOnly: true, catalogStatus: 'published' },
  ],
};

const stageForVocabulary = (config, vocabularyId) => config.questStages?.find((item) => item.vocabularyIds?.some((id) => String(id) === String(vocabularyId)));

export async function getGamificationVocabulary(req, res, next) {
  try {
    const { level, search = '', stage, page = 1, limit = 50 } = req.query;
    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.min(100, Math.max(1, Number(limit) || 50));
    const filter = { ...publishedVocabularyFilter };
    if (level === 'unclassified') filter.toeicLevel = null;
    else if (level) filter.toeicLevel = Number(level);
    if (search.trim()) filter.$and = [{ $or: [{ word: { $regex: search.trim(), $options: 'i' } }, { meaning: { $regex: search.trim(), $options: 'i' } }] }];
    const questConfig = await getGamificationConfig('quest');
    if (stage) {
      const stageDefinition = questConfig.questStages?.find((item) => item.stage === Number(stage) && (!level || item.level === Number(level)));
      filter._id = { $in: stageDefinition?.vocabularyIds || [] };
    }
    const [total, vocabulary, grouped] = await Promise.all([
      Vocabulary.countDocuments(filter),
      Vocabulary.find(filter).select('word meaning topic toeicLevel status catalogOnly catalogStatus').sort({ toeicLevel: 1, word: 1 }).skip((pageNumber - 1) * limitNumber).limit(limitNumber).lean(),
      Vocabulary.aggregate([{ $match: publishedVocabularyFilter }, { $group: { _id: '$toeicLevel', count: { $sum: 1 } } }]),
    ]);
    const counts = { unclassified: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    grouped.forEach((item) => { counts[item._id || 'unclassified'] = item.count; });
    return res.json({ status: 'success', data: { vocabulary: vocabulary.map((item) => ({ ...item, stage: stageForVocabulary(questConfig, item._id)?.stage || null })), counts, pagination: { total, page: pageNumber, pages: Math.ceil(total / limitNumber) || 1, limit: limitNumber } } });
  } catch (error) { return next(error); }
}

export async function updateGamificationVocabulary(req, res, next) {
  try {
    const vocabulary = await Vocabulary.findOne({ _id: req.params.id, ...publishedVocabularyFilter });
    if (!vocabulary) return res.status(404).json({ status: 'error', message: 'Không tìm thấy vocabulary đã publish.' });
    const rawLevel = req.body?.toeicLevel;
    const nextLevel = rawLevel === null || rawLevel === '' || rawLevel === undefined ? null : Number(rawLevel);
    if (nextLevel !== null && ![1, 2, 3, 4].includes(nextLevel)) return res.status(400).json({ status: 'error', message: 'TOEIC level phải từ 1 đến 4 hoặc để trống.' });
    const rawStage = req.body?.stage;
    const nextStage = rawStage === null || rawStage === '' || rawStage === undefined ? null : Number(rawStage);
    if (nextStage !== null && ![1, 2, 3, 4].includes(nextStage)) return res.status(400).json({ status: 'error', message: 'Stage phải từ 1 đến 4 hoặc để trống.' });
    if (nextStage !== null && nextLevel === null) return res.status(400).json({ status: 'error', message: 'Cần chọn TOEIC level trước khi gán stage.' });
    vocabulary.toeicLevel = nextLevel;
    await vocabulary.save();

    const questConfig = await getGamificationConfig('quest');
    const assignments = (questConfig.questStages || []).map((item) => ({ level: item.level, stage: item.stage, vocabularyIds: (item.vocabularyIds || []).filter((id) => String(id) !== String(vocabulary._id)) }));
    if (nextStage !== null) {
      const target = assignments.find((item) => item.level === nextLevel && item.stage === nextStage);
      if (target) target.vocabularyIds.push(String(vocabulary._id));
      else assignments.push({ level: nextLevel, stage: nextStage, vocabularyIds: [String(vocabulary._id)] });
    }
    await updateGamificationConfig('quest', { stageAssignments: assignments }, req.user._id || req.user.id);
    return res.json({ status: 'success', data: { vocabulary: { ...vocabulary.toObject(), stage: nextStage } } });
  } catch (error) { return next(error); }
}

export async function getGamificationAnalytics(req, res, next) {
  try {
    const streakConfig = await getGamificationConfig('streak');
    const todayKey = getDateKey(new Date(), streakConfig.timezone);
    const [dailySummary, dailyParticipants, questParticipants, questRates, averageAccuracy, progression] = await Promise.all([
      DailyVocabularyChallenge.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      DailyVocabularyChallenge.distinct('student'),
      VocabularyQuestAttempt.distinct('student'),
      VocabularyQuestAttempt.aggregate([{ $match: { status: 'submitted' } }, { $group: { _id: '$level', attempts: { $sum: 1 }, passed: { $sum: { $cond: ['$passed', 1, 0] } } } }]),
      VocabularyQuestAttempt.aggregate([{ $match: { status: 'submitted' } }, { $group: { _id: null, average: { $avg: '$accuracy' } } }]),
      VocabularyQuestProgress.aggregate([{ $unwind: '$levels' }, { $group: { _id: '$levels.level', unlocked: { $sum: { $cond: ['$levels.unlocked', 1, 0] } }, completed: { $sum: { $cond: ['$levels.completed', 1, 0] } } } }]),
    ]);
    const totals = dailySummary.reduce((result, item) => ({ ...result, [item._id]: item.count }), {});
    const levelCompletion = [1, 2, 3, 4].map((level) => {
      const rate = questRates.find((item) => item._id === level);
      const progress = progression.find((item) => item._id === level);
      return { level, attempts: rate?.attempts || 0, passed: rate?.passed || 0, completionRate: rate?.attempts ? Math.round((rate.passed / rate.attempts) * 100) : 0, unlockedLearners: progress?.unlocked || 0, completedLearners: progress?.completed || 0 };
    });
    const activeToday = new Set([
      ...(await DailyVocabularyChallenge.distinct('student', { dateKey: todayKey })),
      ...(await VocabularyQuestAttempt.distinct('student', { createdAt: { $gte: new Date(Date.now() - 86400000) } })),
    ]);
    return res.json({ status: 'success', data: { timezone: streakConfig.timezone, totalParticipatingLearners: new Set([...dailyParticipants.map(String), ...questParticipants.map(String)]).size, dailyActiveLearners: activeToday.size, challengeCompletionRate: totals.in_progress || totals.completed ? Math.round(((totals.completed || 0) / ((totals.completed || 0) + (totals.in_progress || 0))) * 100) : 0, averageAssessmentAccuracy: Math.round(averageAccuracy[0]?.average || 0), levelCompletion } });
  } catch (error) { return next(error); }
}

export async function getConfigHistory(req, res, next) {
  try { return res.json({ status: 'success', data: { history: await getGamificationHistory(req.query.limit) } }); }
  catch (error) { return next(error); }
}

export async function previewQuest(req, res, next) {
  try { return res.json({ status: 'success', data: { preview: await previewQuestAssessment(req.query.level, req.query.stage) } }); }
  catch (error) { return next(error); }
}
