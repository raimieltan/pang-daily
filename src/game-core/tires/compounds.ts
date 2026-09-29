/** Real tyre products. A product is immutable; an assembly owns its heat, wear and pressure. */
export const TIRE_COMPOUNDS = ['STOCK', 'STREET', 'SEMI_SLICK', 'SLICK', 'DRIFT'] as const;
export type TireCompound = typeof TIRE_COMPOUNDS[number];
export const TIRE_USES = ['DAILY', 'TOUGE', 'RAIN', 'TRACK', 'DRIFT', 'DRAG'] as const;
export type TireUse = typeof TIRE_USES[number];

export type TireDefinition = {
  id: string; name: string; brand: string; compound: TireCompound;
  widthMm: number; aspectRatio: number; wheelDiameterIn: number;
  dryGrip: number; wetGrip: number; longitudinalGrip: number; lateralGrip: number;
  breakawaySharpness: number; optimalTemperatureMinC: number; optimalTemperatureMaxC: number;
  coldGripMultiplier: number; overheatedGripMultiplier: number; heatGenerationRate: number;
  coolingRate: number; wearRate: number; smokeMultiplier: number; sidewallStiffness: number;
  rollingResistance: number; price: number; description: string; intendedUse: TireUse[];
};

const families: Record<TireCompound, Omit<TireDefinition, 'id' | 'widthMm' | 'aspectRatio' | 'wheelDiameterIn'>> = {
  STOCK: { name: 'JunGrip Eco 70', brand: 'JunGrip', compound: 'STOCK', dryGrip: .82, wetGrip: .78, longitudinalGrip: .82, lateralGrip: .80, breakawaySharpness: .55, optimalTemperatureMinC: 25, optimalTemperatureMaxC: 65, coldGripMultiplier: .95, overheatedGripMultiplier: .76, heatGenerationRate: .75, coolingRate: 1, wearRate: .45, smokeMultiplier: .75, sidewallStiffness: .65, rollingResistance: .85, price: 1900, description: 'Cheap, soft and long-lasting with a calm limit in the rain.', intendedUse: ['DAILY', 'RAIN'] },
  STREET: { name: 'Roadmaster ST-1', brand: 'Roadmaster', compound: 'STREET', dryGrip: 1, wetGrip: .88, longitudinalGrip: 1, lateralGrip: 1, breakawaySharpness: .68, optimalTemperatureMinC: 35, optimalTemperatureMaxC: 80, coldGripMultiplier: .91, overheatedGripMultiplier: .80, heatGenerationRate: .9, coolingRate: .92, wearRate: .70, smokeMultiplier: .9, sidewallStiffness: .82, rollingResistance: 1, price: 2850, description: 'Balanced street rubber: responsive turn-in and usable wet grip.', intendedUse: ['DAILY', 'TOUGE', 'RAIN'] },
  SEMI_SLICK: { name: 'TougePro R1', brand: 'TougePro', compound: 'SEMI_SLICK', dryGrip: 1.18, wetGrip: .62, longitudinalGrip: 1.16, lateralGrip: 1.20, breakawaySharpness: .82, optimalTemperatureMinC: 60, optimalTemperatureMaxC: 105, coldGripMultiplier: .76, overheatedGripMultiplier: .82, heatGenerationRate: 1.1, coolingRate: .78, wearRate: 1.15, smokeMultiplier: .95, sidewallStiffness: .95, rollingResistance: 1.08, price: 5400, description: 'Sharp warm dry grip for mountain roads and track days. Watch the rain.', intendedUse: ['TOUGE', 'TRACK'] },
  SLICK: { name: 'Circuit Max S', brand: 'Circuit Max', compound: 'SLICK', dryGrip: 1.32, wetGrip: .28, longitudinalGrip: 1.30, lateralGrip: 1.34, breakawaySharpness: .92, optimalTemperatureMinC: 75, optimalTemperatureMaxC: 115, coldGripMultiplier: .62, overheatedGripMultiplier: .78, heatGenerationRate: 1.18, coolingRate: .72, wearRate: 1.55, smokeMultiplier: .85, sidewallStiffness: 1, rollingResistance: 1.12, price: 8400, description: 'Race rubber with maximum dry bite once hot. Extremely poor in standing water.', intendedUse: ['TRACK'] },
  DRIFT: { name: 'Sideways D1', brand: 'Sideways', compound: 'DRIFT', dryGrip: .92, wetGrip: .64, longitudinalGrip: .90, lateralGrip: .91, breakawaySharpness: .48, optimalTemperatureMinC: 50, optimalTemperatureMaxC: 120, coldGripMultiplier: .85, overheatedGripMultiplier: .91, heatGenerationRate: 1.25, coolingRate: .82, wearRate: .95, smokeMultiplier: 1.6, sidewallStiffness: .90, rollingResistance: 1.05, price: 2700, description: 'Wide, controllable slides with heat tolerance and thick smoke.', intendedUse: ['DRIFT'] },
};

const sizes = [[155, 70, 13], [165, 70, 13], [175, 65, 13], [185, 60, 14], [195, 55, 15]] as const;
export const tireSize = (t: Pick<TireDefinition, 'widthMm' | 'aspectRatio' | 'wheelDiameterIn'>) => `${t.widthMm}/${t.aspectRatio}R${t.wheelDiameterIn}`;
export const TIRE_CATALOG: readonly TireDefinition[] = TIRE_COMPOUNDS.flatMap(compound => sizes.map(([widthMm, aspectRatio, wheelDiameterIn]) => {
  const f = families[compound];
  return { ...f, id: `${compound.toLowerCase()}_${widthMm}_${aspectRatio}r${wheelDiameterIn}`, widthMm, aspectRatio, wheelDiameterIn,
    price: Math.round(f.price * (1 + Math.max(0, widthMm - 165) * .006)) };
}));
export const tireDefinition = (id: string | undefined) => TIRE_CATALOG.find(t => t.id === id);
export const stockTireForWheel = (diameterIn = 13) => TIRE_CATALOG.find(t => t.compound === 'STOCK' && t.wheelDiameterIn === diameterIn) ?? TIRE_CATALOG[0];
export function temperatureGripMultiplier(tire: TireDefinition, temperatureC: number) {
  if (temperatureC < tire.optimalTemperatureMinC) {
    const span = Math.max(1, tire.optimalTemperatureMinC - 5);
    const amount = Math.min(1, Math.max(0, (tire.optimalTemperatureMinC - temperatureC) / span));
    return 1 - (1 - tire.coldGripMultiplier) * amount * amount;
  }
  if (temperatureC <= tire.optimalTemperatureMaxC) return 1;
  const amount = Math.min(1, (temperatureC - tire.optimalTemperatureMaxC) / 55);
  return 1 - (1 - tire.overheatedGripMultiplier) * amount * amount;
}
export function wearGripMultiplier(condition: number, wet: boolean) {
  const c = Math.max(0, Math.min(1, condition));
  return wet ? .35 + .65 * Math.pow(c, 1.8) : .55 + .45 * Math.pow(c, .7);
}
