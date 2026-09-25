/** Café staging in metres; keep the door (140, 103), central apron and spawn (131, 97) clear. */
export const CAFE_CUSTOMERS = [
  { x: 137.8, z: 105.3, heading: 180, seated: true, shirt: '#b87956', voice: 0 },
  { x: 137.8, z: 103.9, heading: 0, seated: true, shirt: '#728969', voice: 1 },
  { x: 138.2, z: 100.5, heading: 0, seated: true, shirt: '#d0b775', voice: 2 },
  { x: 138, z: 98.7, heading: 180, seated: true, shirt: '#788fa9', voice: 0 },
  { x: 135.9, z: 105.8, heading: 140, seated: false, shirt: '#bd8a98', voice: 1 },
  { x: 136.5, z: 104.8, heading: 320, seated: false, shirt: '#566c83', voice: 2 },
  { x: 139.6, z: 104.2, heading: 270, seated: false, shirt: '#48443d', voice: 1 },
  { x: 135.8, z: 93.8, heading: 50, seated: false, shirt: '#a4a395', voice: 0 },
  { x: 136.8, z: 94.5, heading: 230, seated: false, shirt: '#90594c', voice: 2 },
] as const;

export const CAFE_PARKED_CARS = [
  { x: 140, z: 81.4, heading: 180, paint: '#b4b9b2' },
  { x: 146.4, z: 81.4, heading: 180, paint: '#4e6e7b' },
  { x: 152.8, z: 81.4, heading: 180, paint: '#8f4740' },
  { x: 159.2, z: 81.4, heading: 180, paint: '#c3b18e' },
  { x: 130.6, z: 88.5, heading: 270, paint: '#516353' },
  { x: 130.6, z: 106, heading: 270, paint: '#626475' },
] as const;
