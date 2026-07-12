# VLM evidence and grading contract

Every challenge includes a `verification` object. The website accepts only two upload types: `image` and `video`.

- `image` includes camera photos, cropped screenshots, health-app screenshots, and each image in a before/after pair.
- `video` includes camera recordings and screen recordings.

The website does not directly read Apple Health, Instagram, source-control, model-provider, or operating-system telemetry. The grader evaluates only the uploaded pixels and any trusted attempt metadata supplied by the website.

## Attempt package

The application should send the grader:

```json
{
  "challengeId": "easy-001",
  "attemptId": "random-single-use-id",
  "attemptCode": "short-random-code",
  "startedAt": "ISO-8601 timestamp",
  "submittedAt": "ISO-8601 timestamp",
  "evidenceType": "video",
  "evidence": "uploaded media reference",
  "challenge": "full challenge object"
}
```

Generate the attempt code before capture. Show it in-frame, display it in the website's capture interface, or bind it to trusted upload metadata when practical. Do not use biometric identification.

## Grader output

Use a structured response:

```json
{
  "decision": "pass | fail | uncertain",
  "confidence": 0.0,
  "observedCriteria": [],
  "missingCriteria": [],
  "safetyFlags": [],
  "privacyFlags": [],
  "reason": "Short evidence-based explanation"
}
```

`uncertain` is required when the evidence is incomplete, blurry, off-camera, privacy-redacted beyond recognition, too long to sample reliably, dependent on unprocessed audio, or otherwise ambiguous. Uncertain submissions should allow retry, privacy-safe alternate proof, or manual review.

## Image handling

- For a camera photo, inspect the visible result, relevant countable objects, location context, and attempt code. Do not identify people.
- For a screenshot uploaded as an image, use OCR only on the challenge-relevant region. Verify the same-day date where required and ignore unrelated content.
- For before/after images, check that the location and camera angle reasonably match and that the requested visible change occurred.
- For an Apple Health or equivalent activity screenshot uploaded as an image, inspect only the relevant same-day metric and date. Do not evaluate unrelated health data.
- A screenshot of a coding model may support which model name was visibly selected, but it does not prove hidden provider activity or that all code came from that model.

## Video handling

- For camera video, sample the beginning, middle, end, and action-heavy segments. Use temporal counting only when the full action is continuously visible; otherwise mark exact-count criteria uncertain.
- For screen recordings uploaded as video, inspect the visible outgoing action, editor, build, tests, exact displayed model ID, and finished app state without exploring accounts or requesting passwords.
- A screen recording cannot prove an off-screen API call, hidden configuration, or undisclosed model. If the required model ID and relevant interaction are not visibly shown, return `uncertain`.

## Audio limitation

A vision-only model cannot reliably verify spoken words or singing. For voice-note, conversation, joke, or song challenges, grade visible performance, duration, waveform, captions, or a redacted sent-message screenshot uploaded as an image. If exact spoken content matters and no trusted transcript is present, return `uncertain`.

## AI-model challenges

The website does not monitor which model the user actually called. Accept only what the submitted image or video visibly supports:

- exact displayed provider and model ID;
- visible prompt or task specification with secrets removed;
- visible generated output or code changes;
- visible build, tests, and finished result;
- for parameter limits, a visible official model card or provider page.

If the upload shows only the finished code, the VLM may grade the finished program but must mark the required-model criterion `uncertain`.

## Consent and bystanders

Public location does not equal recording permission. A participant must separately agree to be recorded and separately agree to posting. Keep nonparticipants out of frame or blur them before upload. If a social action happened but the other person did not consent to evidence capture, accept a privacy-safe alternative or return `uncertain`; never treat refusal to be recorded as failure.

## Safety precedence

Visible dangerous execution cannot pass even if the requested outcome appears complete. Add a safety flag and stop automated scoring when evidence shows traffic interference, restricted access, unsafe exercise form, unwanted contact, dangerous tools, sleep deprivation, risky ingestion, blocked exits, or disregard for venue rules.
