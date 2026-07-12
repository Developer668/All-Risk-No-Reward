# Challenge dataset

This directory contains an original, application-ready challenge library for **All Risk No Reward**.

## Contents

| File | Purpose |
| --- | --- |
| `manifest.json` | Dataset version, level files, and expected counts |
| `challenge-set.schema.json` | JSON Schema for validating every level file |
| `easy.json` | 50 short, low-pressure challenges |
| `medium.json` | 50 challenges requiring more time or confidence |
| `hard.json` | 50 substantial effort, creative, and social-courage challenges |
| `extreme.json` | 50 major but bounded challenges |
| `nightmare.json` | 50 epic or multi-day challenges |
| `SAFETY.md` | Required product and moderation rules |
| `SOURCES.md` | Research sources and content-origin notes |

Total: **250 challenges**.

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

IDs are stable and should be stored as completion-history keys. `estimatedMinutes` is estimated active time, while `timeWindow` describes how long the user may have to finish a streak or multi-day challenge.

## Suggested selection flow

1. Load `manifest.json`.
2. Choose only level files allowed by the user's settings.
3. Validate the file against `challenge-set.schema.json`.
4. Filter by age group, consent setting, physical intensity, accessibility needs, time, location, and equipment.
5. Exclude recently completed challenge IDs.
6. Randomly choose from the remaining candidates.
7. Always show **Skip**, **Swap**, and **Modify** controls with no penalty.
8. Re-check the current challenge against `SAFETY.md` before display if prompts can be edited or generated dynamically.

Difficulty is commitment, effort, planning, or social courage. It is never permission to increase physical danger, humiliation, coercion, illegality, or privacy risk.

