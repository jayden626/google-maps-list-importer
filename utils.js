// utils.js

const fs = require("fs");
const path = require("path");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatTime(seconds) {
  seconds = Math.round(seconds);

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h) return `${h}h ${m}m ${s}s`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function appendLine(file, text) {
  fs.appendFileSync(file, text + "\n");
}

function loadLines(file) {
  if (!fs.existsSync(file)) {
    return new Set();
  }

  return new Set(
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean),
  );
}

function findFiles(dir, extensions) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  let results = [];

  for (const entry of fs.readdirSync(dir, {
    withFileTypes: true,
  })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...findFiles(full, extensions));
    } else if (
      entry.isFile() &&
      extensions.includes(path.extname(entry.name).toLowerCase())
    ) {
      results.push(full);
    }
  }

  return results;
}

function extractSavedPlaces(file) {
  let content = fs.readFileSync(file, "utf8").replace(/,\s*([\]}])/g, "$1");

  const json = JSON.parse(content);

  if (json.type !== "FeatureCollection" || !Array.isArray(json.features)) {
    return [];
  }

  return json.features
    .map((feature) => {
      const p = feature.properties || {};
      const l = p.location || {};

      return {
        name: l.name || "Unknown place",
        note: "",
        url: p.google_maps_url,
        list: "Starred places",
      };
    })
    .filter((x) => x.url);
}

function parseCSVLine(line) {
  const values = [];

  let current = "";
  let quoted = false;
  console.log(line)

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());

  return values;
}

function extractCSV(file) {
  const list = path.basename(file, ".csv");

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

  const places = [];

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      console.log("!line")
      continue;
    }

    const [title, note, url] = parseCSVLine(line);

    if (!url) {
      console.log("!url")
      continue;
    }

    places.push({
      name: title || "Unknown place",
      note: note || "",
      url,
      list,
    });
  }
  console.log(places.length)

  return places;
}

module.exports = {
  sleep,
  formatTime,
  timestamp,
  appendLine,
  loadLines,
  findFiles,
  extractSavedPlaces,
  extractCSV,
};
