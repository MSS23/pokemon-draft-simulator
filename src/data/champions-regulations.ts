/**
 * Official Pokemon Champions Ranked Battle eligibility, collapsed to National
 * Dex species for draft play. Champions lists individual battle forms, while
 * this application drafts a species once (species clause), so Raichu and
 * Alolan Raichu intentionally share the same draft asset.
 *
 * Sources:
 * - M-A: https://web-view.app.pokemonchampions.jp/battle/pages/events/rs177501629259kmzbny/en/pokemon.html
 * - M-B: https://web-view.app.pokemonchampions.jp/battle/pages/events/rs178066986988lmoqpm/en/pokemon.html
 */
export const CHAMPIONS_MA_DEX_NUMBERS = [
  3, 6, 9, 15, 18, 24, 25, 26, 36, 38, 59, 65, 68, 71, 80, 94, 115,
  121, 127, 128, 130, 132, 134, 135, 136, 142, 143, 149, 154, 157, 160,
  168, 181, 184, 186, 196, 197, 199, 205, 208, 212, 214, 227, 229, 248,
  279, 282, 302, 306, 308, 310, 319, 323, 324, 334, 350, 351, 354, 358,
  359, 362, 389, 392, 395, 405, 407, 409, 411, 428, 442, 445, 448, 450,
  454, 460, 461, 464, 470, 471, 472, 473, 475, 478, 479, 497, 500, 503,
  505, 510, 512, 514, 516, 530, 531, 534, 547, 553, 563, 569, 571, 579,
  584, 587, 609, 614, 618, 623, 635, 637, 652, 655, 658, 660, 663, 666,
  670, 671, 675, 676, 678, 681, 683, 685, 693, 695, 697, 699, 700, 701,
  702, 706, 707, 709, 711, 713, 715, 724, 727, 730, 733, 740, 745, 748,
  750, 752, 758, 763, 765, 766, 778, 780, 784, 823, 841, 842, 844, 855,
  858, 866, 867, 869, 877, 887, 899, 900, 902, 903, 908, 911, 914, 925,
  934, 936, 937, 939, 952, 956, 959, 964, 968, 970, 981, 983, 1013,
  1018, 1019,
] as const

/** The 22 species introduced to the eligible pool in Regulation M-B. */
export const CHAMPIONS_MB_ADDED_DEX_NUMBERS = [
  45, 211, 254, 257, 260, 303, 376, 398, 518, 545, 560, 604, 668, 687,
  689, 691, 861, 870, 904, 972, 979, 1000,
] as const

export const CHAMPIONS_MB_DEX_NUMBERS = [
  ...CHAMPIONS_MA_DEX_NUMBERS,
  ...CHAMPIONS_MB_ADDED_DEX_NUMBERS,
].sort((a, b) => a - b)

export const CHAMPIONS_MA_DEX_IDS = CHAMPIONS_MA_DEX_NUMBERS.map(String)
export const CHAMPIONS_MB_DEX_IDS = CHAMPIONS_MB_DEX_NUMBERS.map(String)

