import {
  calculateEstimatedListeningScore,
  calculateEstimatedReadingScore,
} from './toeicHelper.js';

const TERMINAL_STATUSES = new Set(['submitted', 'completed']);

const revisionMatch = (revision) => revision === 1
  ? { $or: [{ revision: 1 }, { revision: { $exists: false } }] }
  : { revision };

export const resolveAttemptEngine = (attempt, assessment) => {
  const format = assessment?.examFormat;
  const assessmentEngine = format === 'toeic' ? 'toeic' : format === 'standard' ? 'standard' : null;
  const storedEngine = attempt?.engine === 'toeic' || attempt?.engine === 'standard' ? attempt.engine : null;
  if (storedEngine && assessmentEngine && storedEngine !== assessmentEngine) return null;
  return storedEngine || assessmentEngine;
};

const answerIsEmpty = (answer) =>
  answer === undefined || answer === null || answer === '' || (Array.isArray(answer) && answer.length === 0);

const normalizeToeicAnswer = (snapshot, answer) => {
  if (!snapshot) return answer;
  if (snapshot.type !== 'single_choice' && snapshot.type !== 'multiple_choice') return answer;
  const submitted = Array.isArray(answer) ? answer : [answer];
  const allowed = new Set((snapshot.options || []).flatMap((option) => [
    option?.id,
    option?._id?.toString?.(),
    option?.text,
  ].filter((value) => value !== undefined && value !== null).map(String)));
  const values = [...new Set(submitted.map((value) => String(value)).filter((value) => allowed.has(value)))];
  return values;
};

const isStandardCorrect = (snapshot, answer) => {
  if (snapshot.type === 'single_choice') {
    return typeof answer === 'string' && (snapshot.correctAnswers || []).includes(answer);
  }
  if (snapshot.type === 'multiple_choice') {
    const submitted = Array.isArray(answer) ? answer : [answer];
    const submittedSet = new Set(submitted);
    const correctSet = new Set(snapshot.correctAnswers || []);
    return submittedSet.size === correctSet.size && [...submittedSet].every((value) => correctSet.has(value));
  }
  if (snapshot.type === 'fill_blank' || snapshot.type === 'typed_answer') {
    if (typeof answer !== 'string') return false;
    const normalized = answer.trim().toLowerCase();
    return (snapshot.correctAnswers || []).some((value) => String(value).trim().toLowerCase() === normalized);
  }
  return false;
};

const isToeicCorrect = (snapshot, answer) => {
  const values = Array.isArray(answer) ? answer : [answer];
  if (snapshot.type === 'single_choice') {
    // A single-choice answer is only correct when exactly one option was
    // submitted. Do not award credit for a malformed payload containing the
    // correct option plus one or more distractors.
    if (values.length !== 1) return false;
    const value = values[0];
    const chosenTexts = (snapshot.options || [])
      .filter((option) => value === option.id || value === option._id?.toString() || value === option.text)
      .map((option) => option.text);
    return (snapshot.correctAnswers || []).includes(value)
      || (snapshot.correctOptionIds || []).includes(value)
      || chosenTexts.some((text) => (snapshot.correctAnswers || []).includes(text));
  }
  if (snapshot.type === 'multiple_choice') {
    const submitted = new Set(values);
    const correct = new Set(snapshot.correctAnswers || []);
    return submitted.size === correct.size && [...submitted].every((value) => correct.has(value));
  }
  if (snapshot.type === 'fill_blank' || snapshot.type === 'typed_answer') {
    const normalized = String(answer).trim().toLowerCase();
    return (snapshot.correctAnswers || []).some((value) => String(value).trim().toLowerCase() === normalized);
  }
  return false;
};

