import GamificationConfig from '../models/GamificationConfig.js';
import GamificationConfigChange from '../models/GamificationConfigChange.js';
import Vocabulary from '../models/Vocabulary.js';

export const DEFAULT_GAMIFICATION_CONFIGS = {
  streak: { game: 'streak', enabled: true, dailyWordCount: 20, timezone: 'Asia/Ho_Chi_Minh' },
  quest: { game: 'quest', enabled: true, passThreshold: 80, timeLimitSeconds: 120, questionCount: 10, levelCount: 4, questStages: [] },
};

const publishedVocabularyFilter = {
  $or: [
    { catalogOnly: { $ne: true }, status: 'published' },
    { catalogOnly: true, catalogStatus: 'published' },
  ],
};

const normalizeStageAssignments = async (assignments) => {
  if (!Array.isArray(assignments) || assignments.length > 16) {
    const error = new Error('Stage assignments không hợp lệ.');
    error.statusCode = 400;
    throw error;
  }
  const normalized = [];
  const seen = new Set();
  for (const item of assignments) {
    const level = Number(item?.level);
    const stage = Number(item?.stage);
    const vocabularyIds = [...new Set((Array.isArray(item?.vocabularyIds) ? item.vocabularyIds : []).map(String))];
    if (![1, 2, 3, 4].includes(level) || ![1, 2, 3, 4].includes(stage)) {
      const error = new Error('Cấp độ hoặc chặng Quest không hợp lệ.');
      error.statusCode = 400;
      throw error;
    }
    const key = `${level}:${stage}`;
    if (seen.has(key)) {
      const error = new Error('Không được lặp cấp độ/chặng Quest.');
      error.statusCode = 400;
      throw error;
    }
    seen.add(key);
    if (vocabularyIds.some((id) => !/^[a-f\d]{24}$/i.test(id))) {
      const error = new Error('Vocabulary ID trong stage không hợp lệ.');
      error.statusCode = 400;
      throw error;
    }
    if (vocabularyIds.length) {
      const matching = await Vocabulary.countDocuments({ ...publishedVocabularyFilter, _id: { $in: vocabularyIds }, toeicLevel: level });
      if (matching !== vocabularyIds.length) {
        const error = new Error('Stage chỉ được gán vocabulary đã publish và đúng TOEIC level.');
        error.statusCode = 400;
        throw error;
      }
    }
    normalized.push({ level, stage, vocabularyIds });
  }
  return normalized;
};

export async function getGamificationConfig(game) {
  const defaults = DEFAULT_GAMIFICATION_CONFIGS[game];
  if (!defaults) throw new Error(`Unknown gamification game: ${game}`);
  let config = await GamificationConfig.findOne({ game }).lean();
  if (config) return { ...defaults, ...config };
  try {
    config = await GamificationConfig.create(defaults);
  } catch (error) {
    if (error?.code !== 11000) throw error;
    config = await GamificationConfig.findOne({ game }).lean();
  }
  return { ...defaults, ...(config?.toObject?.() || config || {}) };
}

export async function getGamificationConfigs() {
  return Promise.all(Object.keys(DEFAULT_GAMIFICATION_CONFIGS).map((game) => getGamificationConfig(game)));
}

export async function updateGamificationConfig(game, payload = {}, changedBy) {
  const defaults = DEFAULT_GAMIFICATION_CONFIGS[game];
  if (!defaults) {
    const error = new Error('Mini game không hợp lệ.');
    error.statusCode = 400;
    throw error;
  }
  const update = {};
  if (payload.enabled !== undefined) update.enabled = Boolean(payload.enabled);
  if (game === 'quest' && payload.timeLimitSeconds !== undefined) {
    const timeLimitSeconds = Number(payload.timeLimitSeconds);
    if (!Number.isInteger(timeLimitSeconds) || timeLimitSeconds < 60 || timeLimitSeconds > 600) {
      const error = new Error('Thời lượng Quest phải từ 60 đến 600 giây.');
      error.statusCode = 400;
      throw error;
    }
    update.timeLimitSeconds = timeLimitSeconds;
  }
  if (game === 'quest' && payload.stageAssignments !== undefined) {
    update.questStages = await normalizeStageAssignments(payload.stageAssignments);
  }
  const before = await getGamificationConfig(game);
  const config = await GamificationConfig.findOneAndUpdate(
    { game },
    { $set: update, $setOnInsert: { game } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
  ).lean();
  const after = { ...defaults, ...config };
  if (changedBy) await GamificationConfigChange.create({ game, changedBy, before, after });
  return after;
}

export async function getGamificationHistory(limit = 20) {
  return GamificationConfigChange.find().sort({ createdAt: -1 }).limit(Math.min(100, Math.max(1, Number(limit) || 20))).populate('changedBy', 'fullName email role').lean();
}
