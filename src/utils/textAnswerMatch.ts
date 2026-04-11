/**
 * Shared text answer matching: exact match after normalization, or "close typo"
 * (does not count as correct; should not reset streaks / consume guesses).
 */

export function normalizeAnswer(str: string): string {
    return str.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim()
}

function levenshtein(a: string, b: string): number {
    const m = a.length
    const n = b.length
    const dp = new Array<number>(n + 1)
    for (let j = 0; j <= n; j++) dp[j] = j
    for (let i = 1; i <= m; i++) {
        let prev = dp[0]
        dp[0] = i
        for (let j = 1; j <= n; j++) {
            const tmp = dp[j]
            const cost = a[i - 1] === b[j - 1] ? 0 : 1
            dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost)
            prev = tmp
        }
    }
    return dp[n]
}

function lcsLength(a: string, b: string): number {
    const m = a.length
    const n = b.length
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1
            else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
        }
    }
    return dp[m][n]
}

function isCloseTypo(userNorm: string, targetNorm: string): boolean {
    if (userNorm === targetNorm) return false
    const minL = Math.min(userNorm.length, targetNorm.length)
    const maxL = Math.max(userNorm.length, targetNorm.length)
    if (minL < 4) return false
    if (maxL - minL > 1) return false
    const dist = levenshtein(userNorm, targetNorm)
    const maxDist = minL <= 10 ? 2 : 3
    if (dist > maxDist) return false
    const lcs = lcsLength(userNorm, targetNorm)
    return lcs >= minL - 1
}

export type TextAnswerMatchKind = "exact" | "close" | "wrong"

export function resolveTextAnswer(rawInput: string, acceptableRaw: string[]): TextAnswerMatchKind {
    const u = normalizeAnswer(rawInput)
    if (!u) return "wrong"
    const targets = acceptableRaw.map(normalizeAnswer).filter(Boolean)
    if (targets.some((t) => t === u)) return "exact"
    for (const t of targets) {
        if (isCloseTypo(u, t)) return "close"
    }
    return "wrong"
}

export const TYPO_FEEDBACK =
    "So close — check your spelling! Not counted as correct; your streak is safe. ✏️"

export const TYPO_FEEDBACK_DAILY_GUESS =
    "So close — check your spelling! This try was not used. ✏️"

/** Streak wording only when a hot/session streak is active (e.g. not in practice, streak > 0). */
export function typoFeedbackForStreak(hasActiveHotStreak: boolean): string {
    return hasActiveHotStreak ? TYPO_FEEDBACK : TYPO_FEEDBACK_DAILY_GUESS
}
