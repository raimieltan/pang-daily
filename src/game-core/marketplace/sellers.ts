/**
 * `honesty` (hidden) is the chance they describe the part truthfully; otherwise they bump the grade.
 * `rating` and `sales` are what buyers see — they hint at honesty but do not guarantee it.
 */
export type Seller = { id: string; name: string; honesty: number; rating: number; sales: number; since: number; locations: readonly string[]; replies: string };
export const SELLERS: readonly Seller[] = [
  { id: 'jun_surplus', name: 'Jun Surplus Parts', honesty: .9, rating: 4.8, sales: 212, since: 2014, locations: ['Jaro', 'Tagbak'], replies: 'Usually replies within an hour' },
  { id: 'kuya_rex', name: 'Kuya Rex', honesty: .65, rating: 4.3, sales: 41, since: 2019, locations: ['La Paz', 'Lapuz'], replies: 'Replies in the evening' },
  { id: 'marlon_d', name: 'Marlon D.', honesty: .35, rating: 3.6, sales: 9, since: 2024, locations: ['Molo', 'Arevalo'], replies: 'Seen, sometimes replies' },
  { id: 'ate_joy', name: 'Ate Joy (for my husband)', honesty: .8, rating: 4.6, sales: 3, since: 2021, locations: ['Mandurriao'], replies: 'Replies fast, asks her husband' },
  { id: 'iloilo_tuner_ph', name: 'IloiloTunerPH', honesty: .5, rating: 4.1, sales: 88, since: 2017, locations: ['Pavia', 'Mandurriao'], replies: 'Replies within minutes' },
  { id: 'boss_gerald', name: 'Boss Gerald', honesty: .2, rating: 3.2, sales: 15, since: 2025, locations: ['Oton', 'Arevalo'], replies: '“Available pa boss” to everything' },
];

/** Meet-up spots quoted in listings, per area. Delivery is abstracted for this slice. */
export const MEETUPS: Readonly<Record<string, string>> = {
  Jaro: 'Jaro plaza', Tagbak: 'Tagbak terminal', 'La Paz': 'La Paz market', Lapuz: 'Lapuz bridge',
  Molo: 'Molo church', Arevalo: 'Villa beach road', Mandurriao: 'Diversion road', Pavia: 'Pavia town hall', Oton: 'Oton public market',
};
