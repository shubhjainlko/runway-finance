import type { Category, Rule } from './model';

const expenses: readonly [Category, RegExp][] = [
  ['Housing', /\b(rent|mortgage|property management|apartment leasing|hoa dues)\b/i],
  [
    'Subscriptions',
    /\b(netflix|spotify|adobe|youtube premium|apple music|apple tv|icloud|disney\+?|hulu|notion|figma|dropbox|prime video|audible|linear app)\b/i,
  ],
  [
    'Utilities',
    /\b(electric|electricity|water utility|energy|broadband|comcast|xfinity|verizon|internet|utility|utilities|t-mobile|mobile bill)\b/i,
  ],
  [
    'Groceries',
    /\b(whole foods|trader joe|grocery|groceries|supermarket|safeway|kroger|aldi|costco|farmers market|fresh market|instacart|sprouts)\b/i,
  ],
  [
    'Dining',
    /\b(coffee|caf[eé]|restaurant|bistro|diner|pizza|chipotle|doordash|grubhub|bakery|starbucks|sweetgreen|blue bottle|dining|tacos|kitchen|sushi|burger|pasta)\b/i,
  ],
  [
    'Transport',
    /\b(uber|lyft|metro|transit|parking|shell|chevron|train|clipper|bart|gas station|fuel|bus pass|taxi)\b/i,
  ],
  [
    'Health',
    /\b(cvs|walgreens|pharmacy|clinic|dental|medical|wellness|fitness|gym|hospital|optical)\b/i,
  ],
  [
    'Travel',
    /\b(airlines?|airbnb|hotel|marriott|jetblue|amtrak|southwest|flight|lodging|united air)\b/i,
  ],
  [
    'Entertainment',
    /\b(cinema|theat[er]+|museum|ticketmaster|concert|bowling|arcade|amc|festival)\b/i,
  ],
  [
    'Shopping',
    /\b(amazon|target|ikea|clothing|bookstore|nordstrom|uniqlo|apple store|best buy|patagonia|staples|bookshop|stationery|west elm)\b/i,
  ],
];

export function normalizeKeyword(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

/** Compile priority once per statement. Rules use literal, case-insensitive substrings. */
export function makeCategorizer(rules: readonly Rule[] = []) {
  const ordered = [...rules]
    .sort((a, b) => b.id - a.id)
    .map((rule) => ({
      keyword: normalizeKeyword(rule.keyword),
      category: rule.category,
    }));
  return (description: string, amountCents: number): Category => {
    const merchant = normalizeKeyword(description);
    const custom = ordered.find((rule) => rule.keyword && merchant.includes(rule.keyword));
    if (custom) return custom.category;
    if (amountCents > 0) return 'Income';
    for (const [category, pattern] of expenses) {
      if (pattern.test(merchant)) return category;
    }
    return 'Other';
  };
}

export function categorize(
  description: string,
  amountCents: number,
  rules: readonly Rule[] = [],
): Category {
  return makeCategorizer(rules)(description, amountCents);
}
