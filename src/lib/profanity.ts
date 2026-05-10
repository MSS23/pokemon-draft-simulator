/**
 * Content moderation for user-supplied names (team names, user names,
 * tournament names, divisions, etc.).
 *
 * Strict mode: hate speech, slurs, harassment terms, sexual content, and
 * common profanity are blocked — including leetspeak / unicode-substitution
 * bypasses ("h1tl3r", "n4z1", "sh!t", "f∪ck", etc.).
 *
 * `containsProfanity()` is the low-level test. `validateName()` is the
 * policy wrapper UI code should call: it also enforces length, control
 * character, and zero-width character rules.
 */

// ---------------------------------------------------------------------------
// 1. Normalization — collapse leetspeak and unicode lookalikes to letters
// ---------------------------------------------------------------------------

const LEET_MAP: Record<string, string> = {
  '0': 'o', '1': 'i', '2': 'z', '3': 'e', '4': 'a', '5': 's',
  '6': 'b', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't',
  // Unicode look-alikes
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'к': 'k',
  'А': 'a', 'Е': 'e', 'О': 'o', 'Р': 'p', 'С': 'c', 'Х': 'x', 'У': 'y', 'К': 'k',
}

/**
 * Produce several candidate normalizations of the input. We test the banlist
 * against every candidate so we catch both:
 *  - Repetition bypasses ("fuuuuck") via the dedupe candidate
 *  - 3-letter blocks like "kkk" via the no-dedupe candidate
 *  - Pure-digit patterns like "1488" via the no-leet candidate
 */
function normalizeAll(input: string): string[] {
  const lowered = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks
    .replace(/[​-‏‪-‮﻿]/g, '') // strip zero-width

  const leeted = (() => {
    let s = ''
    for (const ch of lowered) s += LEET_MAP[ch] ?? ch
    return s
  })()

  const stripAlphaNum = (s: string) => s.replace(/[^a-z0-9]+/g, '')
  const dedupeRuns = (s: string) => s.replace(/(.)\1{2,}/g, '$1$1')

  const lower = stripAlphaNum(lowered)
  const lowerDedupe = dedupeRuns(lower)
  const leet = stripAlphaNum(leeted)
  const leetDedupe = dedupeRuns(leet)

  // Dedup the candidate list itself to avoid redundant work
  return Array.from(new Set([lower, lowerDedupe, leet, leetDedupe]))
}

// ---------------------------------------------------------------------------
// 2. Banlist
// ---------------------------------------------------------------------------
//
// All entries are tested against the *normalized* string with substring match.
// Keep entries lowercase, no spaces. False-positives can be added to ALLOWLIST
// below to suppress.
//
// Categories (kept distinct so we can show different messaging if useful):

const BANNED_HATE = [
  // Nazi / fascist / supremacist references — explicitly called out by the
  // product owner ("don't want anyone putting up 'Hitler's team'").
  'hitler', 'heilhitler', 'sieghei', 'sieg', 'fuhrer', 'furer',
  'nazi', 'nazis', 'thirdreich', '3rdreich', 'reich88', 'whitepower',
  'whitepride', 'aryan', 'kkk', 'whiteknight', 'gasthejews', 'gaschamber',
  'holocaust', 'holohoax', 'jihad', 'isis', 'taliban',
  '1488', '14words', '88h', 'hh88', 'sshmen',
  'stalin', 'mao', 'polpot', 'binladen', 'osama',
  // Genocidal / mass-murder framing
  'killjews', 'killblacks', 'killgays', 'killmuslims', 'killchristians',
  'genocide', 'lynching', 'lynchmob',
]

const BANNED_SLURS = [
  // Racial slurs (heavily redacted spellings — kept in a static array because
  // there is no way to filter these without naming them).
  'nigger', 'niger', 'nigga', 'niggas', 'niggers', 'niggur',
  'chink', 'chinks', 'gook', 'gooks',
  'spic', 'spics', 'wetback',
  'kike', 'kikes', 'heeb',
  'tranny', 'trannies', 'shemale',
  'faggot', 'faggit', 'fagot', 'fag',
  'dyke', 'dykes',
  'retard', 'retarded', 'retards',
  // Note: deliberately omit borderline reclamations and innocuous homonyms.
]

const BANNED_SEXUAL = [
  'pedophile', 'pedo', 'pedos', 'pedofile',
  'rapist', 'rapists', 'gangrape', 'rapeher', 'rapehim',
  'incest', 'molester', 'childporn', 'cp',
  'jailbait', 'cunny',
  'bestiality',
]

const BANNED_PROFANITY = [
  // Casual-but-strong profanity. Strict mode includes these.
  'fuck', 'fucker', 'fucked', 'fucking', 'motherfucker', 'mofo',
  'shit', 'shitty', 'shithead', 'bullshit',
  'cunt', 'cunts',
  'bitch', 'bitches', 'sonofabitch',
  'asshole', 'assholes', 'asshat',
  'dickhead', 'dickface', 'cock', 'dick', 'pussy',
  'whore', 'slut', 'sluts',
  'bastard', 'bastards',
]

const BANNED_HARASSMENT = [
  'killyourself', 'kysnow', 'killurself', 'kys',
  'imurder', 'iwillkillyou', 'killu', 'shoot',
]

