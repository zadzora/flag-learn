# Badges - image prompts for ChatGPT

Every sheet is a **sprite sheet** on a strict grid, so one generated image gives
many assets, which get cut up and traced to SVG (the same way `icons_1.png` and
`daily_*.png` became `ModeIcons.tsx` / `DailyModeIcons.tsx`).

The badges are **combined in code, not drawn one by one**: a medal frame (sheet 1)
supplies the tier, and an emblem (sheets 2 and 3) supplies the subject. That makes
4 frames x 32 emblems = every badge in the game from 5 images. Continent
silhouettes are left out on purpose - they are rendered from `public/world-map.json`,
which is more accurate than any drawing.

## How to run them

1. Do all the sheets in **one ChatGPT conversation**, so the style stays consistent.
2. In the first message, attach `graphic/daily_gauntlet.png` and `graphic/daily_flagle.png`
   as the style reference, then paste the style block plus sheet 1.
3. For each next sheet, paste only "Same style as before." + that sheet's prompt.
4. Save each result into `graphic/` under the file name given in its heading.
5. If one cell is wrong, ask: "Regenerate the whole sheet, keep everything identical
   except cell [row, column]: ..." - a single icon generated alone will not match
   the size and line weight of the others.

Check every sheet before saving: correct number of cells, nothing touching a
neighbouring cell, no text or numbers, a white background, and the same outline
thickness everywhere.

---

## Style block (paste before sheet 1)

```
Style reference: the two attached icons. Match them exactly.

Flat vector game-icon style. Every shape has a thick, uniform, dark brown outline
(#2B1A10), about 4% of the icon's width, with rounded joins and caps. Inside the
outline: 2-3 flat fill colours, one slightly darker shade on the lower/right side of
each shape, and at most one small white glossy highlight stroke. No gradients, no
texture, no drop shadows, no 3D perspective, no glow. Bold simple silhouettes that
stay readable at 24 pixels.

Palette - use only these colours:
orange #F29A1F, amber #FFC21A, cream #FFF1C9, sky blue #4AA3F0, deep navy #23345E,
red #E5484D, green #2BB673, bronze #C0773F, silver #B7C2D3, gold #F2B92B,
ice blue #9FD8F5, white #FFFFFF, outline #2B1A10.

Absolutely no text, letters, numbers or words anywhere in the image.
Background: solid pure white (#FFFFFF), with no grid lines, no borders, no labels.
Lay the icons out on the exact grid described, every icon centred in its own equal
cell, all icons the same visual size, with wide empty space between cells.
Nothing may cross into a neighbouring cell.
```

---

## Sheet 1 - medal frames -> `badges_frames.png`

```
Image size 1536x1024. A grid of exactly 3 columns x 2 rows (6 equal cells).
Each cell holds one circular medal frame seen straight on, about 70% of the cell's
height. Every frame has an EMPTY cream (#FFF1C9) inner disc covering the central
60% of its diameter - leave that disc completely blank, another picture will be
placed inside it later. All six frames have exactly the same outer size and the
same inner disc size, in the same position.

Row 1:
1. Bronze frame: a plain bronze (#C0773F) ring, simple and smooth.
2. Silver frame: a silver (#B7C2D3) ring with 8 small evenly spaced notches around
   its outer edge.
3. Gold frame: a gold (#F2B92B) ring with two laurel branches curving up its lower
   half, one on each side.
Row 2:
4. Platinum frame: an ice blue (#9FD8F5) ring with laurel branches like the gold
   one, plus a small four-pointed star sitting on top of the ring.
5. Locked frame: a pale grey ring drawn with a dashed outline, flat, no shine,
   clearly "not earned yet".
6. Special frame: a deep navy (#23345E) ring with a short folded ribbon hanging
   from the bottom, two tails, both blank.
```

---

## Sheet 2 - emblems: learning -> `badges_emblems_1.png`

