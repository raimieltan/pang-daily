import { defineJob, type JobDefinition } from './jobs';
/** Canonical authored jobs; coordinates are content, not live runtime transforms. */
export const HUB_JOBS: readonly JobDefinition[] = [
  {
    "id": "kyo_ice_run",
    "type": "delivery",
    "title": "Ice & milk run",
    "description": "Kyo ran out of ice before the late crowd. Grab the order at Suki 24 and bring it back without sloshing it everywhere.",
    "payoutPhp": 450,
    "offeredAt": [
      "kyo_job_board"
    ],
    "requirements": {
      "mode": "driving"
    },
    "objectives": [
      {
        "id": "pickup",
        "label": "Pick up the order at Suki 24",
        "prompt": "Load ice & milk",
        "locationName": "Suki 24",
        "area": {
          "x": -68,
          "z": 11.5,
          "radius": 10
        },
        "mode": "driving",
        "maxSpeedKmh": 3,
        "cargo": "load"
      },
      {
        "id": "dropoff",
        "label": "Deliver to Kyo Coffee",
        "prompt": "Hand over the order",
        "locationName": "Kyo Coffee",
        "area": {
          "x": 130.5,
          "z": 98,
          "radius": 9
        },
        "mode": "driving",
        "maxSpeedKmh": 3,
        "cargo": "unload"
      }
    ],
    "timeLimitSeconds": 240,
    "cargo": {
      "label": "Ice & milk",
      "kind": "goods",
      "maxDamage": 0.5,
      "impactDamage": 0.4
    }
  },
  {
    "id": "kyo_pastry_round",
    "type": "delivery",
    "title": "Ensaymada round",
    "description": "Three standing orders for ensaymada boxes: Suki 24, the Bahandi kiosk, and the neighbour by your place. Keep them flat.",
    "payoutPhp": 560,
    "offeredAt": [
      "kyo_job_board"
    ],
    "requirements": {
      "mode": "driving"
    },
    "objectives": [
      {
        "id": "pickup",
        "label": "Load pastry boxes at Kyo",
        "prompt": "Load pastry boxes",
        "locationName": "Kyo Coffee",
        "area": {
          "x": 130.5,
          "z": 98,
          "radius": 9
        },
        "mode": "driving",
        "maxSpeedKmh": 3,
        "cargo": "load"
      },
      {
        "id": "suki",
        "label": "Drop a box at Suki 24",
        "prompt": "Drop off a box",
        "locationName": "Suki 24",
        "area": {
          "x": -68,
          "z": 11.5,
          "radius": 10
        },
        "mode": "driving",
        "maxSpeedKmh": 3
      },
      {
        "id": "bahandi",
        "label": "Drop a box at the Bahandi kiosk",
        "prompt": "Drop off a box",
        "locationName": "Bahandi Fuels",
        "area": {
          "x": 38,
          "z": 22,
          "radius": 8
        },
        "mode": "driving",
        "maxSpeedKmh": 3
      },
      {
        "id": "dropoff",
        "label": "Walk the last box to the neighbour",
        "prompt": "Hand over the last box",
        "locationName": "Neighbour's porch",
        "area": {
          "x": -50,
          "z": 151.5,
          "radius": 3
        },
        "mode": "walking",
        "maxSpeedKmh": 3,
        "cargo": "unload"
      }
    ],
    "timeLimitSeconds": 360,
    "cargo": {
      "label": "Pastry boxes",
      "kind": "goods",
      "maxDamage": 0.6,
      "impactDamage": 0.3
    }
  },
  {
    "id": "kyo_overlook_catering",
    "type": "delivery",
    "title": "Coffee for the overlook",
    "description": "A car club booked Kyo for their Pahuway meet. Get the urns and pastry boxes up the mountain while it is still hot.",
    "payoutPhp": 950,
    "offeredAt": [
      "kyo_job_board"
    ],
    "requirements": {
      "mode": "driving",
      "minFuelLiters": 10
    },
    "objectives": [
      {
        "id": "pickup",
        "label": "Load the urns at Kyo",
        "prompt": "Load coffee urns",
        "locationName": "Kyo Coffee",
        "area": {
          "x": 130.5,
          "z": 98,
          "radius": 9
        },
        "mode": "driving",
        "maxSpeedKmh": 3,
        "cargo": "load"
      },
      {
        "id": "dropoff",
        "label": "Set up at Pahuway overlook",
        "prompt": "Hand over the urns",
        "locationName": "Pahuway overlook",
        "area": {
          "x": 2222.567454675979,
          "z": 3048.3837240625935,
          "radius": 12
        },
        "mode": "driving",
        "maxSpeedKmh": 3,
        "cargo": "unload"
      }
    ],
    "timeLimitSeconds": 600,
    "cargo": {
      "label": "Coffee urns",
      "kind": "goods",
      "maxDamage": 0.55,
      "impactDamage": 0.35
    },
    "bonus": {
      "label": "tip for hot, unspilled coffee",
      "php": 250,
      "withinSeconds": 450,
      "maxDamage": 0.2
    }
  },
  {
    "id": "kyo_bean_pickup",
    "type": "pickup",
    "title": "Beans from Maasin",
    "description": "The roaster in Maasin has Kyo's sacks ready. Drive the whole mountain, load up, and bring them down before closing.",
    "payoutPhp": 1500,
    "offeredAt": [
      "kyo_job_board"
    ],
    "requirements": {
      "mode": "driving",
      "minFuelLiters": 18
    },
    "objectives": [
      {
        "id": "pickup",
        "label": "Load the sacks at the Maasin market",
        "prompt": "Load coffee sacks",
        "locationName": "Maasin market",
        "area": {
          "x": 3189.9999999999995,
          "z": 4315.8,
          "radius": 8
        },
        "mode": "driving",
        "maxSpeedKmh": 3,
        "cargo": "load"
      },
      {
        "id": "dropoff",
        "label": "Bring them back to Kyo",
        "prompt": "Unload coffee sacks",
        "locationName": "Kyo Coffee",
        "area": {
          "x": 130.5,
          "z": 98,
          "radius": 9
        },
        "mode": "driving",
        "maxSpeedKmh": 3,
        "cargo": "unload"
      }
    ],
    "timeLimitSeconds": 1200,
    "cargo": {
      "label": "Coffee sacks",
      "kind": "goods",
      "maxDamage": 0.9,
      "impactDamage": 0.15
    }
  },
  {
    "id": "talyer_oil_errand",
    "type": "errand",
    "title": "Oil & coolant for Mang Boy",
    "description": "Mang Boy is out of 20W-50 and coolant. Pick up the order he called in at the Bahandi Fuels kiosk and bring it to the bay.",
    "payoutPhp": 300,
    "offeredAt": [
      "talyer_job_board"
    ],
    "requirements": {},
    "objectives": [
      {
        "id": "pickup",
        "label": "Collect the order at the Bahandi kiosk",
        "prompt": "Collect oil & coolant",
        "locationName": "Bahandi Fuels",
        "area": {
          "x": 50,
          "z": 32.6,
          "radius": 2.2
        },
        "mode": "walking",
        "maxSpeedKmh": 3,
        "cargo": "load"
      },
      {
        "id": "dropoff",
        "label": "Hand it to Mang Boy",
        "prompt": "Hand over the parts",
        "locationName": "Talyer ni Mang Boy",
        "area": {
          "x": 20,
          "z": 153,
          "radius": 3
        },
        "mode": "walking",
        "maxSpeedKmh": 3,
        "cargo": "unload"
      }
    ],
    "cargo": {
      "label": "Oil & coolant",
      "kind": "goods",
      "maxDamage": 0.9,
      "impactDamage": 0.25
    }
  },
  {
    "id": "talyer_battery_drop",
    "type": "errand",
    "title": "Battery for a stalled suki",
    "description": "One of Mang Boy's regulars died on the shoulder out by the mountain road. Take a charged battery to them before they give up and call a tow.",
    "payoutPhp": 650,
    "offeredAt": [
      "talyer_job_board"
    ],
    "requirements": {
      "mode": "driving",
      "minFuelLiters": 6
    },
    "objectives": [
      {
        "id": "pickup",
        "label": "Load the battery at the talyer",
        "prompt": "Load the battery",
        "locationName": "Talyer ni Mang Boy",
        "area": {
          "x": 22,
          "z": 147.5,
          "radius": 6
        },
        "mode": "driving",
        "maxSpeedKmh": 3,
        "cargo": "load"
      },
      {
        "id": "dropoff",
        "label": "Hand it over on the main road shoulder",
        "prompt": "Hand over the battery",
        "locationName": "Main Road shoulder",
        "area": {
          "x": 236,
          "z": -8,
          "radius": 5
        },
        "mode": "walking",
        "maxSpeedKmh": 3,
        "cargo": "unload"
      }
    ],
    "timeLimitSeconds": 300,
    "cargo": {
      "label": "Car battery",
      "kind": "goods",
      "maxDamage": 0.7,
      "impactDamage": 0.3
    }
  },
  {
    "id": "talyer_alternator_drop",
    "type": "delivery",
    "title": "Alternator to Alimodian",
    "description": "Mang Boy rebuilt an alternator for a suki just past the Alimodian sign. Park on the shoulder and walk it to the gate.",
    "payoutPhp": 600,
    "offeredAt": [
      "talyer_job_board"
    ],
    "requirements": {
      "mode": "driving",
      "minFuelLiters": 5
    },
    "objectives": [
      {
        "id": "pickup",
        "label": "Load the alternator at the talyer",
        "prompt": "Load the alternator",
        "locationName": "Talyer ni Mang Boy",
        "area": {
          "x": 22,
          "z": 147.5,
          "radius": 6
        },
        "mode": "driving",
        "maxSpeedKmh": 3,
        "cargo": "load"
      },
      {
        "id": "park",
        "label": "Pull over in Alimodian",
        "prompt": "Park on the shoulder",
        "locationName": "Alimodian",
        "area": {
          "x": 560.2401633160189,
          "z": 42.32733440483888,
          "radius": 8
        },
        "mode": "driving",
        "maxSpeedKmh": 3
      },
      {
        "id": "dropoff",
        "label": "Walk it to the gate",
        "prompt": "Hand over the alternator",
        "locationName": "Alimodian",
        "area": {
          "x": 555.322068088354,
          "z": 50.68809629186922,
          "radius": 3
        },
        "mode": "walking",
        "maxSpeedKmh": 3,
        "cargo": "unload"
      }
    ],
    "timeLimitSeconds": 420,
    "cargo": {
      "label": "Alternator",
      "kind": "goods",
      "maxDamage": 0.8,
      "impactDamage": 0.25
    }
  },
  {
    "id": "talyer_rims_pickup",
    "type": "pickup",
    "title": "Rims from the terraces",
    "description": "A farmer up at the vegetable terraces is selling a set of used rims. Mang Boy already paid. Go fetch them.",
    "payoutPhp": 800,
    "offeredAt": [
      "talyer_job_board"
    ],
    "requirements": {
      "mode": "driving",
      "minFuelLiters": 8
    },
    "objectives": [
      {
        "id": "pickup",
        "label": "Load the rims at the terrace stall",
        "prompt": "Load the rims",
        "locationName": "Terrace stall",
        "area": {
          "x": 1325.222084803875,
          "z": 639.5239585601157,
          "radius": 8
        },
        "mode": "driving",
        "maxSpeedKmh": 3,
        "cargo": "load"
      },
      {
        "id": "dropoff",
        "label": "Bring them to the talyer",
        "prompt": "Unload the rims",
        "locationName": "Talyer ni Mang Boy",
        "area": {
          "x": 22,
          "z": 147.5,
          "radius": 6
        },
        "mode": "driving",
        "maxSpeedKmh": 3,
        "cargo": "unload"
      }
    ],
    "timeLimitSeconds": 720,
    "cargo": {
      "label": "Used rims",
      "kind": "goods",
      "maxDamage": 0.95,
      "impactDamage": 0.1
    }
  },
  {
    "id": "hatid_suki_home",
    "type": "passenger",
    "title": "Hatid: Manang Lorna",
    "description": "Manang Lorna has too many grocery bags for a jeepney. Pick her up at Suki 24 and bring her home, gently.",
    "payoutPhp": 380,
    "offeredAt": [
      "fuel_job_board"
    ],
    "requirements": {
      "mode": "driving"
    },
    "objectives": [
      {
        "id": "pickup",
        "label": "Pick up Manang Lorna at Suki 24",
        "prompt": "Let Manang Lorna in",
        "locationName": "Suki 24",
        "area": {
          "x": -68,
          "z": 11.5,
          "radius": 10
        },
        "mode": "driving",
        "maxSpeedKmh": 3,
        "cargo": "load"
      },
      {
        "id": "dropoff",
        "label": "Drop her off at home",
        "prompt": "Drop off Manang Lorna",
        "locationName": "Home",
        "area": {
          "x": -78,
          "z": 151,
          "radius": 5
        },
        "mode": "driving",
        "maxSpeedKmh": 3,
        "cargo": "unload"
      }
    ],
    "cargo": {
      "label": "Manang Lorna",
      "kind": "passenger",
      "maxDamage": 0.6,
      "impactDamage": 0.25
    },
    "bonus": {
      "label": "tip for a quick, smooth ride",
      "php": 100,
      "withinSeconds": 120,
      "maxDamage": 0.15
    }
  },
  {
    "id": "fuel_lpg_delivery",
    "type": "delivery",
    "title": "LPG for the neighbour",
    "description": "Your neighbour ran out of gas mid-sinigang. Load a full tank at the forecourt and carry it to their porch. Upright.",
    "payoutPhp": 340,
    "offeredAt": [
      "fuel_job_board"
    ],
    "requirements": {
      "mode": "driving"
    },
    "objectives": [
      {
        "id": "pickup",
        "label": "Load the tank on the forecourt",
        "prompt": "Load the LPG tank",
        "locationName": "Bahandi Fuels",
        "area": {
          "x": 38,
          "z": 22,
          "radius": 8
        },
        "mode": "driving",
        "maxSpeedKmh": 3,
        "cargo": "load"
      },
      {
        "id": "dropoff",
        "label": "Carry it to the neighbour's porch",
        "prompt": "Hand over the tank",
        "locationName": "Neighbour's porch",
        "area": {
          "x": -50,
          "z": 151.5,
          "radius": 3
        },
        "mode": "walking",
        "maxSpeedKmh": 3,
        "cargo": "unload"
      }
    ],
    "timeLimitSeconds": 300,
    "cargo": {
      "label": "LPG tank",
      "kind": "goods",
      "maxDamage": 0.5,
      "impactDamage": 0.35
    }
  },
  {
    "id": "hatid_overlook",
    "type": "passenger",
    "title": "Hatid: Pahuway sunset",
    "description": "Two college kids at the Bahandi meet spot missed the last jeep. Take them up to Pahuway overlook. They get carsick.",
    "payoutPhp": 720,
    "offeredAt": [
      "fuel_job_board"
    ],
    "requirements": {
      "mode": "driving",
      "minFuelLiters": 10
    },
    "objectives": [
      {
        "id": "pickup",
        "label": "Pick them up at the meet spot",
        "prompt": "Let the riders in",
        "locationName": "Bahandi Fuels",
        "area": {
          "x": 40,
          "z": 14,
          "radius": 8
        },
        "mode": "driving",
        "maxSpeedKmh": 3,
        "cargo": "load"
      },
      {
        "id": "dropoff",
        "label": "Drop them at Pahuway overlook",
        "prompt": "Drop off the riders",
        "locationName": "Pahuway overlook",
        "area": {
          "x": 2222.567454675979,
          "z": 3048.3837240625935,
          "radius": 12
        },
        "mode": "driving",
        "maxSpeedKmh": 3,
        "cargo": "unload"
      }
    ],
    "cargo": {
      "label": "Two riders",
      "kind": "passenger",
      "maxDamage": 0.6,
      "impactDamage": 0.2
    },
    "bonus": {
      "label": "tip for a smooth climb",
      "php": 200,
      "maxDamage": 0.15
    }
  }
].map(job => defineJob(job as Parameters<typeof defineJob>[0]));
export const KYO_ICE_RUN = HUB_JOBS.find(job => job.id === 'kyo_ice_run')!;
export const TALYER_OIL_ERRAND = HUB_JOBS.find(job => job.id === 'talyer_oil_errand')!;
export const TALYER_BATTERY_DROP = HUB_JOBS.find(job => job.id === 'talyer_battery_drop')!;
export const HATID_SUKI_HOME = HUB_JOBS.find(job => job.id === 'hatid_suki_home')!;
export const KYO_OVERLOOK_CATERING = HUB_JOBS.find(job => job.id === 'kyo_overlook_catering')!;
export const KYO_BEAN_PICKUP = HUB_JOBS.find(job => job.id === 'kyo_bean_pickup')!;
export const KYO_PASTRY_ROUND = HUB_JOBS.find(job => job.id === 'kyo_pastry_round')!;
export const TALYER_RIMS_PICKUP = HUB_JOBS.find(job => job.id === 'talyer_rims_pickup')!;
export const TALYER_ALTERNATOR_DROP = HUB_JOBS.find(job => job.id === 'talyer_alternator_drop')!;
export const FUEL_LPG_DELIVERY = HUB_JOBS.find(job => job.id === 'fuel_lpg_delivery')!;
export const HATID_OVERLOOK = HUB_JOBS.find(job => job.id === 'hatid_overlook')!;
export const KYO_JOB_BOARD = 'kyo_job_board';
export const TALYER_JOB_BOARD = 'talyer_job_board';
export const FUEL_JOB_BOARD = 'fuel_job_board';
