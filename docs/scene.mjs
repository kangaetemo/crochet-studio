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

function hasPom(rows) {
  const counts = rows.filter((row) => row.preview).slice(0, 4).map((row) => row.made);
  return counts.length === 4 && counts[0] < counts[1] && counts[1] > counts[2] && counts[2] < counts[3];
}

export function resolveAppearance(parts, choice = "auto") {
  if (choice === "plain") return "plain";
  const body = parts.find((part) => partKind(part.name) === "body");
  const hat = parts.find((part) => partKind(part.name) === "hat");
  if (!body || !hat) return "plain";
  if (choice === "winter") return "winter";
  const ears = parts.filter((part) => partKind(part.name) === "ear");
  const bobbleRows = body.rows.filter((row) => row.preview && row.stitches.filter((stitch) => stitch.name === "bobble").length === 2);
  return ears.length === 2 && bobbleRows.length >= 2 && hasPom(hat.rows) ? "winter" : "plain";
}

export function defaultRoundColor(part, number, appearance = "plain") {
  const kind = partKind(part.name);
  if (appearance === "winter") {
    if (kind === "hat") return number <= (hasPom(part.rows) ? 3 : 1) ? "#f6eee0" : "#c13936";
    if (kind === "body" || kind === "ear") return "#f2e8d7";
  }
  if (kind === "hat") return "#a95f86";
  if (kind === "ear") return "#d2a9bf";
  return number >= 5 && number <= 7 ? "#bd7d9b" : "#a48bd0";
}

