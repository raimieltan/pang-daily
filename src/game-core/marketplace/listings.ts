import { z } from 'zod';
import { PART_TEMPLATES, partDefinition, type PartCategory } from '../parts/parts';
import { MEETUPS, SELLERS, type Seller } from './sellers';

export const GRADES = ['like_new', 'good', 'fair', 'as_is'] as const;
export type Grade = typeof GRADES[number];
/** Lower bound of actual condition each grade honestly describes. */
const GRADE_FLOOR: Record<Grade, number> = { like_new: .85, good: .65, fair: .4, as_is: 0 };
/** Sellers price off what they advertise, not what the part actually is. */
const GRADE_PRICE: Record<Grade, number> = { like_new: 1, good: .82, fair: .6, as_is: .38 };
export const GRADE_LABEL: Record<Grade, string> = { like_new: 'Like new', good: 'Good condition', fair: 'Used, fair', as_is: 'As is' };
const BLURBS: Record<Grade, readonly string[]> = {
  like_new: ['Parang bago, boss. Almost no use.', 'Pull-out lang, walang issue.', 'Barely used. Upgraded kaya binebenta.'],
  good: ['Good condition boss.', 'Working pulled out sa daily ko.', 'Smooth pa, minor signs of use.'],
  fair: ['Pwede pa, may konting gasgas.', 'Used, working. Price is negotiable pero hindi masyado.', 'Still usable, you know how it is.'],
  as_is: ['As is, no return.', 'For parts or repair. Sold as is.', 'Buy at your own risk, tol.'],
};

export const gradeFor = (condition: number): Grade => GRADES.find(grade => condition >= GRADE_FLOOR[grade])!;

/** mulberry32: small, fast, deterministic — listings replay identically from seed + serial. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r: () => number, [min, max]: readonly [number, number]) => min + (max - min) * r();
function pick<T>(r: () => number, items: readonly T[], weight: (item: T) => number = () => 1): T {
  let roll = r() * items.reduce((sum, item) => sum + weight(item), 0);
  for (const item of items) if ((roll -= weight(item)) < 0) return item;
  return items[items.length - 1];
}

export const listingSchema = z.object({
  id: z.string().min(1), templateId: z.string().min(1), sellerId: z.string().min(1), location: z.string().min(1),
  askingPricePhp: z.number().int().positive(), advertisedGrade: z.enum(GRADES), blurb: z.string().min(1),
  /** Hidden: never leaves the session except through inspection or (later) installation. */
  actualCondition: z.number().min(0).max(1),
  postedAt: z.number().int(), expiresAt: z.number().int(), photoSeed: z.number().int().nonnegative(),
});
export type Listing = z.infer<typeof listingSchema>;

export const LISTING_LIFETIME_MS: readonly [number, number] = [8 * 60_000, 25 * 60_000];

/**
 * One listing from `seed`. Honest sellers grade from the actual roll; the rest bump it 1–2 grades.
 * Rarely a seller undersells (doesn't know what they have) — the good find worth hunting for.
 */
export function generateListing(seed: number, id: string, now: number, lifetimeMs = LISTING_LIFETIME_MS): Listing {
  const r = rng(seed);
  const template = pick(r, PART_TEMPLATES, t => t.weight);
  const seller = pick(r, SELLERS);
  const actualCondition = Math.round(between(r, template.conditionRange) * 100) / 100;
  const honestGrade = gradeFor(actualCondition);
  const bump = r() < .08 ? -1 : r() < seller.honesty ? 0 : r() < .6 ? 1 : 2;
  const advertisedGrade = GRADES[Math.min(GRADES.length - 1, Math.max(0, GRADES.indexOf(honestGrade) - bump))];
  const [low, high] = template.priceRange;
  // Round like real posts: to ₱50 below ₱5k, ₱100 above. A little haggle room baked in.
  const raw = (low + (high - low) * r()) * GRADE_PRICE[advertisedGrade] * (1 + (r() - .5) * .1);
  const step = raw < 5000 ? 50 : 100;
  return {
    id, templateId: template.id, sellerId: seller.id, location: pick(r, seller.locations),
    askingPricePhp: Math.max(step, Math.round(raw / step) * step), advertisedGrade, blurb: pick(r, BLURBS[advertisedGrade]),
    actualCondition, postedAt: now, expiresAt: now + Math.round(between(r, lifetimeMs)), photoSeed: Math.floor(r() * 1e6),
  };
}

export const seller = (id: string): Seller | undefined => SELLERS.find(s => s.id === id);

/** What the phone may show. Built field-by-field so hidden data cannot leak by spreading. */
export type ListingView = {
  id: string; title: string; category: PartCategory; fits: string; askingPricePhp: number;
  advertised: { grade: Grade; label: string; blurb: string };
  seller: { name: string; rating: number; sales: number; since: number; replies: string };
  location: string; meetup: string; postedSecondsAgo: number; expiresInSeconds: number; photoSeed: number;
};
export function listingView(listing: Listing, now: number): ListingView {
  const part = partDefinition(listing.templateId)!, by = seller(listing.sellerId)!;
  return {
    id: listing.id, title: part.name, category: part.category, fits: part.fits, askingPricePhp: listing.askingPricePhp,
    advertised: { grade: listing.advertisedGrade, label: GRADE_LABEL[listing.advertisedGrade], blurb: listing.blurb },
    seller: { name: by.name, rating: by.rating, sales: by.sales, since: by.since, replies: by.replies },
    location: listing.location, meetup: MEETUPS[listing.location] ?? listing.location,
    postedSecondsAgo: Math.max(0, Math.floor((now - listing.postedAt) / 1000)),
    expiresInSeconds: Math.max(0, Math.ceil((listing.expiresAt - now) / 1000)), photoSeed: listing.photoSeed,
  };
}

/** Mechanic's read on a revealed part, relative to what the seller claimed. */
export type Verdict = 'as_described' | 'oversold' | 'scammed' | 'better';
export function verdictFor(advertised: Grade, actualCondition: number): Verdict {
  const gap = GRADES.indexOf(gradeFor(actualCondition)) - GRADES.indexOf(advertised);
  return gap <= -1 ? 'better' : gap === 0 ? 'as_described' : gap === 1 ? 'oversold' : 'scammed';
}
