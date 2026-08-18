# Research — Personal Research Intelligence Platform

A working front-end prototype of the MVP described in
*UX Product Specification — Personal Research Intelligence Platform v1.0*,
built with a minimal, editorial design.

> **Don't read everything. Know what matters.**

## Running it

No build step and no dependencies — it is plain HTML, CSS and ES modules.

```bash
npx http-server -p 8000 .     # or: python3 -m http.server 8000
# then open http://localhost:8000
```

Open the landing page, sign up with any email, and the onboarding flow will
build a feed. All state lives in `localStorage`; **Settings → Reset** clears it.

## What's implemented

Every screen in the specification, wired into one navigable product:

| Spec | Screen | Notes |
| --- | --- | --- |
| §7 | Landing | Hero shows the real product surface, not decoration |
| §8 | Authentication | Email or Google, straight into onboarding |
| §9–11 | Onboarding | Interests (with live search + custom topics), first source, intent |
| §12–16, §61 | Home | Daily Brief, Worth Your Time, Since your last visit, Emerging topics, Continue researching |
| §17–18 | Add article | Staged progress, then a result checklist |
| §19–22 | Add website | Discovery → category selection → frequency → confirmation → monitoring |
| §23–24 | Sources | List and detail with Articles / Topics / Activity / Settings |
| §25–27 | Discover | Recommendation cards with "Why this?" and the full feedback set |
| §28–35 | Article Reader | TL;DR, Key Insights, Why It Matters, What Changed, translation, scoped assistant |
| §36 | Library | Tabs, search, topic/source filters, sorting |
| §37–40 | Topics | Workspace with Overview / Articles / Timeline / Trends / Sources |
| §41–43 | Research | Answer, Key Findings, Timeline, Sources, Conflicting Views, Further Reading |
| §44–45 | Notifications | Categorised, with the importance × relevance × novelty rule stated |
| §46–48 | Empty / loading / error states | Every empty state carries an action; every failure offers a way forward |
| §49–50 | Responsive | Desktop-first, sidebar → bottom nav + FAB, reader gets its own mobile action bar |
| §54–58 | Personalization | Every interaction is a weighted signal; Settings shows the audit trail |

## Design decisions

**Minimal, not sparse.** Paper-and-ink palette, one restrained green accent,
no gradients, no glow, no card-on-card nesting. A serif (Newsreader) carries
headlines and article text; a sans (Inter) carries the interface — the two
families the spec allows. Article body is 19px at a 1.85 line height (§52).

**Trust is a visual property.** Relevance is always shown with its bar and its
reasons. "Why this?" is one click from every recommendation. Where the system
has nothing to say it says *"No significant change detected"* rather than
generating filler, and Research refuses to answer questions the library cannot
support.

**AI sits behind the UX** (§60). The assistant is collapsed by default inside
the reader and scoped to the open article; Research is a separate deliberate
mode. Nothing asks the user to write a prompt to get value.

## Structure

```
index.html               shell: fonts, tokens, module entry
assets/css/tokens.css    design tokens — colour, type, space, motion (light + dark)
assets/css/app.css       components and layout
assets/js/app.js         shell, navigation, search palette, global actions
assets/js/router.js      hash router
assets/js/store.js       state, persistence, personalization signals
assets/js/data.js        mock corpus (articles, sources, topics, timelines)
assets/js/ui.js          icons, event delegation, modal, toast, staged progress
assets/js/views/         one module per screen area
```

## Prototype boundaries

There is no backend: no crawling, extraction, translation or model calls
happen. Article and website imports run the real interaction flow against
generated data and say so on screen rather than inventing article text. The
Persian translations in the sample corpus are written, not machine-produced.
