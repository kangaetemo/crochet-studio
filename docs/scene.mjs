const TAU = Math.PI * 2;

function yarnMaterial(color) {
  const value = color.replace("#", "");
  return [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16));
}

function shade(color, exposure) {
  return "rgb(" + color.map((value) => Math.round(Math.min(255, value * exposure))).join(",") + ")";
}

export function createScene(canvas) {
  const context = canvas.getContext("2d");
  const view = { pitch: 0.22, yaw: -0.35, zoom: 1 };
  let rounds = [];
  let model = [];
  let active = 0;
  let frame = 0;
  let drag;

  function update(nextRounds, current, colors) {
    rounds = nextRounds.filter((row) => row.preview);
    active = current;
    let height = 0;
    model = rounds.map((row, index) => {
      height += row.height;
      const stitches = row.stitches.flatMap((stitch) => Array.from({ length: stitch.made }, () => stitch));
      return {
        row,
        height,
        radius: Math.max(0.55, stitches.length / TAU),
        material: yarnMaterial(colors[row.number] ?? (index >= 4 && index <= 6 ? "#bd7d9b" : "#a48bd0")),
        stitches
      };
    });
    schedule();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function draw() {
    frame = 0;
    if (!context) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const pixelRatio = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!model.length) return;

    const totalHeight = model.at(-1).height;
    const maxRadius = Math.max(...model.map((ring) => ring.radius));
    const scale = Math.min(width * 0.56, height * 0.70) / Math.max(totalHeight, maxRadius * 2.3, 4) * view.zoom;
    const xCenter = width * 0.5;
    const yCenter = height * 0.48;
    const cosPitch = Math.cos(view.pitch);
    const sinPitch = Math.sin(view.pitch);
    const focalLength = Math.max(totalHeight, maxRadius * 2, 6) * 2.7;

    function project(angle, elevation, radius) {
      const x = Math.cos(angle) * radius;
      const y = elevation - totalHeight / 2;
      const z = Math.sin(angle) * radius;
      const depth = z * cosPitch - y * sinPitch;
      const perspective = focalLength / (focalLength - depth);
      return {
        x: xCenter + x * scale * perspective,
        y: yCenter - (y * cosPitch + z * sinPitch) * scale * perspective,
        depth,
        perspective
      };
    }

    const shadow = context.createRadialGradient(xCenter, height * 0.87, 1, xCenter, height * 0.87, maxRadius * scale);
    shadow.addColorStop(0, "#5e497335");
    shadow.addColorStop(1, "#5e497300");
    context.save();
    context.translate(0, height * 0.87);
    context.scale(1, 0.17);
    context.translate(0, -height * 0.87);
    context.fillStyle = shadow;
    context.fillRect(0, 0, width, height * 2);
    context.restore();

    const marks = [];
    for (const [index, ring] of model.entries()) {
      const step = TAU / ring.stitches.length;
      const bottomRadius = (ring.radius + (model[index - 1]?.radius ?? ring.radius * 0.5)) * 0.5;
      const topRadius = (ring.radius + (model[index + 1]?.radius ?? ring.radius * 0.66)) * 0.5;
      for (const [stitchIndex, stitch] of ring.stitches.entries()) {
        const angle = view.yaw + step * stitchIndex + index * 0.085;
        const top = ring.height;
        const bottom = top - ring.row.height * 0.89;
        const lip = stitch.loop === "flo" ? 0.11 : stitch.loop === "blo" ? -0.09 : 0;
        const center = project(angle, (top + bottom) * 0.5, ring.radius + lip);
        const v = [
          project(angle - step * 0.42, top, topRadius + lip),
          project(angle - step * 0.20, bottom + ring.row.height * 0.2, bottomRadius + lip),
          project(angle, bottom, bottomRadius + lip),
          project(angle + step * 0.2, bottom + ring.row.height * 0.2, bottomRadius + lip),
          project(angle + step * 0.42, top, topRadius + lip)
        ];
        const light = 0.87 + 0.16 * Math.sin(angle) - 0.08 * Math.cos(angle);
        marks.push({ v, center, light, ring, bump: stitch.name === "bobble" });
      }
    }

    marks.sort((left, right) => left.center.depth - right.center.depth);
    context.lineJoin = "round";
    context.lineCap = "round";
    for (const { v, center, light, ring, bump } of marks) {
      const size = Math.max(1, Math.min(18, scale * center.perspective * (bump ? 0.71 : 0.47)));
      context.globalAlpha = active && ring.row.number > active ? 0.22 : 1;
      context.beginPath();
      context.moveTo(v[0].x, v[0].y);
      context.quadraticCurveTo(v[1].x, v[1].y, v[2].x, v[2].y);
      context.quadraticCurveTo(v[3].x, v[3].y, v[4].x, v[4].y);
      context.strokeStyle = shade(ring.material, light * 0.71);
      context.lineWidth = size + 1.8;
      context.stroke();
      context.strokeStyle = shade(ring.material, light);
      context.lineWidth = size;
      context.stroke();
      context.strokeStyle = shade(ring.material, light * 1.22);
      context.lineWidth = Math.max(0.7, size * 0.27);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function rotate(x, y) {
    view.yaw += x;
    view.pitch = Math.max(-1.35, Math.min(1.35, view.pitch + y));
    schedule();
  }

  function zoom(amount) {
    view.zoom = Math.min(2.5, Math.max(0.52, view.zoom * amount));
    schedule();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("dragging");
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag) return;
    rotate((event.clientX - drag.x) * 0.012, (event.clientY - drag.y) * 0.012);
    drag = { x: event.clientX, y: event.clientY };
  });
  function release() {
    drag = undefined;
    canvas.classList.remove("dragging");
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("wheel", (event) => {
    if (!event.ctrlKey && document.activeElement !== canvas) return;
    event.preventDefault();
    zoom(Math.exp(-event.deltaY * 0.0015));
  }, { passive: false });
  canvas.addEventListener("keydown", (event) => {
    const moves = { ArrowLeft: [-0.15, 0], ArrowRight: [0.15, 0], ArrowUp: [0, -0.15], ArrowDown: [0, 0.15] };
    if (moves[event.key]) {
      event.preventDefault();
      rotate(...moves[event.key]);
    }
  });
  new ResizeObserver(schedule).observe(canvas);
  return {
    update,
    zoom,
    reset() {
      Object.assign(view, { pitch: 0.22, yaw: -0.35, zoom: 1 });
      schedule();
    }
  };
}