```
Image size 1024x1024. A grid of exactly 4 columns x 4 rows (16 equal cells).
Each cell holds one emblem with NO frame, NO circle and NO background shape behind
it - just the object itself. Each emblem must fit inside an imaginary circle of 60%
of the cell's width, because it will later be placed inside a round medal.

Row 1:
1. A waving flag on a short pole, the flag orange and amber.
2. A domed government building with columns, cream with a sky blue dome.
3. A shield with a single five-pointed star at the top and vertical stripes below,
   red, white and navy.
4. A map pin standing on a folded paper map, red pin, cream map.
Row 2:
5. Three stars joined by thin lines into a small constellation, gold stars, navy
   lines.
6. A conical laboratory flask with green liquid and two bubbles rising.
7. A ruler crossed diagonally with a round dial gauge, amber and sky blue.
8. A small chalkboard showing an abstract square-root (radical) symbol and one
   wavy line - symbols only, no letters or digits.
Row 3:
9. An eye whose pupil is a target crosshair, sky blue iris.
10. A paint brush with a single drop of paint falling from it, red drop.
11. A wheel of six round dots arranged in a ring around a centre dot, amber.
12. Two thick arrows, one pointing up (green) and one pointing down (red), side by
    side.
Row 4:
13. A graduation cap with a hanging tassel, navy with a gold tassel.
14. An hourglass with amber sand.
15. An open book with a small globe rising out of its pages.
16. A lightning bolt, amber.
```

---

## Sheet 3 - emblems: daily and world -> `badges_emblems_2.png`

```
Same style as before. Image size 1024x1024. A grid of exactly 4 columns x 4 rows
(16 equal cells). Same rules: no frame, no circle behind, each emblem fits inside
an imaginary circle of 60% of the cell's width.

Row 1:
1. A flame, orange outside and amber inside.
2. A wall calendar page with a large green check mark on it.
3. A heater shield with four round gems in a row across it, all four filled.
4. A magnifying glass held over a small globe.
Row 2:
5. Four rounded square tiles in a 2x2 block, each a different colour: amber,
   green, sky blue, red.
6. A flag with a large question-mark shape on it.
7. A small rounded vintage car seen from the side, red.
8. A compass rose with four points, the north point red.
Row 3:
9. A round rubber passport stamp mark with a tiny flag inside it, navy ink.
10. A snowy mountain peak with a small flag planted on top.
11. Two interlocking chain links, silver.
12. A castle tower with a crown floating above it, gold crown.
Row 4:
13. Two crossed swords, silver blades and amber hilts.
14. A trophy cup with two handles, gold.
15. A small ferry ship on two wavy lines of water.
16. A car tyre seen at an angle, leaving two curved skid marks behind it.
```

---

## Sheet 4 - rank insignia -> `badges_ranks.png`

```
Same style as before. Image size 1536x1024. A grid of exactly 4 columns x 2 rows
(8 equal tall cells). Each cell holds one rank insignia: a vertical heater-shaped
shield seen straight on. All eight shields have the same outline shape and the
same size; they climb in richness from left to right, top row then bottom row.

1. Unranked: a plain empty shield, pale grey, flat, no decoration.
2. Tourist: a bronze shield with one small chevron.
3. Traveller: a bronze shield with two chevrons.
4. Explorer: a silver shield with a small compass rose in the middle.
5. Navigator: a silver shield with a compass rose and a ribbon across the bottom.
6. Cartographer: a gold shield with a folded map in the middle and a ribbon.
7. Ambassador: a gold shield with a small globe in the middle, laurel branches
   around the sides and a ribbon.
8. Atlas: an ice blue shield with a globe, laurel branches, a ribbon and a small
   crown on top - clearly the highest rank.

Leave every ribbon blank, with no text on it.
```

---

## Sheet 5 - unlock moment pieces -> `badges_fx.png`

```
Same style as before. Image size 1536x1024. A grid of exactly 3 columns x 2 rows
(6 equal cells).

Row 1:
1. A closed padlock, silver.
2. The same padlock, open, with the shackle swung up to the right.
3. A wide blank ribbon banner with folded tails on both ends, gold - no text.
Row 2:
4. A single four-pointed sparkle star, amber.
5. A burst of 12 short radiating rays around an empty centre, amber - the centre
   must stay empty.
6. A small cluster of confetti pieces: rectangles and dots in red, amber, green and
   sky blue.
```
