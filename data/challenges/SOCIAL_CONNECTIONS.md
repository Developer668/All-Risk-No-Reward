# Social connections and Instagram contract

Connection challenges scale by difficulty while remaining optional and limited to people the user already knows:

| Level | Typical existing contacts invited | Total target participants including player |
| --- | ---: | ---: |
| Easy | 1 | 2 |
| Medium | 2 | 3 |
| Hard | 3 | 4 |
| Extreme | 5 | 6 |
| Nightmare | Up to 8 | Up to 9 |

The exact range for every challenge is stored in `participants.minimumTotal`, `participants.targetTotal`, and `participants.maximumTotal`.

## Instagram integration

- Do not scrape followers, following lists, group members, school contacts, or address books.
- Do not assume an Instagram personal-account friend-list API or arbitrary outbound-DM API is available. Official API capabilities vary by account type, permission, app review, region, and the user's relationship with the recipient.
- The safe default is user-controlled sharing: generate or copy the proposed message, open the Instagram app or system share sheet, let the user manually choose an existing contact, and require the user to tap Send.
- Never send automatically, schedule repeated follow-ups, discover strangers, rank contacts, or upload a contact list to the challenge service.
- Store challenge ID, target participant count, completion state, and redacted evidence—not handles, profile photos, message history, recipient replies, or social graphs.
- If official Meta messaging capabilities are later used, follow the current Meta Platform Terms, Developer Policies, app-review requirements, rate limits, account-type restrictions, and conversation rules. API access must not broaden who a challenge may contact.

## Contact rules

- A friend, mutual, classmate, coworker, teammate, or group member counts only when the user genuinely recognizes the person and has a normal reason to contact them.
- Romantic invitations target one age-appropriate person already known through friends, school, work, or a shared group. The invitation is private, specific, sent once, and ends after no, uncertainty, silence, or a request for space.
- Never ask users to contact random accounts, scrape a school directory, message a stranger for romance, mass-DM, tag silent members, expose a reply, or treat acceptance as necessary for completing the courage challenge.
- A recipient's participation, recording, and public posting are three separate choices. Any one may be declined or withdrawn.

## Evidence

For DMs, invitations, memes, and reactions, accept a cropped screenshot or screen recording showing only the user's one-time outgoing action and attempt time. Require redaction of names, handles, profile photos, message history, notifications, and all replies. The VLM grades the visible outgoing action, not the recipient's response or relationship.
