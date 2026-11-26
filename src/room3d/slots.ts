/** World positions of the named memory slots. The room spans x 0..6 and z 0..6, y is up. */
export type SlotPose = { x: number; y: number; z: number; rotY: number; wall: boolean }

const shelfXs = [4.4, 5.0, 5.6]

export const SLOT_POSES: Record<string, SlotPose> = {
  'shelf-1': { x: shelfXs[0]!, y: 1.7, z: 0.3, rotY: 0, wall: false },
  'shelf-2': { x: shelfXs[1]!, y: 1.7, z: 0.3, rotY: 0, wall: false },
  'shelf-3': { x: shelfXs[2]!, y: 1.7, z: 0.3, rotY: 0, wall: false },
  'shelf-4': { x: shelfXs[0]!, y: 0.9, z: 0.3, rotY: 0, wall: false },
  'shelf-5': { x: shelfXs[1]!, y: 0.9, z: 0.3, rotY: 0, wall: false },
  'shelf-6': { x: shelfXs[2]!, y: 0.9, z: 0.3, rotY: 0, wall: false },
  'desk-1': { x: 1.1, y: 0.8, z: 0.8, rotY: 0.3, wall: false },
  'desk-2': { x: 1.5, y: 0.8, z: 0.82, rotY: -0.2, wall: false },
  'desk-3': { x: 1.85, y: 0.8, z: 0.62, rotY: 0.5, wall: false },
  'sill-1': { x: 2.95, y: 1.03, z: 0.13, rotY: 0.2, wall: false },
  'sill-2': { x: 3.5, y: 1.03, z: 0.13, rotY: -0.3, wall: false },
  // Dresser / cabinet top at x≈3.2, z≈0.3. Kept below the window sill (y=1.03) so nothing overlaps.
  'cabinet-1': { x: 2.78, y: 0.86, z: 0.36, rotY: 0.18, wall: false },
  'cabinet-2': { x: 3.2, y: 0.86, z: 0.36, rotY: -0.12, wall: false },
  'cabinet-3': { x: 3.62, y: 0.86, z: 0.36, rotY: 0.22, wall: false },
  // Hung on the left wall (x = 0), facing into the room (+x).
  'wall-1': { x: 0.03, y: 1.9, z: 1.35, rotY: Math.PI / 2, wall: true },
  'wall-2': { x: 0.03, y: 1.9, z: 2.15, rotY: Math.PI / 2, wall: true },
  'wall-3': { x: 0.03, y: 1.9, z: 2.95, rotY: Math.PI / 2, wall: true },
  'wall-4': { x: 0.03, y: 1.9, z: 3.65, rotY: Math.PI / 2, wall: true },
}

export function cellCenter(x: number, z: number): [number, number] {
  return [x + 0.5, z + 0.5]
}
