const aliases = new Map();
function stitch(name, used, made, height, names = []) {
  for (const label of [name, ...names]) aliases.set(label, { name, used, made, height });
}

stitch("sc", 1, 1, 1, ["x", "sık iğne", "sik igne"]);
stitch("inc", 1, 2, 1, ["v", "artır", "artir", "artırma", "artirma", "sc inc"]);
stitch("dec", 2, 1, 1, ["a", "eksilt", "eksiltme", "sc dec", "sc2tog"]);
stitch("inv dec", 2, 1, 1, ["invdec", "invisible decrease"]);
stitch("hdc", 1, 1, 1.28, ["yarım trabzan", "yarim trabzan"]);
stitch("dc", 1, 1, 1.6, ["ikili trabzan"]);
stitch("sl st", 1, 1, 0.55, ["slst", "sl", "ilmek kaydırma", "ilmek kaydirma"]);
stitch("bobble", 1, 1, 1.15, ["bob", "bo", "bobble stitch"]);
stitch("hdc inc", 1, 2, 1.28, ["hdc_inc", "vhdc"]);
stitch("hdc dec", 2, 1, 1.28, ["hdc_dec", "hdc2tog", "hdc2 tog"]);
stitch("dc inc", 1, 2, 1.6, ["dc_inc", "vdc"]);
stitch("dc dec", 2, 1, 1.6, ["dc_dec", "dc2tog", "dc2 tog"]);
stitch("ch", 0, 1, 0.7, ["zn", "zincir"]);
stitch("sk", 1, 0, 0, ["skip", "atla"]);

const MAX_ROUNDS = 150;
const MAX_STITCHES = 400;
const MAX_REPEAT = 400;

function normalize(command) {
  return command.trim().toLocaleLowerCase("en").replace(/i\u0307/g, "i").replace(/\s+/g, " ");
}

function repeatItems(items, number) {
  if (number < 1 || number > MAX_REPEAT || number * items.length > MAX_STITCHES) {
    throw new Error("Bir tur en fazla " + MAX_STITCHES + " işlem içerebilir.");
  }
  return Array.from({ length: number }, () => items).flat();
}