// ---------------------------------------------------------------------------
// 3. Allowlist — innocuous substrings that overlap a banned term
// ---------------------------------------------------------------------------
//
// Each entry is removed from the normalized candidate BEFORE banlist
// matching. This avoids substring false-positives like "Scunthorpe United"
// (contains "cunt") or "Mass Effect" (contains "ass").

const ALLOWLIST_SUBSTRINGS = [
  'scunthorpe', 'penistone', 'cockermouth', 'matsushita',
  'assassin', 'assassins', 'assassination',
  'classic', 'classes', 'class', 'classical',
  'brassiere', 'massage', 'compass', 'embassy', 'massive',
  'analysis', 'analytics', 'analyst',
  'cumbria', 'cumberland',
  'bassist', 'bassman',
  'document', 'documentation',
  'hellfire', 'hello', 'hellraiser',
  'shellac', 'shelter', 'shellfish',
  'pasta', 'pastor',
]

function stripAllowed(candidate: string): string {
  let out = candidate
  // Iterate longest-first so "assassins" is removed before "ass" is checked.
  for (const safe of [...ALLOWLIST_SUBSTRINGS].sort((a, b) => b.length - a.length)) {
    if (!out.includes(safe)) continue
    // Remove all occurrences
    out = out.split(safe).join('')
  }
  return out
}

// ---------------------------------------------------------------------------
// 4. Public API
// ---------------------------------------------------------------------------

export interface ProfanityCheck {
  ok: boolean
  reason?: string
  category?: 'hate' | 'slur' | 'sexual' | 'profanity' | 'harassment'
  match?: string
}

/**
 * Returns true if the input contains any banned word once normalized.
 * Use {@link checkProfanity} when you need the matched term + category.
 */
export function containsProfanity(input: string | null | undefined): boolean {
  return !checkProfanity(input).ok
}

/**
 * Detailed check — returns the matched term and category so the UI can
 * decide how loudly to push back.
 */
export function checkProfanity(input: string | null | undefined): ProfanityCheck {
  if (!input) return { ok: true }

  const candidates = normalizeAll(input)
    .filter(Boolean)
    .map(stripAllowed)
    .filter(Boolean)

  if (candidates.length === 0) return { ok: true }

  const matchAny = (terms: readonly string[]) => {
    for (const term of terms) {
      for (const candidate of candidates) {
        if (candidate.includes(term)) return term
      }
    }
    return null
  }

  // Order matters — report the most serious category first
  let hit = matchAny(BANNED_HATE)
  if (hit) return { ok: false, reason: 'Contains hateful term', category: 'hate', match: hit }
  hit = matchAny(BANNED_SLURS)
  if (hit) return { ok: false, reason: 'Contains a slur', category: 'slur', match: hit }
  hit = matchAny(BANNED_SEXUAL)
  if (hit) return { ok: false, reason: 'Contains sexual content', category: 'sexual', match: hit }
  hit = matchAny(BANNED_HARASSMENT)
  if (hit) return { ok: false, reason: 'Contains harassment', category: 'harassment', match: hit }
  hit = matchAny(BANNED_PROFANITY)
  if (hit) return { ok: false, reason: 'Contains profanity', category: 'profanity', match: hit }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// 5. Higher-level name validator (used by all forms)
// ---------------------------------------------------------------------------

export interface NameValidation {
  ok: boolean
  reason?: string
}

interface NameValidationOptions {
  /** Field being validated — used in the rejection message. */
  fieldLabel?: string
  /** Minimum trimmed length. Default 1. */
  minLength?: number
  /** Maximum trimmed length. Default 64. */
  maxLength?: number
  /** Allow empty input (returns ok:true). Default false. */
  allowEmpty?: boolean
}

/**
 * Validate a user-supplied name. Combines length checks, control-character
 * stripping, zero-width detection, and profanity filtering.
 *
 * UI contract: when `ok === false`, surface `reason` to the user and refuse
 * to submit. Don't try to auto-clean — let them re-type.
 */
export function validateName(
  raw: string | null | undefined,
  options: NameValidationOptions = {}
): NameValidation {
  const {
    fieldLabel = 'Name',
    minLength = 1,
    maxLength = 64,
    allowEmpty = false,
  } = options

  const value = (raw ?? '').trim()

  if (!value) {
    return allowEmpty
      ? { ok: true }
      : { ok: false, reason: `${fieldLabel} is required` }
  }

  if (value.length < minLength) {
    return { ok: false, reason: `${fieldLabel} must be at least ${minLength} characters` }
  }

  if (value.length > maxLength) {
    return { ok: false, reason: `${fieldLabel} must be ${maxLength} characters or fewer` }
  }

  // Block control characters (would break UI / logs) and zero-width filler
  // (used to bypass naive filters).
  if (/[ -]/.test(value)) {
    return { ok: false, reason: `${fieldLabel} contains invalid characters` }
  }
  if (/[​-‏‪-‮﻿]/.test(value)) {
    return { ok: false, reason: `${fieldLabel} contains hidden characters — please retype` }
  }

  const profanity = checkProfanity(value)
  if (!profanity.ok) {
    return {
      ok: false,
      reason: `${fieldLabel} is not allowed (${profanity.reason?.toLowerCase()}). Please pick a different name.`,
    }
  }

  return { ok: true }
}
