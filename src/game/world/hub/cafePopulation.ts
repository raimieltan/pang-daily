/** Café staging in metres; keep the door (140, 103), central apron and spawn (131, 97) clear. */
export const CAFE_CUSTOMERS = [
  { x: 137.8, z: 105.3, heading: 180, seated: true, shirt: '#b87956', voice: 0 },
  { x: 137.8, z: 103.9, heading: 0, seated: true, shirt: '#728969', voice: 1 },
  { x: 138.2, z: 100.5, heading: 0, seated: true, shirt: '#d0b775', voice: 2 },
  { x: 135.9, z: 105.8, heading: 140, seated: false, shirt: '#bd8a98', voice: 1 },
  { x: 136.5, z: 104.8, heading: 320, seated: false, shirt: '#566c83', voice: 2 },
  { x: 139.6, z: 104.2, heading: 270, seated: false, shirt: '#48443d', voice: 1 },
  { x: 135.8, z: 93.8, heading: 50, seated: false, shirt: '#a4a395', voice: 0 },
  { x: 136.8, z: 94.5, heading: 230, seated: false, shirt: '#90594c', voice: 2 },
] as const;

export const CAFE_PARKED_CARS = [
  { x: 140, z: 81.4, heading: 180, paint: '#b4b9b2', build: 'clean_daily' },
  { x: 146.4, z: 81.4, heading: 180, paint: '#4e6e7b', build: 'marketplace_hero' },
  { x: 152.8, z: 81.4, heading: 180, paint: '#8f4740', build: 'primer_project' },
  { x: 159.2, z: 81.4, heading: 180, paint: '#c3b18e', build: 'donor_daily' },
  { x: 130.6, z: 88.5, heading: 270, paint: '#516353', build: 'tidy_kit' },
  { x: 130.6, z: 106, heading: 270, paint: '#626475', build: 'clean_daily' },
] as const;

/** The regulars' table (the south one, plus its plastic chair); seats match the chair props. */
export const CAFE_CREW = [
  { id: 'Sean', x: 138, z: 98.7, heading: 180, voice: 0 },
  { id: 'MichaelHandumon', x: 138, z: 97.3, heading: 0, voice: 1 },
  { id: 'Casey', x: 138.9, z: 97.4, heading: 300, voice: 2 },
] as const;

/** Their cars, nose-in toward the café's south wall. */
export const CREW_CARS = [
  { owner: 'Sean', model: 'lancer', x: 142.6, z: 90.6, heading: 0, paint: '#1f4f9e' },
  { owner: 'Casey', model: 'civic_rs', x: 145.5, z: 90.6, heading: 0, paint: '#f1f0eb' },
  { owner: 'MichaelHandumon', model: 'city', x: 148.4, z: 90.6, heading: 0, paint: '#eeede8' },
] as const;
