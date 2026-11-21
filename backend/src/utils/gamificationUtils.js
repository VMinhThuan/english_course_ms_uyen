export const GAMIFICATION_TIMEZONE = process.env.GAMIFICATION_TIMEZONE || 'Asia/Ho_Chi_Minh';

export const QUEST_LEVELS = [
  { level: 1, title: 'Khởi động TOEIC', range: '0–250', description: 'Những từ vựng nền tảng cho người mới bắt đầu.' },
  { level: 2, title: 'Tăng tốc', range: '250–450', description: 'Mở rộng vốn từ trong các tình huống quen thuộc.' },
  { level: 3, title: 'Bứt phá', range: '450–650', description: 'Chinh phục từ vựng thường gặp trong đề thi.' },
  { level: 4, title: 'Chạm đích', range: '650–800+', description: 'Luyện nhóm từ nâng cao để tiến tới 800+.' },
];

export function normalizeTimezone(timezone) {
  if (typeof timezone !== 'string' || !timezone.trim()) return GAMIFICATION_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return timezone;
  } catch {
    return GAMIFICATION_TIMEZONE;
  }
}

export function getDateKey(date = new Date(), timezone = GAMIFICATION_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeTimezone(timezone), year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function dateKeyDistance(laterKey, earlierKey) {
  const later = Date.parse(`${laterKey}T00:00:00Z`);
  const earlier = Date.parse(`${earlierKey}T00:00:00Z`);
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return null;
  return Math.round((later - earlier) / 86400000);
}

export function calculateStreak(completedDates = [], todayKey) {
  const dates = [...new Set(completedDates.filter(Boolean))].sort();
  if (!dates.length) return { currentStreak: 0, longestStreak: 0 };
  let longestStreak = 1;
  let run = 1;
  for (let index = 1; index < dates.length; index += 1) {
    run = dateKeyDistance(dates[index], dates[index - 1]) === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  }
  let currentStreak = 0;
  let cursor = todayKey;
  while (dates.includes(cursor)) {
    currentStreak += 1;
    const [year, month, day] = cursor.split('-').map(Number);
    const previous = new Date(Date.UTC(year, month - 1, day - 1));
    cursor = previous.toISOString().slice(0, 10);
  }
  return { currentStreak, longestStreak: Math.max(longestStreak, currentStreak) };
}

export function normalizeAnswer(value) {
  return String(value ?? '').trim().toLocaleLowerCase('vi');
}

export function classifyVocabularyLevel(vocabulary, index = 0, total = 1) {
  const source = `${vocabulary?.topic || ''} ${vocabulary?.explanation || ''}`.toLowerCase();
  const explicit = source.match(/(?:level|lvl|mức)\s*([1-4])/i);
  if (explicit) return Number(explicit[1]);
  if (/0\s*[-–]\s*250|beginner|easy|cơ bản/.test(source)) return 1;
  if (/250\s*[-–]\s*450|elementary/.test(source)) return 2;
  if (/450\s*[-–]\s*650|intermediate/.test(source)) return 3;
  if (/650\s*[-–]\s*800|advanced|nâng cao/.test(source)) return 4;
  // The existing catalog has no required TOEIC level field. Keep a deterministic,
  // reviewable fallback based on its stable display order so every level has content.
  return Math.min(4, Math.floor((Math.max(0, index) * 4) / Math.max(total, 1)) + 1);
}

export function starsForAccuracy(accuracy) {
  if (accuracy >= 95) return 3;
  if (accuracy >= 90) return 2;
  if (accuracy >= 80) return 1;
  return 0;
}

export function streakBadgeCodes(currentStreak) {
  return [7, 14, 30].filter((day) => currentStreak >= day).map((day) => `STREAK_${day}`);
}