function parseItems(text, depth = 0) {
  if (depth > 6) throw new Error("İç içe tekrarları sadeleştir.");
  const parts = [];
  let start = 0;
  let nesting = 0;
  for (let i = 0; i < text.length; i++) {
    if ("([".includes(text[i])) nesting++;
    if (")]".includes(text[i])) nesting--;
    if (nesting < 0) throw new Error("Fazladan kapanan parantez var.");
    if (nesting === 0 && text[i] === ",") {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (nesting !== 0) throw new Error("Tekrar grubunun parantezini kapat.");
  parts.push(text.slice(start).trim());
  if (parts.some((part) => !part)) throw new Error("Virgülden sonra bir ilmek yaz.");
  const items = [];
  for (const part of parts) {
    const prefixGroup = part.match(/^(\d+)\s*[x×*]\s*(?:\((.*)\)|\[(.*)\])$/i);
    const suffixGroup = part.match(/^(?:\((.*)\)|\[(.*)\])\s*(?:[x×*]\s*(\d+)|(\d+)\s*(?:times|kez))$/i);
    if (prefixGroup || suffixGroup) {
      const group = prefixGroup ? prefixGroup[2] ?? prefixGroup[3] : suffixGroup[1] ?? suffixGroup[2];
      const count = Number(prefixGroup?.[1] ?? suffixGroup?.[3] ?? suffixGroup?.[4]);
      items.push(...repeatItems(parseItems(group, depth + 1), count));
    } else {
      items.push(...parseStitch(part));
    }
    if (items.length > MAX_STITCHES) throw new Error("Bu tur en fazla " + MAX_STITCHES + " işlem içerebilir.");
  }
  return items;
}

function parseStitch(part, allowSequence = true) {
  let text = normalize(part);
  let loop;
  text = text.replace(/(?:^\b(flo|blo)\b\s*|\s+\b(flo|blo)\b$)/g, (_, first, last) => {
    loop = first ?? last;
    return "";
  }).trim();
  const explicitIncrease = text.match(/^2\s+(sc|hdc|dc)\s+in\s+(?:the\s+)?(?:same|next)\s+(?:st|stitch)$/);
  if (explicitIncrease) text = explicitIncrease[1] + " inc";
  let label = text;
  let count = 1;
  if (!aliases.has(text)) {
    const suffix = text.match(/^(.+?)\s*[×*x]\s*(\d+)$/i);
    const prefix = text.match(/^(\d+)\s*(.+)$/);
    const trailing = text.match(/^(.+?)\s*(\d+)$/);
    if (suffix) {
      label = suffix[1].trim();
      count = Number(suffix[2]);
    } else if (prefix) {
      label = prefix[2].trim();
      count = Number(prefix[1]);
    } else if (trailing) {
      label = trailing[1].trim();
      count = Number(trailing[2]);
    }
  }
  const value = aliases.get(label);
  if (!value && allowSequence) {
    // A new explicit quantity can separate stitches without a comma. Keep
    // multiword aliases and FLO/BLO prefixes attached to their stitch.
    const commands = normalize(part).split(/(?<!\b(?:flo|blo))\s+(?=\d+\s*\p{L})/u);
    if (commands.length > 1) {
      const items = [];
      for (const command of commands) {
        items.push(...parseStitch(command, false));
        if (items.length > MAX_STITCHES) throw new Error("Bu tur en fazla " + MAX_STITCHES + " işlem içerebilir.");
      }
      return items;
    }
  }
  if (!value) throw new Error("Bu yazımı tanıyamadım: " + part);
  return repeatItems([{ ...value, loop }], count);
}

function readLine(raw) {
  const heading = raw.match(/^(?:(?:r(?:nd|ound)?|row|tur|sıra)\s*)?(\d+)(?:\s*[-–]\s*(\d+))?(?:\s*\.?\s*(?:tur|sıra))?\s*[:.]\s*(.+)$/i);
  const first = heading ? Number(heading[1]) : null;
  const last = heading ? Number(heading[2] ?? heading[1]) : null;
  let command = heading ? heading[3] : raw;
  const expectedMatch = command.match(/\s*(?:[=(→]\s*(\d+)\s*(?:sts?|ilmek)?\)?|\[\s*(\d+)\s*(?:sts?|ilmek)?\])\s*$/i);
  let expected = expectedMatch ? Number(expectedMatch[1] ?? expectedMatch[2]) : null;
  if (expectedMatch) {
    command = command.slice(0, expectedMatch.index).trim();
  } else {
    const trailing = command.match(/\s+(\d+)\s*(?:sts?|ilmek)?$/i);
    if (trailing) {
      const before = command.slice(0, trailing.index).trim();
      const finalItem = before.split(",").at(-1).trim();
      const alreadyQuantified = /[\d)\]]$/.test(finalItem) || /^\d+\s*[a-z]/i.test(finalItem);
      if (alreadyQuantified && !/[x×*]$/i.test(finalItem) && !/^\d+$/.test(finalItem)) {
        expected = Number(trailing[1]);
        command = before;
      }
    }
  }
  if (/^(?:mr|sh|magic ring|sihirli halka)\s*[:(]/i.test(command)) {
    command = command.replace(/^(?:mr|sh|magic ring|sihirli halka)\s*[:(]\s*/i, "").replace(/\)\s*$/, "");
  }
  command = command.replace(/\s+(?:in(?:to)?\s+(?:a\s+|the\s+)?(?:magic ring|ring|mr)|sh içine|sihirli halkaya)$/i, "");
  return { first, last, expected, command };
}

function summarize(stitches) {
  let used = 0;
  let made = 0;
  let height = 0;
  for (const stitch of stitches) {
    used += stitch.used;
    made += stitch.made;
    height += stitch.height * stitch.made;
  }
  return { used, made, height: height / Math.max(1, made) };
}

function describe(stitches) {
  const runs = [];
  for (const stitch of stitches) {
    const last = runs.at(-1);
    if (last?.name === stitch.name) last.count++;
    else runs.push({ name: stitch.name, count: 1 });
  }
  return runs.map(({ name, count }) => count === 1 ? name : count + " " + name).join(", ");
}

function inferCountRound(target, previous) {
  if (target < 1 || target > MAX_STITCHES) {
    throw new Error("Bir tur 1–" + MAX_STITCHES + " ilmek üretmeli.");
  }
  const delta = previous === null ? 0 : target - previous;
  const slots = delta > 0 ? previous : target;
  if (Math.abs(delta) > slots) {
    throw new Error("Bu değişim için artırma veya eksiltmeleri açıkça yaz.");
  }
  return Array.from({ length: slots }, (_, index) => {
    const changes = Math.abs(delta);
    const affects = Math.floor((index + 1) * changes / slots) > Math.floor(index * changes / slots);
    return aliases.get(affects ? (delta > 0 ? "inc" : "dec") : "sc");
  });
}

function readInstruction(command, expected, previous) {
  const stitches = parseItems(command);
  const totals = summarize(stitches);
  const repeat = command.match(/^(.+,.+?)\s*[x×*]\s*(\d+)$/i);
  if (repeat && expected !== null && totals.made !== expected && !/[()[\]]/.test(repeat[1])) {
    const group = parseItems(repeat[1]);
    const repetitions = Number(repeat[2]);
    const groupTotals = summarize(group);
    if (groupTotals.made * repetitions === expected && (previous === null || groupTotals.used * repetitions === previous)) {
      const grouped = repeatItems(group, repetitions);
      return {
        ...summarize(grouped),
        stitches: grouped,
        command: "(" + repeat[1].trim() + ") × " + repeat[2],
        note: "Sondaki ilmek sayısına göre tekrar bütün gruba uygulandı."
      };
    }
  }
  return { ...totals, stitches, command };
}

export function analyzePattern(source) {
  const rows = [];
  let round = 0;
  let previous = null;
  let stopped = false;
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const raw = line.replace(/\/\/.*$/, "").trim().replace(/^(?:[-–—]\s*)+/, "");
    if (!raw || /^(?:start\s*:|başlangıç\s*:|mr$|sh$|magic ring$|sihirli halka$)/i.test(raw)) continue;
    if (/^(?:fo|fasten off|bitir|close|kapat)[.!]?$/i.test(raw)) break;
    try {
      const { first, last, expected, command } = readLine(raw);
      const counts = command.match(/^(\d+)(?:\s*[x×*]\s*(\d+))?\s*(\?)?$/i);
      const start = first ?? round + 1;
      const repetitions = counts?.[2] ? Number(counts[2]) : 1;
      const end = counts?.[2] && (last === null || last === start) ? start + repetitions - 1 : last ?? start;
      if (start !== round + 1) throw new Error("Bu satır " + (round + 1) + ". turdan başlamalı.");
      if (end < start || end > MAX_ROUNDS) throw new Error("Tur aralığı 1–" + MAX_ROUNDS + " içinde olmalı.");
      if (counts?.[2] && last !== null && last !== start) {
        throw new Error("Tur aralığı veya tekrar sayısından birini yaz.");
      }
      for (let number = start; number <= end; number++) {
        let detail;
        if (counts) {
          const stitches = inferCountRound(Number(counts[1]), previous);
          detail = {
            ...summarize(stitches),
            stitches,
            command: describe(stitches),
            note: counts[3]
              ? "Sayıdan tahmin edildi. Soru işaretli tekrarı kontrol et."
              : "İlmek sayısından tahmin edildi."
          };
        } else {
          detail = readInstruction(command, expected, previous);
        }
        const { used, made } = detail;
        if (made < 1 || made > MAX_STITCHES) throw new Error("Bir tur 1–" + MAX_STITCHES + " ilmek üretmeli.");
        let issue = "";
        if (previous !== null && used !== previous) {
          const difference = previous - used;
          issue = "Önceki tur " + previous + " ilmek. Bu tur " + used + " ilmek kullanıyor. "
            + (difference > 0 ? difference + " ilmek boş kalıyor." : -difference + " ilmek eksik.");
        } else if (expected !== null && made !== expected) {
          issue = "Yazılan sayı " + expected + ", hesaplanan sayı " + made + ".";
        }
        rows.push({ ...detail, index, number, issue, preview: !stopped && !issue });
        stopped ||= Boolean(issue);
        previous = made;
        round = number;
      }
    } catch (error) {
      round++;
      rows.push({ index, number: round, issue: error.message, preview: false, made: null, command: raw });
      stopped = true;
      previous = null;
    }
  }
  return rows;
}