export function layoutParts(parts, appearance = "plain") {
  const winter = appearance === "winter";
  const dimensions = parts.map((part) => {
    const rounds = part.rows.filter((row) => row.preview);
    const kind = partKind(part.name);
    const heightScale = winter && kind === "body" ? 0.61 : winter && kind === "hat" ? 0.88 : 1;
    const widthScale = winter && kind === "ear" ? 1.14 : 1;
    return {
      id: part.id, kind, heightScale, widthScale,
      height: rounds.reduce((sum, row) => sum + row.height, 0) * heightScale,
      radius: rounds.reduce((radius, row) => Math.max(radius, row.made / TAU), 0.55) * widthScale
    };
  });
  const living = dimensions.filter((part) => part.height > 0);
  const main = living.find((part) => part.kind === "body") ?? living[0];
  const assembled = main?.kind === "body";
  let sideX = (main?.radius ?? 0) + 2;
  let earIndex = 0;

  return new Map(dimensions.map((part) => {
    const placement = {
      x: 0, y: 0, z: 0, tilt: 0,
      flipped: winter && part.kind === "body",
      heightScale: part.heightScale,
      widthScale: part.widthScale
    };
    if (main && part !== main && part.height > 0) {
      if (assembled && part.kind === "ear") {
        const side = earIndex++ % 2 ? 1 : -1;
        placement.x = side * main.radius * (winter ? 0.85 : 0.67);
        placement.y = winter ? main.height * 0.33 : main.height * 0.47 + part.height * 0.14;
        placement.z = main.radius * (winter ? 0.30 : 0.20);
        placement.tilt = -side * (winter ? 0.46 : 0.28);
        placement.flipped = winter;
      } else if (assembled && part.kind === "hat") {
        placement.y = main.height * (winter ? 0.29 : 0.44) + part.height / 2;
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
  let currentAppearance = "plain";
  let frame = 0;
  let drag;

  function resetCamera() {
    const winter = currentAppearance === "winter";
    Object.assign(view, { pitch: winter ? 0.10 : 0.22, yaw: winter ? 0 : -0.35, zoom: 1 });
  }

  function update(parts, selection, appearance = "plain") {
    if (currentAppearance !== appearance) {
      currentAppearance = appearance;
      resetCamera();
    }
    activePart = selection.part;
    activeRound = selection.round;
    const layout = layoutParts(parts, appearance);
    models = parts.map((part) => {
      const base = layout.get(part.id);
      const winter = appearance === "winter";
      const hasFace = winter && partKind(part.name) === "body";
      let height = 0;
      const rings = part.rows.filter((row) => row.preview).map((row) => {
        height += row.height;
        const stitches = row.stitches.flatMap((stitch) => Array.from({ length: stitch.made }, () => stitch));
        return {
          row, height, stitches,
          radius: Math.max(0.55, stitches.length / TAU) * base.widthScale,
          material: yarnMaterial(part.colors?.[row.number] ?? defaultRoundColor(part, row.number, appearance))
        };
      });
      const position = {
        x: base.x + (part.offset?.x ?? 0),
        y: base.y + (part.offset?.y ?? 0),
        z: base.z + (part.offset?.z ?? 0),
        tilt: base.tilt,
        flipped: base.flipped !== Boolean(part.offset?.reverse)
      };
      return {
        id: part.id, rings, height, position, winter, hasFace,
        heightScale: base.heightScale,
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

    const bounds = models.map(({ radius, height, heightScale, position }) => {
      const lean = Math.abs(Math.sin(position.tilt));
      const half = height * heightScale / 2;
      return { ...position, horizontal: radius + half * lean, vertical: half + radius * lean };
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
        const y = (elevation - model.height / 2) * flip * model.heightScale;
        const z = Math.sin(angle) * width * flip;
        return project(
          position.x + x * cosTilt - y * sinTilt,
          position.y + x * sinTilt + y * cosTilt,
          position.z + z
        );
      }

      const phaseStep = model.hasFace ? 0.02 : 0.085;
      let phase = 0;
      if (model.hasFace) {
        const pairIndex = rings.findIndex((ring) => ring.stitches.filter((stitch) => stitch.name === "bobble").length === 2);
        if (pairIndex >= 0) {
          const ring = rings[pairIndex];
          const angles = ring.stitches.flatMap((stitch, index) => stitch.name === "bobble" ? [index * TAU / ring.stitches.length] : []);
          const midpoint = Math.atan2(Math.sin(angles[0]) + Math.sin(angles[1]), Math.cos(angles[0]) + Math.cos(angles[1]));
          phase = flip * Math.PI / 2 - midpoint - phaseStep * pairIndex;
        }
      }

      for (const [index, ring] of rings.entries()) {
        const step = TAU / ring.stitches.length;
        const bottomRadius = (ring.radius + (rings[index - 1]?.radius ?? ring.radius * 0.5)) * 0.5;
        const topRadius = (ring.radius + (rings[index + 1]?.radius ?? ring.radius * 0.66)) * 0.5;
        for (const [stitchIndex, stitch] of ring.stitches.entries()) {
          const angle = step * stitchIndex + index * phaseStep + phase;
          const top = ring.height;
          const bottom = top - ring.row.height * 0.89;
          const bump = stitch.name === "bobble";
          const loopDepth = stitch.loop === "flo" ? 0.11 : stitch.loop === "blo" ? -0.09 : 0;
          const lip = loopDepth + (bump && model.winter ? 0.53 : 0);
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
          marks.push({ v, center, light, material: ring.material, faded, bump, winter: model.winter });
        }
      }

      if (model.hasFace && rings.length >= 6) {
        const front = flip * Math.PI / 2;
        const facePoint = (offset, proportion) => {
          const elevation = model.height * (0.5 + proportion * flip);
          const ring = rings.find((candidate) => candidate.height >= elevation) ?? rings.at(-1);
          return projectStitch(front + offset * flip, elevation, ring.radius + 0.2);
        };
        for (const offset of [-0.36, 0.36]) {
          const facing = Math.sin((front + offset * flip) * flip + view.yaw);
          if (facing > 0.12) {
            const center = facePoint(offset, 0.065);
            marks.push({ kind: "eye", center, facing });
          }
        }
        if (Math.sin(front * flip + view.yaw) > 0.18) {
          const center = facePoint(0, -0.025);
          const left = facePoint(-0.13, -0.035);
          const right = facePoint(0.13, -0.035);
          const tip = facePoint(0, -0.10);
          marks.push({ kind: "nose", center, left, right, tip });
        }
      }
    }

    marks.sort((left, right) => left.center.depth - right.center.depth);
    context.lineJoin = "round";
    context.lineCap = "round";
    for (const mark of marks) {
      const { v, center, light, material, faded, bump, winter } = mark;
      if (mark.kind) {
        const unit = scale * center.perspective;
        context.globalAlpha = 1;
        context.fillStyle = "#20191b";
        context.strokeStyle = "#20191b";
        if (mark.kind === "eye") {
          const r = unit * 0.49;
          context.beginPath();
          context.ellipse(center.x, center.y, r * (0.45 + mark.facing * 0.55), r, 0, 0, TAU);
          context.fill();
          context.fillStyle = "#fcf4ea";
          context.beginPath();
          context.arc(center.x - r * 0.29, center.y - r * 0.28, r * 0.22, 0, TAU);
          context.fill();
        } else {
          context.lineWidth = Math.max(1.7, unit * 0.18);
          context.beginPath();
          context.moveTo(mark.left.x, mark.left.y);
          context.quadraticCurveTo(center.x, center.y - unit * 0.065, mark.right.x, mark.right.y);
          context.moveTo(center.x, center.y);
          context.lineTo(mark.tip.x, mark.tip.y);
          context.stroke();
        }
        continue;
      }
      const factor = winter ? (bump ? 0.87 : 0.62) : (bump ? 0.71 : 0.47);
      const size = Math.max(1, Math.min(20, scale * center.perspective * factor));
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
      resetCamera();
      schedule();
    }
  };
}
