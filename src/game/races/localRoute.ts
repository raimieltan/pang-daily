import { filletPolyline } from "../world/layoutTools";
import type { Gate, RaceDefinition } from "./Race";
const gate = (id: string, x: number, z: number, east = true): Gate => ({
  id, center: { x, y: 1, z }, halfSize: { x: east ? 1.5 : 5, y: 3, z: east ? 5 : 1.5 },
});
/** Short north-street sprint with one readable right bend and a drive-away past the finish. */
export const LOCAL_ROUTE: RaceDefinition = {
  id: "barangay_sprint", name: "Barangay sprint", mode: "point-to-point",
  start: { x: -65, y: 0, z: 137.5 }, heading: Math.PI / 2,
  checkpoints: [gate("North street", -20, 140), gate("Brake for right", 78, 140), gate("Coffee bend", 120, 108, false)],
  finish: gate("Coffee shop finish", 120, 72, false),
  waypoints: filletPolyline([{ x: -65, z: 142, width: 9 }, { x: 122, z: 142, width: 9 }, { x: 122, z: 32, width: 9 }], 24)
    .map((p, i, all) => ({ x: p.x, y: 0, z: p.z, speed: i === 0 || i === all.length - 1 ? 19 : 10 })),
};