export const scoreStandardAttempt = (questionSnapshots = [], answers = {}, assessment = null) => {
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;

  for (const snapshot of questionSnapshots) {
    const questionScore = snapshot.score || 1;
    maxScore += questionScore;
    const answer = answers[snapshot.questionId];
    if (answerIsEmpty(answer)) {
      unansweredCount += 1;
    } else if (isStandardCorrect(snapshot, answer)) {
      score += questionScore;
      correctCount += 1;
    } else {
      incorrectCount += 1;
    }
  }

  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const passScore = Number.isFinite(Number(assessment?.passScore))
    ? Number(assessment.passScore)
    : 0;
  return {
    score,
    maxScore,
    scorePercentage: percentage,
    passScore,
    passed: percentage >= passScore,
    correctCount,
    incorrectCount,
    unansweredCount,
  };
};

export const scoreToeicAttempt = (questionSnapshots = [], answers = {}) => {
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;
  let listeningCorrect = 0;
  let listeningTotal = 0;
  let readingCorrect = 0;
  let readingTotal = 0;
  const partBreakdown = Object.fromEntries(
    Array.from({ length: 7 }, (_, index) => [`part${index + 1}`, { correct: 0, total: 0 }])
  );

  for (const snapshot of questionSnapshots) {
    const questionScore = snapshot.score || 1;
    const partNumber = snapshot.toeicPart || 1;
    const isListening = partNumber <= 4;
    maxScore += questionScore;
    if (isListening) listeningTotal += 1;
    else readingTotal += 1;
    const part = partBreakdown[`part${partNumber}`];
    if (part) part.total += 1;

    const answer = answers[snapshot.questionId];
    if (answerIsEmpty(answer)) {
      unansweredCount += 1;
      continue;
    }

    if (isToeicCorrect(snapshot, answer)) {
      score += questionScore;
      correctCount += 1;
      if (isListening) listeningCorrect += 1;
      else readingCorrect += 1;
      if (part) part.correct += 1;
    } else {
      incorrectCount += 1;
    }
  }

  const listeningScore = calculateEstimatedListeningScore(listeningCorrect, listeningTotal || 100);
  const readingScore = calculateEstimatedReadingScore(readingCorrect, readingTotal || 100);
  return {
    score,
    maxScore,
    correctCount,
    incorrectCount,
    unansweredCount,
    toeicBreakdown: {
      listeningCorrect,
      readingCorrect,
      listeningTotal,
      readingTotal,
      listeningScore,
      readingScore,
      estimatedToeicScore: listeningScore + readingScore,
      partBreakdown,
    },
  };
};

