const TAU = Math.PI * 2;
const STRIDE = 12;

function yarnPoint(angle, y, radius, slope, material, u, v, round) {
  const x = Math.cos(angle);
  const z = Math.sin(angle);
  const normal = Math.hypot(1, slope);
  return [x * radius, y, z * radius, x / normal, -slope / normal, z / normal,
    material[0] / 255, material[1] / 255, material[2] / 255, u, v, round];
}

function addEllipsoid(vertices, indices, center, radii, color) {
  const bands = 8;
  const segments = 16;
  const start = vertices.length / STRIDE;
  for (let row = 0; row <= bands; row++) {
    const polar = Math.PI * row / bands;
    for (let column = 0; column <= segments; column++) {
      const angle = TAU * column / segments;
      const dir = [Math.sin(polar) * Math.cos(angle), Math.cos(polar), Math.sin(polar) * Math.sin(angle)];
      const normal = dir.map((value, axis) => value / radii[axis]);
      const length = Math.hypot(...normal);
      vertices.push(...dir.map((value, axis) => center[axis] + value * radii[axis]),
        ...normal.map((value) => value / length), ...color, 0, 0, 0);
    }
  }
  for (let row = 0; row < bands; row++) {
    for (let column = 0; column < segments; column++) {
      const a = start + row * (segments + 1) + column;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

function addFace(model, vertices, indices) {
  const flip = model.position.flipped ? -1 : 1;
  const centerAt = (angle, yFraction, lift) => {
    const elevation = model.height * (0.5 + yFraction * flip);
    const ring = model.rings.find((entry) => entry.height >= elevation) ?? model.rings.at(-1);
    const radius = ring.radius + lift;
    return [Math.sin(angle) * radius, (elevation - model.height / 2) * model.heightScale, flip * Math.cos(angle) * radius];
  };
  const black = [0.09, 0.073, 0.077];
  for (const angle of [-0.37, 0.37]) {
    const eye = centerAt(angle, 0.08, 0.12);
    addEllipsoid(vertices, indices, eye, [0.48, 0.49, 0.31], black);
    addEllipsoid(vertices, indices, [eye[0] - 0.12, eye[1] + 0.13 * flip, eye[2] + 0.29 * flip],
      [0.093, 0.093, 0.052], [0.88, 0.85, 0.81]);
  }
  addEllipsoid(vertices, indices, centerAt(0, -0.018, 0.13), [0.56, 0.18, 0.19], black);
  addEllipsoid(vertices, indices, centerAt(0, -0.060, 0.14), [0.10, 0.30, 0.12], black);
}

export function buildSurface(model) {
  const vertices = [];
  const indices = [];
  const rings = model.rings;
  if (!rings.length) return { vertices: new Float32Array(), indices: new Uint32Array() };

  const segments = Math.max(24, Math.min(96, Math.ceil(model.radius * TAU * 2)));
  const columns = segments + 1;
  const last = rings.at(-1);
  const closes = model.hasFace || (last.stitches.length <= 6 && last.radius < model.radius * 0.65);
  const localY = (elevation) => {
    const fraction = elevation / model.height;
    const shortened = model.hasFace && fraction > 0.83 ? 0.83 + (fraction - 0.83) * 0.45 : fraction;
    return (shortened - 0.5) * model.height * model.heightScale;
  };
  const phaseStep = model.hasFace ? 0.02 : 0.085;
  let phase = 0;
  if (model.hasFace) {
    const row = rings.findIndex((ring) => ring.stitches.filter((stitch) => stitch.name === "bobble").length === 2);
    if (row >= 0) {
      const stitches = rings[row].stitches;
      const points = stitches.flatMap((stitch, index) => stitch.name === "bobble" ? [TAU * index / stitches.length] : []);
      const mean = Math.atan2(Math.sin(points[0]) + Math.sin(points[1]), Math.cos(points[0]) + Math.cos(points[1]));
      phase = (model.position.flipped ? -1 : 1) * Math.PI / 2 - mean - phaseStep * row;
    }
  }

  for (const [index, ring] of rings.entries()) {
    const previous = rings[index - 1];
    const next = rings[index + 1];
    const bottom = previous ? (previous.radius + ring.radius) / 2 : 0;
    const top = next ? (next.radius + ring.radius) / 2 : closes ? 0 : ring.radius;
    const bottomY = localY(previous?.height ?? 0);
    const topY = localY(ring.height);
    const tall = Math.max(topY - bottomY, 0.017);
    const start = vertices.length / STRIDE;
    const count = ring.stitches.length;
    for (let band = 0; band <= 2; band++) {
      const t = band / 2;
      const y = bottomY + t * tall;
      const radius = band === 0 ? bottom : band === 1 ? ring.radius : top;
      const slope = (band === 0 ? (ring.radius - bottom) * 2 : band === 2 ? (top - ring.radius) * 2 : top - bottom) / tall;
      for (let column = 0; column <= segments; column++) {
        const angle = TAU * column / segments;
        const tile = (column / segments - (phase + index * phaseStep) / TAU) * count;
        const stalk = ((Math.round(tile) % count) + count) % count;
        const stitch = ring.stitches[stalk];
        const envelope = 1 - Math.abs(tile - Math.round(tile)) * 2;
        const puff = band === 1 && stitch.name === "bobble" ? envelope * 0.60 : 0;
        const loop = band === 1 ? stitch.loop === "flo" ? 0.11 : stitch.loop === "blo" ? -0.08 : 0 : 0;
        vertices.push(...yarnPoint(angle, y, radius + puff + loop, slope, ring.material, tile + 0.5, t, ring.row.number));
      }
    }
    for (let row = 0; row < 2; row++) {
      for (let column = 0; column < segments; column++) {
        const a = start + row * columns + column;
        const b = a + columns;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  if (model.hasFace && rings.length >= 6) addFace(model, vertices, indices);
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

const vertexSource = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=2) in vec3 a_color;
layout(location=3) in vec2 a_stitch;
layout(location=4) in float a_round;
uniform vec3 u_offset;
uniform vec3 u_center;
uniform vec4 u_pose;
uniform vec4 u_camera;
uniform vec3 u_lens;
out vec3 v_normal;
out vec3 v_color;
out vec2 v_stitch;
flat out float v_round;
vec3 place(vec3 p) {
  p.yz *= u_pose.z;
  return vec3(p.x*u_pose.x-p.y*u_pose.y,p.x*u_pose.y+p.y*u_pose.x,p.z);
}
vec3 orbit(vec3 p) {
  float x = p.x*u_camera.x-p.z*u_camera.y;
  float z = p.x*u_camera.y+p.z*u_camera.x;
  return vec3(x,p.y*u_camera.z+z*u_camera.w,z*u_camera.z-p.y*u_camera.w);
}
void main() {
  vec3 p = orbit(place(a_position)+u_offset-u_center);
  float depth = p.z/u_lens.z;
  gl_Position = vec4(p.x*u_lens.x,p.y*u_lens.y,-depth,1.0-depth);
  v_normal = orbit(place(a_normal));
  v_color = a_color;
  v_stitch = a_stitch;
  v_round = a_round;
}
`;

const fragmentSource = `#version 300 es
precision highp float;
in vec3 v_normal;
in vec3 v_color;
in vec2 v_stitch;
flat in float v_round;
uniform float u_active;
out vec4 color;
void main() {
  vec3 normal = normalize(v_normal);
  vec3 key = normalize(vec3(-0.42,0.58,0.70));
  float light = 0.72 + max(0.0,dot(normal,key))*0.32;
  float cloth = 1.0;
  if (v_round > 0.0) {
    vec2 p = vec2(fract(v_stitch.x)-0.5,v_stitch.y);
    float vein = abs(abs(p.x)-(0.13+0.23*p.y));
    float join = smoothstep(0.02,0.23,p.y)*(1.0-smoothstep(0.84,1.0,p.y));
    float band = (1.0-smoothstep(0.07,0.17,vein))*join;
    float detail = 1.0-smoothstep(0.22,0.60,max(fwidth(v_stitch.x),fwidth(v_stitch.y)));
    float strand = sin(43.0*p.y+19.0*p.x)*0.017;
    cloth = mix(1.0,0.82+0.23*band+strand,detail);
  } else {
    light += 0.32*pow(max(0.0,dot(normal,key)),16.0);
  }
  vec3 shaded = v_color*light*cloth;
  if (u_active > 0.0 && v_round > u_active) shaded = mix(shaded, vec3(0.91,0.88,0.94), 0.63);
  color = vec4(shaded,1.0);
}
`;

function initProgram(gl) {
  const program = gl.createProgram();
  const shaders = [];
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

function createBuffer(gl, model) {
  const { vertices, indices } = buildSurface(model);
  const vao = gl.createVertexArray();
  const vertex = gl.createBuffer();
  const index = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertex);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  for (const [slot, width, offset] of [[0, 3, 0], [1, 3, 3], [2, 3, 6], [3, 2, 9], [4, 1, 11]]) {
    gl.enableVertexAttribArray(slot);
    gl.vertexAttribPointer(slot, width, gl.FLOAT, false, STRIDE * 4, offset * 4);
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, vertex, index, count: indices.length, geometry: model.rings, flip: model.position.flipped };
}

export function createWebglRenderer(canvas, schedule) {
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: true, depth: true });
  if (!gl) return null;
  const buffers = new Map();
  let models = [];
  let selection = {};
  let program, uniforms, lost = false;

  function initialize() {
    program = initProgram(gl);
    uniforms = Object.fromEntries(["offset", "center", "pose", "camera", "lens", "active"]
      .map((name) => [name, gl.getUniformLocation(program, "u_" + name)]));
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
  }

  function release(buffer) {
    gl.deleteBuffer(buffer.vertex);
    gl.deleteBuffer(buffer.index);
    gl.deleteVertexArray(buffer.vao);
  }

  function update(nextModels, nextSelection) {
    models = nextModels;
    selection = nextSelection;
    if (lost) return;
    const visible = new Set(models.map((model) => model.id));
    for (const [id, buffer] of buffers) {
      if (visible.has(id)) continue;
      release(buffer);
      buffers.delete(id);
    }
    for (const model of models) {
      const existing = buffers.get(model.id);
      if (existing?.geometry === model.rings && existing.flip === model.position.flipped) continue;
      if (existing) release(existing);
      buffers.set(model.id, createBuffer(gl, model));
    }
  }

  function draw(view) {
    if (lost) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio || 1, 1.75);
    const w = Math.round(width * ratio);
    const h = Math.round(height * ratio);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!models.length) return;

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const model of models) {
      const { x, y, z, tilt } = model.position;
      const half = model.height * model.heightScale / 2;
      const t = Math.abs(Math.sin(tilt));
      const r = model.radius + half * t;
      const v = half + model.radius * t;
      const position = [x, y, z];
      const span = [r, v, r];
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], position[axis] - span[axis]);
        max[axis] = Math.max(max[axis], position[axis] + span[axis]);
      }
    }

    const center = min.map((coordinate, index) => (coordinate + max[index]) * 0.5);
    const radius = Math.max(...models.map(({ position, radius: r, height: length, heightScale }) => (
      Math.hypot(position.x - center[0], position.z - center[2])
      + r + length * heightScale * Math.abs(Math.sin(position.tilt)) / 2
    )));
    const vertical = max[1] - min[1];
    const size = Math.max(vertical, radius * 2, 4);
    const scale = Math.min(width * 0.66, height * 0.77) / size * view.zoom;
    gl.useProgram(program);
    gl.uniform3f(uniforms.center, ...center);
    gl.uniform4f(uniforms.camera, Math.cos(view.yaw), Math.sin(view.yaw), Math.cos(view.pitch), Math.sin(view.pitch));
    gl.uniform3f(uniforms.lens, 2 * scale / width, 2 * scale / height, size * 3.2);
    for (const model of models) {
      const { x, y, z, tilt, flipped } = model.position;
      const buffer = buffers.get(model.id);
      gl.bindVertexArray(buffer.vao);
      gl.uniform3f(uniforms.offset, x, y, z);
      gl.uniform4f(uniforms.pose, Math.cos(tilt), Math.sin(tilt), flipped ? -1 : 1, 0);
      gl.uniform1f(uniforms.active, model.id === selection.part ? selection.round : 0);
      gl.drawElements(gl.TRIANGLES, buffer.count, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
  }

  initialize();
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    lost = true;
    buffers.clear();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    initialize();
    lost = false;
    update(models, selection);
    schedule();
  });
  return { update, draw };
}