function normalizeProjectLine(line) {
  const markdown = line.match(/^\s*(?:\d+\.\s*)?\*\*(?:(?:round|tur)\s+(\d+(?:\s*[-–]\s*\d+)?)|(finishing|bitiriş))\*\*\s*:?\s*(.*)$/i);
  if (markdown) return markdown[1] ? "R" + markdown[1] + ": " + markdown[3] : markdown[3];
  const copiedRound = line.match(/^\s*(?:\d+\.\s*)?(?:round|tur)\s+(\d+(?:\s*[-–]\s*\d+)?)\s+([^:\s].*)$/i);
  if (copiedRound) return "R" + copiedRound[1] + ": " + copiedRound[2];
  const finishing = line.match(/^\s*(?:\d+\.\s*)?(?:finishing|bitiriş)\s*:?\s+(.+)$/i);
  return finishing ? finishing[1] : line;
}

export function analyzeProject(source) {
  const parts = [];
  const seenNames = new Map();
  let current = null;
  let introduction = false;

  function addPart(name, key) {
    const part = { id: key, name, lines: [] };
    parts.push(part);
    return part;
  }

  for (const line of source.split(/\r?\n/)) {
    const heading = line.match(/^\s*#{1,6}\s+(.+?)\s*#*\s*$/);
    const simple = line.match(/^\s*(the pattern|body|ears?|hat|gövde|kulak(?:lar)?|şapka)\s*:?\s*$/i);
    if (heading || simple) {
      const label = (heading ?? simple)[1].trim();
      const normalized = label.toLocaleLowerCase("tr");
      if (!current && /^(?:the pattern|pattern|tarif|örgü tarifi)$/.test(normalized)) {
        introduction = true;
        continue;
      }
      const occurrence = (seenNames.get(normalized) ?? 0) + 1;
      seenNames.set(normalized, occurrence);
      current = addPart(occurrence === 1 ? label : label + " " + occurrence, "section:" + normalized + ":" + occurrence);
      introduction = false;
    } else if (!introduction) {
      if (!current && !line.trim()) continue;
      current ??= addPart("Ana parça", "default");
      current.lines.push(normalizeProjectLine(line));
    }
  }

  if (!parts.length) addPart("Ana parça", "default");
  return parts.map(({ lines, ...part }) => ({ ...part, rows: analyzePattern(lines.join("\n")) }));
}
