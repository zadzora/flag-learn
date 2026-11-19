---
name: trivia
description: Write new World Trivia questions (data/trivia/*.json) for the developer to review in the dev-only editor at /dev/trivia, or carry out the changes they asked for there. Use when a message starts with "Trivia:" (pasted from the editor), or the developer asks for new trivia questions, or to process / fix drafts waiting in the trivia editor.
---

# Trivia questions for the review editor

The developer reviews every question in the editor at `/dev/trivia` (`npm run dev`). You never write
into `data/trivia/*.json` yourself: you put drafts into the queue (`.trivia-editor/queue.json`) with
`scripts/trivia-queue.mjs`, the page picks them up within a few seconds, and only what the developer
approves there is saved. The developer writes in Slovak; reply in Slovak.

## New questions ("Trivia: navrhni N otázok do balíka ...")

1. Read the context for the pack, with the country if one was named:
   `node scripts/trivia-queue.mjs context <pack> [--country xx]`
   It prints the format, every question already in the pack, the ones about the country in other
   packs, what the developer rejected before, what is already waiting, and the least covered
   countries. Read all of it - the point is questions the bank does not have yet.
2. Write the drafts into a JSON file in your scratchpad:
   `{"pack": "<pack>", "questions": [ { ...question without "id"..., "note": "..." } ]}`
   `note` is for the reviewer, in Slovak: one or two sentences on why the answer is right and what,
   if anything, is worth double-checking (a figure, a date, a disputed record). It is never saved.
3. Check before queueing: `node scripts/trivia-queue.mjs add <file> --dry`. Fix every `error`, and
   rewrite any draft whose `similar` line shows the bank already asks the same thing. Then queue:
   `node scripts/trivia-queue.mjs add <file>`.
4. Tell the developer briefly what you queued (pack, how many, topics) and that it is waiting at
   http://localhost:5173/dev/trivia. Mention anything you were unsure of.

When the request asks for the least covered countries, spread the questions over the countries the
context lists as least covered. When it gives a topic in the developer's words, that topic wins.

## Changes the developer asked for ("Trivia: sprav úpravy, o ktoré žiadam v editore")

1. `node scripts/trivia-queue.mjs list --requests` - every draft with a request, its key and verdict.
2. For each: `node scripts/trivia-queue.mjs show <key>`, write the revised question (one question
   object, optionally a fresh `note`) to a file, and `node scripts/trivia-queue.mjs set <key> <file>`.
   That replaces the draft and clears its request. A request "Oprav, čo hlási kontrola." means: fix
   the checker's errors and keep everything else.
3. Say in a line or two what you changed.

## What makes a good question here

- Facts that are well established and stable. Never invent a number or a date; if you are not sure,
  pick another question. A fact that can go out of date (a record, "the tallest", a population)
  gets `asOf` with the current year.
- One defensible answer. Wrong options are plausible and of the same kind and similar length as the
  answer (all rivers, all years, all dishes) - never jokes, never a giveaway.
- The question never contains its answer; a kind "which" question never names the country it is
  after.
- The fact (`fact`) adds something the question did not say - the part worth remembering - in one or
  two short sentences. It does not repeat the answer.
- American English spelling (color, meter, center). Plain hyphen and straight quotes only; the
  checker refuses typographic dashes, quotes and the ellipsis character.
- level: 1 most adults know or can work it out, 2 takes real knowledge, 3 only an enthusiast.
- Country codes only from the pool (`data/flags.json` codes the checker accepts); a `pin` question's
  `at` is `[longitude, latitude]`, longitude first.
- Players are curious adults and teenagers on a geography learning site: questions should teach
  something worth remembering, not test obscure trivia for its own sake.

The format itself is the comment at the top of `scripts/check-trivia.mjs` (printed by `context`);
the rules are in `scripts/trivia-rules.mjs`.
