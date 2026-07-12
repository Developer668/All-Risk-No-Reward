Original prompt: randomly if the user finishes too fast it will give the user a bonus challenge that if they do it then they can either get a lifeline or if the game is not messing with the user ramdomly give them nothing saying that haha you get nothing this time jokes on u or smth. Add this feature quickly also.

- 2026-07-12: Located the completion, recovery, local persistence, and remote snapshot flows.
- Decision: a full completion submitted within the challenge's estimated duration is "fast"; fast finishes get one persisted 45% bonus-offer roll.
- Decision: finishing the bonus has a persisted 50/50 outcome: one usable recovery lifeline or a playful no-reward result.
- 2026-07-12: Implemented per-user browser persistence, fast-finish eligibility, one-time offer/reward rolls, four bonus tasks, reward/no-reward reveal UI, banked lifeline display, and recovery redemption.
- 2026-07-12: The full check exposed an existing recovery-view mismatch (an open recovery returned `partial` instead of `blocked`); aligned the view status with the existing immediate-lock test and UI.
- 2026-07-12: All 26 unit tests, lint, TypeScript, and production build pass. Added a focused browser smoke test for offer, both reward branches, persistence, and lifeline redemption.
- 2026-07-12: Focused browser smoke passed all four flows with no console errors. Visually inspected desktop bonus/reward states and the 390×844 bonus modal; layout and copy render correctly.
- Final verification: `npm run check` passes (26 tests, lint, TypeScript, production build). No known TODOs for this feature.
