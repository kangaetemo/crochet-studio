const TAU = Math.PI * 2;

function yarnMaterial(color) {
  const value = color.replace("#", "");
  return [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16));
}

function shade(color, exposure) {
  return "rgb(" + color.map((value) => Math.round(Math.min(255, value * exposure))).join(",") + ")";
}

function partKind(name) {
  const label = name.toLocaleLowerCase("tr");
  if (/^(?:gövde|govde|body)(?:\s|$)/.test(label)) return "body";
  if (/^(?:(?:sol|sağ|sag)\s+)?(?:kulak(?:lar)?|ears?)(?:\s|$)/.test(label)) return "ear";
  if (/^(?:şapka|sapka|hat)(?:\s|$)/.test(label)) return "hat";
  return "other";
}

export function defaultRoundColor(part, number) {
  const kind = partKind(part.name);
  if (kind === "hat") return "#a95f86";
  if (kind === "ear") return "#d2a9bf";
  return number >= 5 && number <= 7 ? "#bd7d9b" : "#a48bd0";
}

export function layoutParts(parts) {
  const dimensions = parts.map((part) => {
    const rounds = part.rows.filter((row) => row.preview);
    return {
      id: part.id,
      kind: partKind(part.name),
      height: rounds.reduce((sum, row) => sum + row.height, 0),
      radius: rounds.reduce((radius, row) => Math.max(radius, row.made / TAU), 0.55)
    };
  });
  const living = dimensions.filter((part) => part.height > 0);
  const main = living.find((part) => part.kind === "body") ?? living[0];
  const assembled = main?.kind === "body";
  let sideX = (main?.radius ?? 0) + 2;
  let earIndex = 0;

  return new Map(dimensions.map((part) => {
    const placement = { x: 0, y: 0, z: 0, tilt: 0, flipped: false };
    if (main && part !== main && part.height > 0) {
      if (assembled && part.kind === "ear") {
        const side = earIndex++ % 2 ? 1 : -1;
        placement.x = side * main.radius * 0.67;
        placement.y = main.height * 0.47 + part.height * 0.14;
        placement.z = main.radius * 0.2;
        placement.tilt = -side * 0.28;
      } else if (assembled && part.kind === "hat") {
        placement.y = main.height * 0.44 + part.height / 2;
        placement.flipped = true;
      } else {
        placement.x = sideX + part.radius;
        sideX += part.radius * 2 + 2;
      }
    }
    return [part.id, placement];
  }));
}

