import { useId } from 'react';

const FLAME_SHAPES = [
  {
    outer: 'M50 5c3 17-8 27-2 40 3 7 9 10 15 6 5-4 8-10 7-17 10 12 16 25 13 39-3 15-16 25-32 25S19 88 19 71c0-14 8-25 19-36 0 11 5 18 12 20 4-7 4-17 0-25Z',
    inner: 'M51 45c7 10 13 16 11 25-1 8-7 13-14 13-9 0-14-6-13-14 1-7 6-12 11-18 1 5 3 8 5 10 3-5 2-10 0-16Z',
  },
  {
    outer: 'M49 3c7 16-3 28 4 39 4 7 10 9 15 3 4-5 5-11 4-18 12 13 18 26 14 42-4 17-18 27-35 27S17 87 18 68c1-15 10-27 21-39-1 13 4 21 12 23 5-8 5-18-2-29Z',
    inner: 'M51 43c8 11 15 17 12 28-2 8-8 13-15 13-9 0-15-6-14-15 1-7 7-13 12-20 0 6 3 10 5 12 3-6 3-12 0-18Z',
  },
  {
    outer: 'M48 2c8 15 0 28 8 38 4 5 10 7 14 1 4-5 5-12 3-19 13 12 21 27 16 44-5 17-20 28-38 28-20 0-35-12-34-31 1-15 11-28 23-40-1 14 4 22 12 24 5-9 5-20-4-31Z',
    inner: 'M52 42c9 11 16 18 12 30-2 8-9 14-17 14-9 0-15-6-14-16 1-8 7-14 13-21 0 7 2 10 5 13 3-6 3-13 1-20Z',
  },
  {
    outer: 'M47 2c10 14 2 29 10 38 5 6 11 6 15-1 3-6 3-13 1-20 15 11 23 27 18 45-5 18-21 29-40 29-21 0-37-12-36-32 1-16 12-29 25-42-1 15 4 23 12 25 6-9 6-20-5-32Z',
    inner: 'M52 40c10 12 17 20 13 32-3 9-10 15-18 15-10 0-16-7-15-17 1-8 8-15 14-22-1 7 2 11 5 14 4-6 4-14 1-22Z',
  },
  {
    outer: 'M46 1c11 14 4 29 12 38 5 6 11 5 15-2 3-6 3-14 0-21 16 11 25 28 19 47-5 19-22 31-42 31-22 0-39-13-38-34 1-17 13-31 27-44-1 16 3 24 12 26 6-10 6-21-5-34Z',
    inner: 'M52 39c11 12 18 21 14 34-3 10-11 16-20 16-10 0-17-7-16-18 1-9 9-16 15-24-1 8 2 12 5 15 4-7 4-15 2-23Z',
  },
  {
    outer: 'M45 1c12 13 6 29 14 38 6 6 12 4 15-3 3-6 2-14-1-22 17 10 27 28 21 48-6 20-24 32-44 32-23 0-41-14-40-35 1-18 14-32 29-46-1 17 3 25 12 27 7-10 7-22-6-35Z',
    inner: 'M52 38c11 12 19 22 14 36-3 10-11 17-21 17-11 0-18-8-17-19 1-10 10-17 16-25-1 8 2 13 5 16 4-7 5-16 3-25Z',
  },
  {
    outer: 'M44 1c13 12 7 29 15 38 6 6 12 3 15-4 3-7 2-15-2-23 18 10 29 29 22 50-6 20-25 33-45 33-24 0-42-14-41-36 1-18 15-33 30-47-1 17 3 26 13 28 7-11 7-23-7-36Z',
    inner: 'M52 37c12 12 20 23 15 37-4 11-12 18-22 18-11 0-19-8-18-20 1-10 10-18 17-26-1 9 2 14 5 17 5-8 5-17 3-26Z',
  },
];

export default function LearningStreakFlame({ tier = 0 }) {
  const safeTier = Math.max(0, Math.min(7, Number(tier) || 0));
  const shape = FLAME_SHAPES[safeTier - 1] || FLAME_SHAPES[0];
  const gradientId = `learning-flame-gradient-${useId().replace(/:/g, '')}`;
  return (
    <span className={`learning-streak-flame learning-streak-flame--tier-${safeTier}`} aria-label={`Cấp ngọn lửa ${safeTier}`}>
      <svg viewBox="0 0 100 120" role="img" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="30" y1="15" x2="75" y2="105" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--flame-light)" />
            <stop offset="1" stopColor="var(--flame-dark)" />
          </linearGradient>
        </defs>
        <path className="learning-streak-flame__outer" d={shape.outer} fill={`url(#${gradientId})`} />
        <path className="learning-streak-flame__inner" d={shape.inner} />
        {safeTier >= 5 && <path className="learning-streak-flame__accent" d="M16 81c11 8 20 11 27 9M84 81c-10 8-19 11-26 9" />}
        {safeTier >= 7 && <circle className="learning-streak-flame__spark" cx="83" cy="28" r="2.2" />}
      </svg>
    </span>
  );
}