export const finalizeAttempt = async ({
  Attempt,
  attempt,
  assessment,
  engine,
  answers,
  revision,
  now = new Date(),
}) => {
  if (TERMINAL_STATUSES.has(attempt.status)) return { kind: 'already_finalized', attempt };
  if (attempt.status !== 'in_progress') return { kind: 'not_active', attempt };

  const expired = now.getTime() >= new Date(attempt.deadlineAt).getTime();
  if (!expired && (!Number.isInteger(revision) || revision !== (attempt.revision || 1))) {
    return { kind: 'revision_conflict', attempt };
  }

  // At and after the deadline, only the last server-persisted answer map is authoritative.
  let proposedAnswers = {};
  if (Array.isArray(answers)) {
    for (const item of answers) {
      if (item?.questionId) proposedAnswers[String(item.questionId)] = item.selectedOptionIds ?? item.answer ?? [];
    }
  } else if (answers && typeof answers === 'object') {
    proposedAnswers = answers;
  }
  const allowedQuestionIds = new Set((attempt.questionSnapshots || []).map((question) => String(question.questionId)));
  const snapshotsById = new Map((attempt.questionSnapshots || []).map((snapshot) => [String(snapshot.questionId), snapshot]));
  const acceptedAnswers = Object.fromEntries(
    Object.entries(proposedAnswers)
      .filter(([questionId]) => allowedQuestionIds.has(String(questionId)))
      .map(([questionId, answer]) => [
        questionId,
        engine === 'toeic' ? normalizeToeicAnswer(snapshotsById.get(String(questionId)), answer) : answer,
      ])
  );
  const finalAnswers = expired
    ? (attempt.answers || {})
    : { ...(attempt.answers || {}), ...acceptedAnswers };
  const scores = engine === 'toeic'
    ? scoreToeicAttempt(attempt.questionSnapshots || [], finalAnswers)
    : scoreStandardAttempt(attempt.questionSnapshots || [], finalAnswers, {
        passScore: attempt.passScore ?? assessment?.passScore ?? 0,
      });
  const deadlineAt = new Date(attempt.deadlineAt);
  const submittedAt = expired ? deadlineAt : now;
  const duration = Math.max(0, Math.round((submittedAt.getTime() - new Date(attempt.startedAt).getTime()) / 1000));
  const set = {
    engine,
    answers: finalAnswers,
    score: scores.score,
    maxScore: scores.maxScore,
    correctCount: scores.correctCount,
    incorrectCount: scores.incorrectCount,
    unansweredCount: scores.unansweredCount,
    duration,
    submittedAt,
    status: engine === 'toeic' ? 'completed' : 'submitted',
    isExpired: expired,
    revision: (attempt.revision || 1) + 1,
  };
  if (engine === 'standard') {
    set.scorePercentage = scores.scorePercentage;
    set.passScore = scores.passScore;
    set.passed = scores.passed;
  } else {
    set.toeicBreakdown = scores.toeicBreakdown;
  }

  const query = {
    _id: attempt._id,
    status: 'in_progress',
    deadlineAt: expired ? { $lte: now } : { $gt: now },
    ...revisionMatch(attempt.revision || 1),
  };
  const finalizedAttempt = await Attempt.findOneAndUpdate(query, { $set: set }, { new: true, runValidators: true });
  if (finalizedAttempt) return { kind: 'finalized', attempt: finalizedAttempt };

  const latest = await Attempt.findById(attempt._id);
  if (latest && TERMINAL_STATUSES.has(latest.status)) return { kind: 'already_finalized', attempt: latest };
  return { kind: 'revision_conflict', attempt: latest || attempt };
};

export const compareAndSwapAttemptAnswers = async ({
  Attempt,
  attempt,
  engine,
  answers,
  flaggedQuestionIds,
  now = new Date(),
}) => {
  const currentRevision = attempt.revision || 1;
  let answersMap = {};
  if (Array.isArray(answers)) {
    for (const item of answers) {
      if (item?.questionId) answersMap[String(item.questionId)] = item.selectedOptionIds ?? item.answer ?? [];
    }
  } else if (answers && typeof answers === 'object') {
    answersMap = answers;
  }
  const knownQuestionIds = new Set((attempt.questionSnapshots || []).map((question) => String(question.questionId)));
  const snapshotsById = new Map((attempt.questionSnapshots || []).map((snapshot) => [String(snapshot.questionId), snapshot]));
  const acceptedAnswers = Object.fromEntries(
    Object.entries(answersMap)
      .filter(([questionId]) => knownQuestionIds.has(String(questionId)))
      .map(([questionId, answer]) => [
        questionId,
        engine === 'toeic' ? normalizeToeicAnswer(snapshotsById.get(String(questionId)), answer) : answer,
      ])
  );
  const mergedAnswers = { ...(attempt.answers || {}), ...acceptedAnswers };
  const acceptedFlags = Array.isArray(flaggedQuestionIds)
    ? [...new Set(flaggedQuestionIds.map(String).filter((questionId) => knownQuestionIds.has(questionId)))]
    : (attempt.flaggedQuestionIds || []);

  const updated = await Attempt.findOneAndUpdate(
    { _id: attempt._id, status: 'in_progress', deadlineAt: { $gt: now }, ...revisionMatch(currentRevision) },
    { $set: { answers: mergedAnswers, flaggedQuestionIds: acceptedFlags, engine, revision: currentRevision + 1 } },
    { new: true, runValidators: true }
  );
  if (updated) return { kind: 'saved', attempt: updated };

  const latest = await Attempt.findById(attempt._id);
  return {
    kind: isTerminalAttempt(latest) ? 'finalized' : 'stale',
    attempt: latest || attempt,
  };
};

export const isTerminalAttempt = (attempt) => TERMINAL_STATUSES.has(attempt?.status);
