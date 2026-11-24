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

function parseStitch(part) {
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
    if (suffix) {
      label = suffix[1].trim();
      count = Number(suffix[2]);
    } else if (prefix) {
      label = prefix[2].trim();
      count = Number(prefix[1]);
    }
  }
  const value = aliases.get(label);
  if (!value) throw new Error("Bu yazımı tanıyamadım: " + part);
  return repeatItems([{ ...value, loop }], count);
}

function readLine(raw) {
  const heading = raw.match(/^(?:(?:r(?:nd|ound)?|row|tur|sıra)\s*)?(\d+)(?:\s*[-–]\s*(\d+))?(?:\s*\.?\s*(?:tur|sıra))?\s*[:.]\s*(.+)$/i);
  const first = heading ? Number(heading[1]) : null;
  const last = heading ? Number(heading[2] ?? heading[1]) : null;
  let command = heading ? heading[3] : raw;
  const expectedMatch = command.match(/\s*(?:[=(→]\s*(\d+)\s*(?:sts?|ilmek)?\)?|\[\s*(\d+)\s*(?:sts?|ilmek)?\])\s*$/i);
  const expected = expectedMatch ? Number(expectedMatch[1] ?? expectedMatch[2]) : null;
  if (expectedMatch) command = command.slice(0, expectedMatch.index).trim();
  if (/^(?:mr|sh|magic ring|sihirli halka)\s*[:(]/i.test(command)) {
    command = command.replace(/^(?:mr|sh|magic ring|sihirli halka)\s*[:(]\s*/i, "").replace(/\)\s*$/, "");
  }
  command = command.replace(/\s+(?:in(?:to)?\s+(?:a\s+|the\s+)?(?:magic ring|ring|mr)|sh içine|sihirli halkaya)$/i, "");
  return { first, last, expected, command };
}

export function analyzePattern(source) {
  const rows = [];
  let round = 0;
  let previous = null;
  let stopped = false;
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const raw = line.replace(/\/\/.*$/, "").trim();
    if (!raw || /^(?:start\s*:|başlangıç\s*:|mr$|sh$|magic ring$|sihirli halka$)/i.test(raw)) continue;
    if (/^(?:fo|fasten off|bitir)$/i.test(raw)) break;
    try {
      const { first, last, expected, command } = readLine(raw);
      const start = first ?? round + 1;
      const end = last ?? start;
      if (start !== round + 1) throw new Error("Bu satır " + (round + 1) + ". turdan başlamalı.");
      if (end < start || end > MAX_ROUNDS) throw new Error("Tur aralığı 1–" + MAX_ROUNDS + " içinde olmalı.");
      const stitches = parseItems(command);
      const used = stitches.reduce((sum, item) => sum + item.used, 0);
      const made = stitches.reduce((sum, item) => sum + item.made, 0);
      const height = stitches.reduce((sum, item) => sum + item.height * item.made, 0) / Math.max(1, made);
      if (made < 1 || made > MAX_STITCHES) throw new Error("Bir tur 1–" + MAX_STITCHES + " ilmek üretmeli.");
      for (let number = start; number <= end; number++) {
        const issue = previous !== null && used !== previous
          ? "Önceki tur " + previous + " ilmek. Bu tur " + used + " ilmek kullanıyor."
          : expected !== null && made !== expected
            ? "Yazılan sayı " + expected + ", hesaplanan sayı " + made + "."
            : "";
        rows.push({ index, number, used, made, height, stitches, issue, preview: !stopped && !issue, command });
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
