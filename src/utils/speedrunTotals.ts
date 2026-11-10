/**
 * How many countries (or capitals) a full run of each speedrun board asks.
 *
 * Mirrored as literals in `firebase-realtime.rules.json` (`highscores`): the
 * database only takes a time whose verified run found exactly this many. If a
 * region's pool changes - a country added to `flags.json`, a code dropped from
 * the map, a region reassigned in `countryStats.json` - update this table AND
 * the rules, or every save on that board is refused. `npm test` compares this
 * table with the real pools and `npm run test:rules` compares it with the rules.
 *
 * No imports on purpose: plain Node reads it in the tests.
 */
export const RUN_TOTALS: Record<string, number> = {
    "map-world": 169,
    "map-europe": 40,
    "map-africa": 49,
    "map-asia": 45,
    "map-americas": 29,
    "capmap-world": 196,
    "capmap-europe": 46,
    "capmap-africa": 54,
    "capmap-asia": 48,
    "capmap-americas": 35,
    "capmap-oceania": 13,
}
