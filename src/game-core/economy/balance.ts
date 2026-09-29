/** Authoritative M2 tuning. PHP, liters, kilometers and real play minutes. No live prices. */
export type PriceBand = readonly [number, number];
export const EARLY_ECONOMY = {
  startingCashPhp: 5000,
  fuel: { capacityLiters: 45, pricePhpPerLiter: 65, litersPerKm: .2, throttlePremium: .5, defaultPurchaseLiters: 5 },
  maintenance: { oil_change: { label: 'Oil change', costPhp: 900 }, fluids: { label: 'Fluid service', costPhp: 350 }, tune_up: { label: 'Tune-up', costPhp: 1200 } },
  repair: { representativeCondition: { light: .96, medium: .75, severe: .3 }, partsScarcityPremium: .3, roundingPhp: 10, light: [150, 500], medium: [900, 2000], severe: [3000, 5000] },
  usedParts: { common: [600, 2000], desirable: [2500, 6500], aspirational: [8000, 14000], inspectionPhp: 150, riskReserveFraction: .2,
    gradePrice: { like_new: 1, good: .82, fair: .6, as_is: .38 }, haggleSpread: .1, smallPriceStep: 50, largePriceStep: 100, largePriceThreshold: 5000 },
  representativePart: { templateId: 'stock_shocks_set', askingPricePhp: 1600, actualCondition: .55 },
  raceValidation: { paidWinsPerRoute: 3, winProbability: .6, loopMinutes: 4, travelKm: 1 },
  wear: { racingMultiplier: 1.5, engineThrottle: 1.5, transmissionThrottle: 1, brakeBase: .35, brakeLoad: 4, tireSlip: 3, tireHandbrake: 4 },
  recovery: { jobId: 'talyer_oil_errand', fuelRequiredLiters: 0, reserveCanMaxLiters: 5, emptyTankThresholdLiters: .5, solvencyTargetPhp: 900, maxActivities: 3 },
  validation: { ordinaryNetPhp: 350, walletVariancePhp: 250, finalWalletVariancePhp: 750, fuelVarianceLiters: 1, conditionVariance: .03, maxNetPerMinuteRatio: 2 },
} as const;
/** Time includes board access, loading, travel and return; fuel covers return to hub. */
export const JOB_BALANCE = {
  "kyo_ice_run": {
    "payoutPhp": 450,
    "bonusPhp": 0,
    "minutes": 5,
    "travelKm": 0.8,
    "risk": "low"
  },
  "kyo_pastry_round": {
    "payoutPhp": 560,
    "bonusPhp": 0,
    "minutes": 7,
    "travelKm": 1.2,
    "risk": "low"
  },
  "kyo_overlook_catering": {
    "minFuelLiters": 2.3,
    "payoutPhp": 950,
    "bonusPhp": 250,
    "minutes": 12,
    "travelKm": 6,
    "risk": "medium"
  },
  "kyo_bean_pickup": {
    "minFuelLiters": 4.1,
    "payoutPhp": 1500,
    "bonusPhp": 0,
    "minutes": 18,
    "travelKm": 12,
    "risk": "medium"
  },
  "talyer_oil_errand": {
    "payoutPhp": 300,
    "bonusPhp": 0,
    "minutes": 5,
    "travelKm": 0,
    "risk": "low"
  },
  "talyer_battery_drop": {
    "minFuelLiters": 0.86,
    "payoutPhp": 650,
    "bonusPhp": 0,
    "minutes": 7,
    "travelKm": 1.2,
    "risk": "low"
  },
  "talyer_alternator_drop": {
    "minFuelLiters": 1.1,
    "payoutPhp": 600,
    "bonusPhp": 0,
    "minutes": 8,
    "travelKm": 2,
    "risk": "medium"
  },
  "talyer_rims_pickup": {
    "minFuelLiters": 2.0,
    "payoutPhp": 800,
    "bonusPhp": 0,
    "minutes": 12,
    "travelKm": 5,
    "risk": "medium"
  },
  "hatid_suki_home": {
    "payoutPhp": 380,
    "bonusPhp": 100,
    "minutes": 5,
    "travelKm": 0.6,
    "risk": "low"
  },
  "fuel_lpg_delivery": {
    "payoutPhp": 340,
    "bonusPhp": 0,
    "minutes": 5,
    "travelKm": 0.6,
    "risk": "low"
  },
  "hatid_overlook": {
    "minFuelLiters": 2.3,
    "payoutPhp": 740,
    "bonusPhp": 200,
    "minutes": 12,
    "travelKm": 6,
    "risk": "medium"
  }
} as const;
export type EarlyJobId = keyof typeof JOB_BALANCE;
export const PAYOUT_BANDS = { delivery: [340, 1200], errand: [300, 650], pickup: [800, 1500], passenger: [380, 940], lowStakesRace: [400, 700] } as const satisfies Record<string, PriceBand>;
export const SERVICE_BALANCE = {
  engine: { fullRepairPhp: 1800, wearPerKm: .002, impactLoss: .045 },
  transmission: { fullRepairPhp: 1400, wearPerKm: .0015, impactLoss: .025 },
  brakes: { fullRepairPhp: 700, wearPerKm: .0025, impactLoss: .035 },
  suspension: { fullRepairPhp: 1100, wearPerKm: .002, impactLoss: .15 },
  tires: { fullRepairPhp: 900, wearPerKm: .0045, impactLoss: .09 },
} as const;
export const jobsForCost = (php: number) => Math.ceil(php / EARLY_ECONOMY.validation.ordinaryNetPhp);
export const RACE_REWARDS = {
  "barangay_sprint": 400,
  "kyo_block_lap": 400,
  "terrace_sprint": 700,
  "pahuway_descent": 1100,
  "the_wall": 1600,
  "midnight_run": 3000,
  "alimodian_maasin": 0,
  "maasin_alimodian": 0
} as const;
/** Catalog prices before advertised-grade discount and asking-price spread. */
export const PART_PRICE_RANGES = {
  parts_used_coilovers_01: [6500, 9000],
  parts_stock_shocks_set: [1800, 2600],
  parts_lowering_springs: [2500, 3800],
  parts_tires_195_55: [4000, 6500],
  parts_brake_pads_front: [1200, 2000],
  parts_surplus_alternator: [2200, 3500],
  parts_surplus_head: [8000, 13000],
  parts_gearbox_5spd: [9000, 14000],
  parts_clutch_kit: [2500, 4200],
  parts_muffler_canister: [1500, 2800],
  parts_projector_headlights: [3000, 5200],
  parts_bucket_seat: [4500, 8000],
  wheels_steelies_14: [1500, 2400],
  wheels_mags_15_4x100: [7000, 11000],
  wheels_oversized_17_deep_dish: [5500, 9500],
  exterior_universal_rubber_lip: [800, 1500],
  exterior_acp_chin_splitter: [1200, 2200],
  exterior_dalagan_fiberglass_skirts: [3500, 5500],
  exterior_dalagan_ducktail: [1800, 3000],
  exterior_marketplace_gt_wing: [4500, 8000],
  exterior_dalagan_primer_bumper: [2500, 4000],
  exterior_evo_type_front_bumper: [7000, 12000],
  exterior_dalagan_red_fender_fl: [1200, 2200],
  exterior_vented_carbon_look_hood: [6500, 10000],
  performance_default: [1500, 3000],
  performance_stock_carb_engine: [8000, 14000],
  performance_surplus_16_efi: [22000, 35000],
  performance_efi_wiring: [2500, 4500],
  performance_efi_conversion: [6500, 11000],
  performance_used_small_turbo: [9000, 16000],
  performance_cheap_radiator: [1800, 3500],
  performance_unknown_ecu: [3500, 6500],
  performance_stock_clutch: [800, 1500],
  performance_uprated_clutch: [4000, 6500],
  performance_close_ratio_gearbox: [12000, 18000],
  performance_used_lsd: [9000, 14000],
  performance_talyer_exhaust: [2000, 4000],
} as const satisfies Record<string, PriceBand>;
export const PERFORMANCE_LABOR = {
  engine: 3500, fuel_system: 1800, intake: 250, exhaust: 600, turbo: 2500,
  cooling: 650, ecu: 800, clutch: 1500, transmission: 2500, differential: 1800, supporting_mod: 350,
};
/** Tito Jun re-aligns, re-maps and sets the diff for a street or drift tune. Flat per change. */
export const TUNE_LABOR_PHP = 1200;
