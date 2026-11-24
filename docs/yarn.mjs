const TAU = 2 * Math.PI;

// Local stitch coordinates: along the round, up the fabric, out of the fabric.
// The path follows both arms of a V and the crown that joins adjacent stitches.
const path = [
  [-0.53, 0.76, 0.01], [-0.38, 0.72, 0.12], [-0.17, 0.25, 0.18],
  [-0.04, 0.09, 0.11], [0.13, 0.29, 0.12], [0.35, 0.83, 0.18],
  [0.47, 0.97, 0.10], [0.50, 0.90, -0.01], [0.47, 0.76, 0.01]
];

function pointAt(t) {
  const segment = Math.min(path.length - 2, Math.floor(t));
  const u = t - segment;
  const [a, b, c, d] = [-1, 0, 1, 2].map(k => path[Math.max(0, Math.min(path.length - 1, segment + k))]);
  return b.map((v, axis) => v + 0.5 * u * ((c[axis] - a[axis]) +
    u * (2*a[axis] - 5*v + 4*c[axis] - d[axis] + u*(3*v - 3*c[axis] + d[axis] - a[axis]))));
}

function unit(v) {
  const length = Math.hypot(...v) || 1;
  return v.map(x => x / length);
}

function cross(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}

// Built once per WebGL context. All stitches share the same two-ply mesh.
export function yarnTemplate(steps = 32, sides = 6) {
  const vertices = [], indices = [];
  for (let ply = 0; ply < 2; ply++) {
    const start = vertices.length / 6;
    let length = 0, previous;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps * (path.length - 1);
      const p = pointAt(t);
      const before = pointAt(Math.max(0, t - 0.01)), after = pointAt(Math.min(path.length - 1, t + 0.01));
      const tangent = unit(after.map((v, k) => v - before[k]));
      const lateral = unit(cross(tangent, [0, 0, 1])), outward = cross(lateral, tangent);
      if (previous) length += Math.hypot(...p.map((v, k) => v - previous[k]));
      previous = p;
      const twist = length * 8 + ply * Math.PI;
      for (let side = 0; side < sides; side++) {
        const angle = TAU * side / sides;
        const normal = lateral.map((v, k) => v * Math.cos(angle) + outward[k] * Math.sin(angle));
        vertices.push(...p.map((v, k) => v + 0.045 * (lateral[k]*Math.cos(twist) + outward[k]*Math.sin(twist)) + normal[k]*0.15), ...normal);
        if (i < steps) {
          const a = start + i*sides + side, b = start + i*sides + (side+1)%sides;
          indices.push(a,b,a+sides,b,b+sides,a+sides);
        }
      }
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

export function roundPhase(model) {
  const step = model.hasFace ? 0.02 : 0.085;
  if (model.hasFace) {
    for (const [i, ring] of model.rings.entries()) {
      const angles = ring.stitches.flatMap((s, j) => s.name === "bobble" ? [TAU*j/ring.stitches.length] : []);
      if (angles.length === 2) {
        const [a,b] = angles;
        return { step, start: (model.position.flipped ? -1 : 1)*Math.PI/2 - Math.atan2(Math.sin(a)+Math.sin(b),Math.cos(a)+Math.cos(b)) - i*step };
      }
    }
  }
  return { step, start: 0 };
}

// One instance per output loop. The bottom follows the consumed loops while
// the crown follows its position in the new round. SK advances only the base.
export function yarnInstances(model) {
  const { start, step } = roundPhase(model);
  const rings = model.rings;
  const count = rings.reduce((sum, r) => sum + r.stitches.length, 0);
  const data = new Float32Array(count * 12);
  let instance = 0;
  for (const [i, ring] of rings.entries()) {
    const prev = rings[i-1], next = rings[i+1];
    const lastClosed = ring.stitches.length <= 6 && ring.radius < model.radius * 0.65;
    const bottomR = prev ? (prev.radius + ring.radius)/2 : ring.radius*0.18;
    const topR = next ? (next.radius + ring.radius)/2 : lastClosed ? ring.radius*0.28 : ring.radius;
    const y = ((prev?.height ?? 0) - model.height/2) * model.heightScale;
    const height = (ring.height - (prev?.height ?? 0)) * model.heightScale;
    let used = 0, made = 0;
    for (const stitch of ring.row.stitches) {
      for (let j = 0; j < stitch.made; j++) {
        const top = start + i*step + TAU*made/ring.stitches.length;
        const parent = prev && stitch.used ? start + (i-1)*step + TAU*(used + (stitch.used-1)/2)/prev.stitches.length : top;
        const delta = Math.atan2(Math.sin(parent-top), Math.cos(parent-top));
        const spread = stitch.used > 1 ? 1.46 : 1;
        const lift = stitch.name === "bobble" ? 0.56 : 0;
        const loop = stitch.loop === "flo" ? 0.12 : stitch.loop === "blo" ? -0.08 : 0;
        data.set([top, delta, bottomR, topR, y, height, TAU/ring.stitches.length, spread,
          ring.row.number, lift, loop, stitch.height / ring.row.height], instance*12);
        made++; instance++;
      }
      used += stitch.used;
    }
  }
  return { data, count };
}
