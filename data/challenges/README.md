# Challenge dataset

This directory contains an original, application-ready challenge library for **All Risk No Reward**.

## Contents

| File | Purpose |
| --- | --- |
| `manifest.json` | Dataset version, level files, and expected counts |
| `challenge-set.schema.json` | JSON Schema for validating every level file |
| `easy.json` | 75 short, low-pressure challenges |
| `medium.json` | 75 challenges requiring more time or confidence |
| `hard.json` | 75 substantial effort, creative, and social-courage challenges |
| `extreme.json` | 125 difficult, funny, social, fitness, travel, and creative challenges |
| `nightmare.json` | 127 epic but still same-day challenges |
| `SAFETY.md` | Required product and moderation rules |
| `SOURCES.md` | Research sources and content-origin notes |

Total: **477 original challenges**. Every challenge ends in one session or by the end of the same day.

## Challenge object

```json
{
  "id": "easy-001",
  "title": "Wall Push-Up Starter",
  "prompt": "Do 8 controlled wall push-ups. Keep your body straight and stop if anything hurts.",
  "category": "fitness",
  "estimatedMinutes": 2,
  "timeWindow": "single_session",
  "mode": "solo",
  "ageGroup": "all",
  "requiresConsent": false,
  "intensity": "light"
}
```

IDs are stable and should be stored as completion-history keys. `estimatedMinutes` is estimated active time. `timeWindow` is either `single_session` or `1_day`; multi-day challenges are intentionally excluded.

## Suggested selection flow

1. Load `manifest.json`.
2. Choose only level files allowed by the user's settings.
3. Validate the file against `challenge-set.schema.json`.
4. Filter by age group, consent setting, physical intensity, accessibility needs, time, location, equipment, and ability to finish today.
5. Exclude recently completed challenge IDs.
6. Randomly choose from the remaining candidates.
7. Always show **Skip**, **Swap**, and **Modify** controls with no penalty.
8. Re-check the current challenge against `SAFETY.md` before display if prompts can be edited or generated dynamically.

Difficulty is commitment, effort, planning, or social courage. It is never permission to increase physical danger, humiliation, coercion, illegality, or privacy risk.
