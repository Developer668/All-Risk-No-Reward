# Challenge dataset

This directory contains an original, application-ready challenge library for **All Risk No Reward**.

## Contents

| File | Purpose |
| --- | --- |
| `manifest.json` | Dataset version, level files, and expected counts |
| `challenge-set.schema.json` | JSON Schema for validating every level file |
| `easy.json` | 90 short, funny, social, creative, and low-pressure challenges |
| `medium.json` | 95 challenges requiring more time, teamwork, comedy, or confidence |
| `hard.json` | 100 substantial, funny, group, creative, dress-up, food, and social-courage challenges |
| `extreme.json` | 105 difficult, funny, social, fitness, travel, cosplay, and creative challenges |
| `nightmare.json` | 110 epic, highly filmable, but still same-day challenges |
| `SAFETY.md` | Required product and moderation rules |
| `SOURCES.md` | Research sources and content-origin notes |
| `VLM_GRADING.md` | Evidence capture and vision-model grading contract |
| `SOCIAL_CONNECTIONS.md` | Instagram, messaging, participant-count, and contact-safety contract |

Total: **500 original active challenges**. Every challenge ends in one session or by the end of the same day. Deleted challenge IDs remain listed in `manifest.json` under `retiredChallengeIds` and must not be reused.

The website accepts only `image` and `video` uploads. Screenshots, health summaries, and before/after photos are uploaded as images; screen recordings are uploaded as videos.

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
  "participants": {
    "minimumTotal": 1,
    "targetTotal": 1,
    "maximumTotal": 1
  },
  "ageGroup": "all",
  "requiresConsent": false,
  "intensity": "light",
  "verification": {
    "gradeableByVision": true,
    "acceptedEvidence": ["image", "video"],
    "captureInstructions": "Upload an image or video clearly showing the movement and safe form.",
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

`participants` counts the player plus everyone else involved. Connection challenges scale from one existing contact at Easy to as many as eight existing contacts at Nightmare. See [`SOCIAL_CONNECTIONS.md`](SOCIAL_CONNECTIONS.md); the app should never scrape a personal contact list or automatically send a message.

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
