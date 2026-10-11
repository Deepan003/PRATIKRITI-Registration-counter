/**
 * Which column holds what, for each Google Form response sheet.
 *
 * Columns are 0-based positions (A = 0, B = 1, ...). Positions are used instead of header text
 * because some forms repeat the same question title. If a form's questions are reordered,
 * update the numbers here; the `expect` text is only a sanity check that is logged when it
 * no longer matches the header.
 */

export const TIMEZONE = 'Asia/Kolkata';

export const EVENTS = [
  {
    id: 'chitrantar',
    name: 'Chitrantar',
    tagline: 'Exhibition & Competition',
    env: 'SHEET_CHITRANTAR',
    timestamp: 0,
    institution: { col: 2, expect: 'institute' },
    // One form, three paths: 1, 2 or 3 photos, each with its own genre + upload columns.
    photoCount: { col: 5, expect: 'how many photos' },
    photoSets: {
      1: [{ genre: 8, upload: 9 }],
      2: [{ genre: 12, upload: 13 }, { genre: 14, upload: 15 }],
      3: [{ genre: 18, upload: 19 }, { genre: 20, upload: 21 }, { genre: 22, upload: 23 }],
    },
    sections: ['Festival', 'Nature & Landscape', 'Street', 'Wildlife', 'Mobile Photography'],
    fees: { 1: 49, 2: 89, 3: 129 },
    priceList: [['1 photo', 49], ['2 photos', 89], ['3 photos', 129]],
  },
  {
    id: 'kshanika',
    name: 'Kshanika',
    tagline: 'Live Photography',
    env: 'SHEET_KSHANIKA',
    timestamp: 0,
    institution: { col: 2, expect: 'institution' },
    genre: { col: 6, expect: 'genre' },
    sections: ['Mobile', 'Camera'],
    classify: (g) => (/camera|dslr|mirrorless/i.test(g) ? ['Camera'] : /mobile|phone/i.test(g) ? ['Mobile'] : []),
    fee: () => 79,
    priceList: [['Any section', 79]],
  },
  {
    id: 'chitragati',
    name: 'Chitragati',
    tagline: 'Reel Making',
    env: 'SHEET_CHITRAGATI',
    timestamp: 0,
    institution: { col: 2, expect: 'institution' },
    genre: { col: 6, expect: 'genre' },
    sections: ['Live Reel', 'Theme-Based Reel'],
    // "Both" is one registration that appears under each section.
    classify: (g) => {
      if (/both/i.test(g)) return ['Live Reel', 'Theme-Based Reel'];
      if (/live/i.test(g)) return ['Live Reel'];
      if (/theme/i.test(g)) return ['Theme-Based Reel'];
      return [];
    },
    fee: (sections) => (sections.length > 1 ? 49 : 29),
    priceList: [['One section', 29], ['Both sections', 49]],
  },
  {
    id: 'rongolipi',
    name: 'Rongolipi',
    tagline: 'Colour Hunt',
    env: 'SHEET_RONGOLIPI',
    timestamp: 0,
    institution: { col: 2, expect: 'institution' },
    genre: { col: 6, expect: 'genre' },
    sections: [],
    classify: () => [],
    fee: () => 39, // per member: each form response is one member
    priceList: [['Per member', 39]],
  },
];

/** Chitrantar genre spellings → the rulebook's five themes. */
export function chitrantarTheme(raw) {
  const g = String(raw || '').toLowerCase();
  if (/festiv/.test(g)) return 'Festival';
  if (/nature|landscape/.test(g)) return 'Nature & Landscape';
  if (/street/.test(g)) return 'Street';
  if (/wild/.test(g)) return 'Wildlife';
  if (/mobile|phone/.test(g)) return 'Mobile Photography';
  return null;
}

/**
 * College name clean-up: the first pattern that matches wins.
 * Anything unmatched is shown as typed (trimmed, title-cased when typed in all caps/lowercase).
 */
export const COLLEGE_ALIASES = [
  [/^\s*(iem|institute\s+of\s+engineering\s*(and|&)\s*management)\b/i, 'IEM Kolkata'],
  [/^\s*(fiem|future\s+institute\s+of\s+engineering)/i, 'Future Institute of Engineering & Management'],
  [/^\s*(uem|university\s+of\s+engineering\s*(and|&)\s*management)\b/i, 'UEM Kolkata'],
  [/tridevi\s+bhalotia|tridevi\s+bhalotis/i, 'Tridevi Bhalotia College'],
];
