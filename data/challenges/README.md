# Challenge dataset

This directory contains an original, application-ready challenge library for **All Risk No Reward**.

## Contents

| File | Purpose |
| --- | --- |
| `manifest.json` | Dataset version, level files, and expected counts |
| `challenge-set.schema.json` | JSON Schema for validating every level file |
| `easy.json` | 90 short, funny, social, creative, and low-pressure challenges |
| `medium.json` | 90 challenges requiring more time, teamwork, or confidence |
| `hard.json` | 90 substantial, funny, group, creative, and social-courage challenges |
| `extreme.json` | 125 difficult, funny, social, fitness, travel, and creative challenges |
| `nightmare.json` | 127 epic but still same-day challenges |
| `SAFETY.md` | Required product and moderation rules |
| `SOURCES.md` | Research sources and content-origin notes |
| `VLM_GRADING.md` | Evidence capture and vision-model grading contract |

Total: **522 original challenges**. Every challenge ends in one session or by the end of the same day.

## Challenge object

```json
{
  "id": "easy-001",
  "title": "Wall Push-Up Starter",
  "prompt": "Do 8 controlled wall push-ups. Keep your body straight and stop if anything hurts.",
  "description": "Do 8 controlled wall push-ups. Keep your body straight and stop if anything hurts.",
  "category": "fitness",
  "estimatedMinutes": 2,
  "timeWindow": "single_session",
  "mode": "solo",
  "ageGroup": "all",
  "requiresConsent": false,
  "intensity": "light",
  "verification": {
    "gradeableByVision": true,
    "acceptedEvidence": ["video", "health_app_screenshot", "screenshot"],
    "captureInstructions": "Submit a clear video showing the movement and safe form.",
    "successCriteria": [
      "Evidence corresponds to challenge easy-001: Wall Push-Up Starter.",
      "Eight controlled wall push-ups are visibly attempted."
    ],
    "privacyNotes": "Keep unrelated people and private information out of frame."
  }
}
```

IDs are stable and should be stored as completion-history keys. `estimatedMinutes` is estimated active time. `timeWindow` is either `single_session` or `1_day`; multi-day challenges are intentionally excluded.

Each `verification` object tells the application what evidence to accept and what a vision-language model may actually grade. See [`VLM_GRADING.md`](VLM_GRADING.md) before implementing automated approval.

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
