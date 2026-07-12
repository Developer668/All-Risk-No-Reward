# All Risk, No Reward — Design System

## Product Context

- Product: A consent-first daily social courage challenge app.
- Audience: Young adults who want a playful structure for practicing social confidence.
- UX goal: Make one uncomfortable-but-healthy action feel specific, possible, and worth celebrating.
- Brand attributes: audacious, warm, candid, safe, energetic.

## Aesthetic Direction

- Primary direction: A sunrise field guide crossed with an arcade challenge deck.
- Secondary influences: editorial marginalia, paper scorecards, stamped expedition logs.
- One memorable visual moment: the daily challenge lives on a tilted red card that appears to have been pulled from a physical deck.
- Explicitly avoid: purple SaaS gradients, glassmorphism, generic tile dashboards, shame-driven red alerts.

## Layout System

- Grid: 12 columns desktop, 4 columns mobile; 24px gutters desktop and 16px mobile.
- Breakpoints: 640px, 900px, 1180px.
- Container: 1240px maximum.
- Section rhythm: 48–80px for marketing; 24–40px in-app.

## Spacing Scale

- Base unit: 8px.
- Scale: 4, 8, 12, 16, 24, 32, 40, 48, 64, 80.
- Cards use 24–32px interiors; controls keep a 12px minimum gap.

## Typography

- Display: Petrona Variable, used for expressive large headlines.
- Body/UI: Bricolage Grotesque Variable.
- Type scale: 14, 16, 18, 22, 30, 44, 64, 88.
- Display line-height is tight (0.94–1.05); body line-height is 1.5–1.65.

## Color Tokens

- Background: `oklch(95.52% 0.018 89.72)` field paper.
- Surface: `oklch(97.92% 0.011 89.72)`.
- Elevated: `oklch(99% 0.006 89.72)`.
- Text: `oklch(21.34% 0.0074 145.31)`; secondary `oklch(46% 0.014 112.61)`.
- Accent: `oklch(52.22% 0.1654 32.91)`; contrast `oklch(97.92% 0.011 89.72)`.
- Ink blue: `#233C5B`; sun: `#F6C85F`; leaf: `#376A4A`.
- Border: `rgba(23,26,23,.18)`.
- Success: `#2F7950`; warning: `#A45D16`; error: `#B63729`.

## Radius, Border, Shadow

- Radius: primarily square editorial controls and cards; circles only for scores, levels, and status marks.
- Borders: 1px dark translucent ink; occasional 2px editorial rules.
- Shadows: hard offset card shadow (`6px 7px 0`) and a soft dialog shadow.

## Motion System

- Durations: 140ms, 240ms, 500ms.
- Easing: `cubic-bezier(.2,.8,.2,1)`.
- Page load: staggered rise; challenge card rotates gently into place.
- Hover: 2–3px lift or hard-shadow compression, never decorative bouncing.
- Reduced motion: remove transforms and all nonessential animation.

## Components

- Buttons: clear primary, ink secondary, and text tertiary; minimum 44px target.
- Inputs: warm white, visible label, high-contrast focus ring.
- Cards: flat paper surfaces with authored asymmetry; not every surface is rounded.
- Navigation: compact wordmark with restrained utility actions.
- Empty/loading/error: direct language, always with a next action.

## Accessibility Rules

- Minimum body text: 16px.
- Strong WCAG AA contrast target.
- Focus: 3px sun-colored outer ring with ink offset.
- Full keyboard navigation; dialogs use native `<dialog>`.

## Implementation Notes

- React 18 + TypeScript + Vite, Tailwind 3.4 plus authored CSS tokens.
- Local-first demo adapter; InsForge SDK adapter when environment variables exist.
- Mobile-first, evergreen browsers, reduced-motion support.
