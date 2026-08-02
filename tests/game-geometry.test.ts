// Tests for the polyhedra and the perspective projection.
// Run: node --experimental-strip-types --test tests/*.test.ts
import test from 'node:test';
import assert from 'node:assert';
import { ICO, OCT, rotate, project } from '../assets/js/game/geometry.ts';
import { FOCAL } from '../assets/js/game/sim.ts';
import type { Edge, Face } from '../assets/js/game/types.ts';

test('icosahedron topology: 12 vertices, 30 edges, unit-ish radius, valid indices', () => {
  assert.equal(ICO.verts.length, 12);
  assert.equal(ICO.edges.length, 30);
  for (const v of ICO.verts) {
    const n = Math.hypot(v[0], v[1], v[2]);
    assert.ok(Math.abs(n - 1) < 1e-9, 'vertex normalized');
  }
  for (const [a, b] of ICO.edges) {
    assert.ok(a >= 0 && a < 12 && b >= 0 && b < 12 && a !== b);
  }
});

test('octahedron topology: 6 vertices, 12 edges, unit radius, valid indices', () => {
  assert.equal(OCT.verts.length, 6);
  assert.equal(OCT.edges.length, 12);
  for (const v of OCT.verts) {
    assert.ok(Math.abs(Math.hypot(v[0], v[1], v[2]) - 1) < 1e-9, 'vertex normalized');
  }
  for (const [a, b] of OCT.edges) {
    assert.ok(a >= 0 && a < 6 && b >= 0 && b < 6 && a !== b);
  }
});

test('polyhedron faces: icosahedron 20 triangles, octahedron 8, all face edges are real edges', () => {
  assert.equal(ICO.faces.length, 20);
  assert.equal(OCT.faces.length, 8);
  const checkFaces = (edges: Edge[], faces: Face[]) => {
    const has = new Set(edges.map(([a, b]) => (a < b ? a + '-' + b : b + '-' + a)));
    for (const [i, j, k] of faces) {
      assert.equal(new Set([i, j, k]).size, 3, 'three distinct vertices');
      for (const [p, q] of [[i, j], [j, k], [i, k]]) {
        assert.ok(has.has(p < q ? p + '-' + q : q + '-' + p), 'face edge exists in the edge list');
      }
    }
  };
  checkFaces(ICO.edges, ICO.faces);
  checkFaces(OCT.edges, OCT.faces);
});

test('project: perspective shrinks with depth, center is invariant, eye plane is null', () => {
  const near = project(100, 50, 200, FOCAL);
  const far = project(100, 50, 1000, FOCAL);
  assert.ok(near!.s > far!.s, 'closer is larger');
  assert.ok(Math.abs(near!.x) > Math.abs(far!.x), 'closer displaces more');
  const center = project(0, 0, 500, FOCAL);
  assert.equal(center!.x, 0);
  assert.equal(center!.y, 0);
  assert.equal(project(1, 1, 0, FOCAL), null);
  assert.equal(project(1, 1, -5, FOCAL), null);
});

test('rotate: pure rotation preserves vector length', () => {
  const v = rotate([0.3, -0.7, 0.648], 1.1, 2.3);
  assert.ok(Math.abs(Math.hypot(v[0], v[1], v[2]) - Math.hypot(0.3, 0.7, 0.648)) < 1e-9);
});
