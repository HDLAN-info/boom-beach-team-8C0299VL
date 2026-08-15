import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const publishedBase = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQqE6PF33q7CNxxCxsS26B7gHSQui6Sw2sJtuFt_cJsWfqADrxVqnTTsRS9XVSNqWyZnJqVS6GhuwOk/pub?output=csv";
const sources = {
  playersCsv: publishedBase,
  teamInfoCsv: `${publishedBase}&gid=861518513`,
  lastUpdateCsv: "https://docs.google.com/spreadsheets/d/1QwQtftNvKBuVT1hTVxgilxiUdDT_D1OEhA8ILINs0Wo/gviz/tq?tqx=out:csv&sheet=TEAM%20INFO&range=B6",
  intelHistoryCsv: `${publishedBase}&gid=1591390740`,
  vpHistoryCsv: `${publishedBase}&gid=890280555`,
  teamIntelHistoryCsv: "https://docs.google.com/spreadsheets/d/1Rid8YU8T8fBx2d-Ql6B5KtpDDhFdlG0ERfwZUspCTfs/gviz/tq?tqx=out:csv&sheet=SABOTAZE&range=A:H"
};

function parseCsvRow(row) {
  const columns = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '"' && quoted && row[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      columns.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  columns.push(value);
  return columns;
}

function toCsvRow(columns) {
  return columns.map(value => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(",");
}

function trimPlayerHistory(text) {
  return text.trim().split(/\r?\n/).map(parseCsvRow)
    .map((columns, rowIndex) => {
      const history = rowIndex === 0
        ? columns.slice(2).slice(-30)
        : columns.slice(2).filter(value => String(value).trim() !== "").slice(-30);
      return toCsvRow([...columns.slice(0, 2), ...history]);
    })
    .join("\n");
}

function trimRows(text, maximumDataRows) {
  const rows = text.trim().split(/\r?\n/);
  return [rows[0], ...rows.slice(1).filter(row => row.trim() !== "").slice(-maximumDataRows)].join("\n");
}

function trimPlayers(text) {
  const rows = text.trim().split(/\r?\n/);
  return [rows[0], ...rows.slice(1, 51)].join("\n");
}

const transforms = {
  playersCsv: trimPlayers,
  intelHistoryCsv: trimPlayerHistory,
  vpHistoryCsv: trimPlayerHistory,
  teamIntelHistoryCsv: text => trimRows(text, 30)
};

async function download([key, url]) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "boom-beach-cache-updater" }, signal: AbortSignal.timeout(90000) });
      if (!response.ok) throw new Error(`${key}: HTTP ${response.status}`);
      const text = (await response.text()).replace(/\r\n/g, "\n");
      console.log(`${key} downloaded.`);
      return [key, transforms[key] ? transforms[key](text) : text];
    } catch (error) {
      lastError = error;
      console.warn(`${key} attempt ${attempt} failed.`);
    }
  }
  throw lastError;
}

const cache = Object.fromEntries(await Promise.all(Object.entries(sources).map(download)));
const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), "../data/cache.json");
const nextContent = `${JSON.stringify(cache, null, 2)}\n`;
let previousContent = "";
try { previousContent = await readFile(outputPath, "utf8"); } catch {}
if (previousContent !== nextContent) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, nextContent, "utf8");
  console.log("Data cache updated.");
} else {
  console.log("Data cache is already current.");
}