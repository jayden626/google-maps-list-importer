// utils.js

const fs = require("fs-extra");
const path = require("path");
const { parse } = require("csv-parse/sync");

function formatTime(seconds) {
  const totalSeconds = Math.round(seconds);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function appendLine(file, text) {
  fs.appendFileSync(file, `${text}\n`);
}

function loadLines(file) {
  if (!fs.existsSync(file)) {
    return new Set();
  }

  return new Set(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

function extractSavedPlaces(file, targetList = "Starred places") {
  const content = fs
    .readFileSync(file, "utf8")
    .replace(/,\s*([\]}])/g, "$1");

  const json = JSON.parse(content);

  if (
    json.type !== "FeatureCollection" ||
    !Array.isArray(json.features)
  ) {
    return [];
  }

  return json.features
    .map((feature) => {
      const properties = feature.properties || {};
      const location = properties.location || {};

      return {
        name: location.name || "Unknown place",
        note: "",
        url: properties.google_maps_url,
        list: targetList,
      };
    })
    .filter((place) => place.url);
}

function extractCSV(file) {
  const list = path.basename(file, ".csv");

  const content = fs.readFileSync(file, "utf8");

  const rows = parse(content, {
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  const places = [];

  for (let i = 2; i < rows.length; i++) {
    const [title, note, url] = rows[i];

    if (!url) {
      continue;
    }

    places.push({
      name: title || "Unknown place",
      note: note || "",
      url: url.trim(),
      list,
    });
  }

  return places;
}

function loadPlaces(importDirectory, options = {}) {
  const { targetList = "Starred places", jsonFileName = "Saved Places.json" } = options;

  console.log(`Scanning ${importDirectory}...`);

  if (!fs.existsSync(importDirectory)) {
    return {};
  }

  const files = fs
    .readdirSync(importDirectory)
    .filter((f) => f.endsWith(".json") || f.toLowerCase().endsWith(".csv"))
    .map((f) => path.join(importDirectory, f));

  const placesByList = {};

  for (const file of files) {
    try {
      console.log(`Loading ${file}`);

      let list;
      let places;

      if (path.basename(file).toLowerCase() === jsonFileName.toLowerCase()) {
        list = targetList;
        places = extractSavedPlaces(file, targetList);
      } else if (file.toLowerCase().endsWith(".csv")) {
        list = path.basename(file, ".csv");
        places = extractCSV(file);
      } else {
        continue;
      }

      placesByList[list] = places;
    } catch (err) {
      console.log(`Failed reading ${file}: ${err.message}`);
    }
  }

  return placesByList;
}

module.exports = {
  formatTime,
  appendLine,
  loadLines,
  extractSavedPlaces,
  extractCSV,
  loadPlaces,
};