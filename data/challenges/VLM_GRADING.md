# VLM evidence and grading contract

Every challenge includes a `verification` object. It defines what evidence the app may accept and what a vision-language model can reasonably observe.

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

Generate the attempt code before capture. Show it in-frame, display it in the app's trusted capture interface, or bind it to trusted upload metadata when practical. Do not use biometric identification.

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

## Evidence handling

- **Images:** inspect the visible result, relevant countable objects, location context, and attempt code. Do not identify people.
- **Videos:** sample the beginning, middle, end, and action-heavy segments. Use temporal counting only when the full action is continuously visible; otherwise mark exact-count criteria uncertain.
- **Screenshots:** use OCR only on the challenge-relevant region. Verify the same-day date where required and ignore unrelated content.
- **Screen recordings:** verify the visible outgoing action or app state without exploring accounts or requesting passwords.
- **Before/after images:** check that the location and camera angle reasonably match and that the requested visible change occurred.
- **Health-app screenshots:** accept Apple Health or an equivalent pedometer/activity summary when the relevant metric and current date are visible. Do not evaluate unrelated health data.

## Audio limitation

A vision-only model cannot reliably verify spoken words or singing. For voice-note, conversation, joke, or song challenges, grade visible performance, duration, waveform, captions, or a redacted sent-message screen. If exact spoken content matters and no trusted transcript is present, return `uncertain`.

## Consent and bystanders

Public location does not equal recording permission. A participant must separately agree to be recorded and separately agree to posting. Keep nonparticipants out of frame or blur them before upload. If a social action happened but the other person did not consent to evidence capture, accept a privacy-safe alternative or return `uncertain`; never treat refusal to be recorded as failure.

## Safety precedence

Visible dangerous execution cannot pass even if the requested outcome appears complete. Add a safety flag and stop automated scoring when evidence shows traffic interference, restricted access, unsafe exercise form, unwanted contact, dangerous tools, sleep deprivation, risky ingestion, blocked exits, or disregard for venue rules.
