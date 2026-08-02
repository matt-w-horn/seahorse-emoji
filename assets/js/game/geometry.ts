// Polyhedra and the perspective projection. No DOM, no renderer.
//
// These are drawing shapes only. Collision in sim.ts is sphere-against-sphere
// off the SIZES radii, so a rock's silhouette and its hitbox are deliberately
// not the same thing: matching them would make grazes depend on tumble angle.

import type { Vec3, Edge, Face, Projected } from './types.ts';

// icosahedron: 12 vertices from the golden ratio, 30 edges (the rocks)
const PHI = (1 + Math.sqrt(5)) / 2;
const IVERTS: Vec3[] = [];
([[0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI],
  [1, PHI, 0], [1, -PHI, 0], [-1, PHI, 0], [-1, -PHI, 0],
  [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]] as Vec3[]).forEach(function (v) {
  const n = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  IVERTS.push([v[0] / n, v[1] / n, v[2] / n]);
});

// octahedron: 6 vertices (hunters and pickups — visibly not a rock)
const OVERTS: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// edges join vertices closer than a cutoff; faces are mutually-adjacent
// triples, which for these two solids is exactly the face set (20 and 8)
function vdist(verts: Vec3[], p: number, q: number): number {
  const dx = verts[p][0] - verts[q][0], dy = verts[p][1] - verts[q][1], dz = verts[p][2] - verts[q][2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function deriveEdges(verts: Vec3[], cutoff: number): Edge[] {
  const out: Edge[] = [];
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      if (vdist(verts, i, j) < cutoff) out.push([i, j]);
    }
  }
  return out;
}

export function deriveFaces(verts: Vec3[], cutoff: number): Face[] {
  const out: Face[] = [];
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      for (let k = j + 1; k < verts.length; k++) {
        if (vdist(verts, i, j) < cutoff && vdist(verts, j, k) < cutoff && vdist(verts, i, k) < cutoff) {
          out.push([i, j, k]);
        }
      }
    }
  }
  return out;
}

export const ICO = { verts: IVERTS, edges: deriveEdges(IVERTS, 1.1), faces: deriveFaces(IVERTS, 1.1) };
export const OCT = { verts: OVERTS, edges: deriveEdges(OVERTS, 1.5), faces: deriveFaces(OVERTS, 1.5) };

export function rotate(v: Vec3, ax: number, ay: number): Vec3 {
  const ca = Math.cos(ax), sa = Math.sin(ax);
  const cb = Math.cos(ay), sb = Math.sin(ay);
  const y = v[1] * ca - v[2] * sa;
  let z = v[1] * sa + v[2] * ca;              // rotate X
  const x = v[0] * cb + z * sb;
  z = -v[0] * sb + z * cb;                    // rotate Y
  return [x, y, z];
}

// perspective; returns null when at/behind the eye
export function project(x: number, y: number, z: number, f: number): Projected | null {
  if (z <= 1) return null;
  const s = f / z;
  return { x: x * s, y: y * s, s: s };
}