export function createScene(canvas) {
  const context = canvas.getContext("2d");
  const view = { pitch: 0.22, yaw: -0.35, zoom: 1 };
  let models = [];
  let activePart;
  let activeRound = 0;
  let frame = 0;
  let drag;

  function update(parts, selection) {
    activePart = selection.part;
    activeRound = selection.round;
    const layout = layoutParts(parts);
    models = parts.map((part) => {
      let height = 0;
      const rings = part.rows.filter((row) => row.preview).map((row) => {
        height += row.height;
        const stitches = row.stitches.flatMap((stitch) => Array.from({ length: stitch.made }, () => stitch));
        return {
          row, height, stitches,
          radius: Math.max(0.55, stitches.length / TAU),
          material: yarnMaterial(part.colors?.[row.number] ?? defaultRoundColor(part, row.number))
        };
      });
      const base = layout.get(part.id);
      const position = {
        x: base.x + (part.offset?.x ?? 0),
        y: base.y + (part.offset?.y ?? 0),
        z: base.z + (part.offset?.z ?? 0),
        tilt: base.tilt,
        flipped: base.flipped !== Boolean(part.offset?.reverse)
      };
      return {
        id: part.id, rings, height, position,
        radius: rings.reduce((max, ring) => Math.max(max, ring.radius), 0.55)
      };
    }).filter((model) => model.rings.length);
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
    if (!models.length) return;

    const bounds = models.map(({ radius, height, position }) => {
      const lean = Math.abs(Math.sin(position.tilt));
      return { ...position, horizontal: radius + height / 2 * lean, vertical: height / 2 + radius * lean };
    });
    const maxOf = (key, limit) => Math.max(...bounds.map((bound) => bound[key] + bound[limit]));
    const minOf = (key, limit) => Math.min(...bounds.map((bound) => bound[key] - bound[limit]));
    const midX = (maxOf("x", "horizontal") + minOf("x", "horizontal")) / 2;
    const midY = (maxOf("y", "vertical") + minOf("y", "vertical")) / 2;
    const midZ = (maxOf("z", "horizontal") + minOf("z", "horizontal")) / 2;
    const radius = Math.max(...bounds.map((bound) => Math.hypot(bound.x - midX, bound.z - midZ) + bound.horizontal));
    const totalHeight = maxOf("y", "vertical") - minOf("y", "vertical");
    const scale = Math.min(width * 0.56, height * 0.70) / Math.max(totalHeight, radius * 2.3, 4) * view.zoom;
    const xCenter = width * 0.5;
    const yCenter = height * 0.48;
    const cosPitch = Math.cos(view.pitch);
    const sinPitch = Math.sin(view.pitch);
    const cosYaw = Math.cos(view.yaw);
    const sinYaw = Math.sin(view.yaw);
    const focalLength = Math.max(totalHeight, radius * 2, 6) * 2.7;

    function project(x, y, z) {
      const worldX = x - midX;
      const worldY = y - midY;
      const worldZ = z - midZ;
      const cameraX = worldX * cosYaw - worldZ * sinYaw;
      const cameraZ = worldX * sinYaw + worldZ * cosYaw;
      const depth = cameraZ * cosPitch - worldY * sinPitch;
      const perspective = focalLength / (focalLength - depth);
      return {
        x: xCenter + cameraX * scale * perspective,
        y: yCenter - (worldY * cosPitch + cameraZ * sinPitch) * scale * perspective,
        depth, perspective
      };
    }

    const shadow = context.createRadialGradient(xCenter, height * 0.87, 1, xCenter, height * 0.87, Math.max(2, radius * scale));
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
    for (const model of models) {
      const { position, rings } = model;
      const cosTilt = Math.cos(position.tilt);
      const sinTilt = Math.sin(position.tilt);
      const flip = position.flipped ? -1 : 1;

      function projectStitch(angle, elevation, width) {
        const x = Math.cos(angle) * width;
        const y = (elevation - model.height / 2) * flip;
        const z = Math.sin(angle) * width * flip;
        return project(
          position.x + x * cosTilt - y * sinTilt,
          position.y + x * sinTilt + y * cosTilt,
          position.z + z
        );
      }

      for (const [index, ring] of rings.entries()) {
        const step = TAU / ring.stitches.length;
        const bottomRadius = (ring.radius + (rings[index - 1]?.radius ?? ring.radius * 0.5)) * 0.5;
        const topRadius = (ring.radius + (rings[index + 1]?.radius ?? ring.radius * 0.66)) * 0.5;
        for (const [stitchIndex, stitch] of ring.stitches.entries()) {
          const angle = step * stitchIndex + index * 0.085;
          const top = ring.height;
          const bottom = top - ring.row.height * 0.89;
          const lip = stitch.loop === "flo" ? 0.11 : stitch.loop === "blo" ? -0.09 : 0;
          const center = projectStitch(angle, (top + bottom) * 0.5, ring.radius + lip);
          const v = [
            projectStitch(angle - step * 0.42, top, topRadius + lip),
            projectStitch(angle - step * 0.20, bottom + ring.row.height * 0.2, bottomRadius + lip),
            projectStitch(angle, bottom, bottomRadius + lip),
            projectStitch(angle + step * 0.2, bottom + ring.row.height * 0.2, bottomRadius + lip),
            projectStitch(angle + step * 0.42, top, topRadius + lip)
          ];
          const shadeAngle = flip * angle + view.yaw;
          const light = 0.87 + 0.16 * Math.sin(shadeAngle) - 0.08 * Math.cos(shadeAngle);
          const faded = model.id === activePart && activeRound && ring.row.number > activeRound;
          marks.push({ v, center, light, material: ring.material, faded, bump: stitch.name === "bobble" });
        }
      }
    }

    marks.sort((left, right) => left.center.depth - right.center.depth);
    context.lineJoin = "round";
    context.lineCap = "round";
    for (const { v, center, light, material, faded, bump } of marks) {
      const size = Math.max(1, Math.min(18, scale * center.perspective * (bump ? 0.71 : 0.47)));
      context.globalAlpha = faded ? 0.22 : 1;
      context.beginPath();
      context.moveTo(v[0].x, v[0].y);
      context.quadraticCurveTo(v[1].x, v[1].y, v[2].x, v[2].y);
      context.quadraticCurveTo(v[3].x, v[3].y, v[4].x, v[4].y);
      context.strokeStyle = shade(material, light * 0.71);
      context.lineWidth = size + 1.8;
      context.stroke();
      context.strokeStyle = shade(material, light);
      context.lineWidth = size;
      context.stroke();
      context.strokeStyle = shade(material, light * 1.22);
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
