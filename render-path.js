#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

let sharp = null;
try {
  sharp = require("sharp");
} catch {
  sharp = null;
}

const { GF_ENGINE } = require("./src/config");
const { detectSpecialPhrases } = require("./src/detectSpecialPhrases");
const { groupNotes } = require("./src/groupNotes");
const { loadNotes } = require("./src/loadNotes");
const { findBestPath } = require("./src/pathfinder");
const { buildSummary } = require("./src/index");

const TRACK_COLORS = {
  0: "#00c93a",
  1: "#e11616",
  2: "#f2e51e",
  3: "#1449f5",
  4: "#ff8a00",
};

const TRACK_STROKES = {
  0: "#087d2b",
  1: "#9c1111",
  2: "#948800",
  3: "#0c2fa5",
  4: "#a85800",
};

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseNumberOption(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${name} precisa ser um numero positivo`);
  }
  return number;
}

function parseArgs(argv) {
  const args = {
    input: null,
    outRoot: "output",
    width: 1400,
    rowSeconds: 12,
    png: true,
    config: structuredClone(GF_ENGINE),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      args.outRoot = argv[++index];
    } else if (arg === "--width") {
      args.width = parseNumberOption(argv[++index], "--width");
    } else if (arg === "--row-seconds") {
      args.rowSeconds = parseNumberOption(argv[++index], "--row-seconds");
    } else if (arg === "--no-png") {
      args.png = false;
    } else if (arg === "--phrase-gap") {
      args.config.phraseGapSeconds = Number(argv[++index]);
    } else if (arg === "--sustain-min") {
      args.config.sustainMinDurationSeconds = Number(argv[++index]);
    } else if (arg === "--no-sustain-anchors") {
      args.config.includeSustainActivationAnchors = false;
    } else if (arg === "--no-phrase-end-activation") {
      args.config.allowPhraseEndActivation = false;
    } else if (arg === "--sp-timing") {
      const value = argv[++index];
      const [amountText, durationText, squeezeText = "0", forceText = "0"] =
        value.split(":");
      const amount = Number(amountText);
      if (![2, 3, 4].includes(amount)) {
        throw new Error("--sp-timing amount deve ser 2, 3 ou 4");
      }
      args.config.spTimings[amount] = {
        duration: Number(durationText),
        squeezeWindowSeconds: Number(squeezeText),
        forceWindowSeconds: Number(forceText),
        calibrated: true,
        source: "cli",
      };
      args.config.spDurations[amount] = Number(durationText);
    } else if (!arg.startsWith("--") && args.input === null) {
      args.input = arg;
    } else {
      throw new Error(`Opcao desconhecida: ${arg}`);
    }
  }

  if (!args.input) {
    throw new Error("Uso: node render-path.js <chart.json>");
  }

  return args;
}

function outputDirForInput(input, outRoot) {
  const chartName = path.basename(input, path.extname(input));
  return path.join(outRoot, chartName || "chart");
}

function optimize(input, config) {
  const notes = loadNotes(input);
  const grouped = groupNotes(notes, config);
  const phrases = detectSpecialPhrases(grouped, config);
  const pathResult = findBestPath(grouped, phrases, config);
  const summary = buildSummary(notes, grouped, phrases, pathResult, config);
  return { notes, grouped, phrases, pathResult, summary };
}

function comboText(start, end = start) {
  return start === end ? String(start) : `${start}-${end}`;
}

function isMaxActivation(activation) {
  return activation.requiresMaxSqueeze === true;
}

function maxSuffix(activation) {
  return isMaxActivation(activation) ? " (Max)" : "";
}

function activationComboText(activation) {
  return `${comboText(
    activation.activateAtCombo,
    activation.activateAtComboEnd
  )}${maxSuffix(activation)}`;
}

function maxEventEnd(event) {
  return event.sustainNotes.reduce(
    (max, note) => Math.max(max, note.end),
    event.time
  );
}

function chartMaxTime(grouped, activations) {
  const notesEnd = grouped.reduce((max, event) => Math.max(max, maxEventEnd(event)), 0);
  const activationsEnd = activations.reduce(
    (max, activation) =>
      Math.max(max, activation.forcedEndWindowUntilTime ?? activation.activeUntilTime),
    0
  );
  return Math.max(notesEnd, activationsEnd);
}

function xForTime(time, rowStart, rowSeconds, layout) {
  return (
    layout.left +
    ((time - rowStart) / rowSeconds) * layout.plotWidth
  );
}

function yForTrack(track, rowTop, layout) {
  return rowTop + layout.chartTop + track * layout.laneGap;
}

function rowIndexForTime(time, rowSeconds) {
  const adjusted = time > 0 ? time - 0.000001 : time;
  return Math.max(0, Math.floor(adjusted / rowSeconds));
}

function intervalRowSegments(start, end, rowSeconds, rowCount) {
  const segments = [];
  const first = Math.max(0, rowIndexForTime(start, rowSeconds));
  const last = Math.min(rowCount - 1, rowIndexForTime(Math.max(start, end - 0.000001), rowSeconds));

  for (let row = first; row <= last; row += 1) {
    const rowStart = row * rowSeconds;
    const rowEnd = rowStart + rowSeconds;
    const segmentStart = Math.max(start, rowStart);
    const segmentEnd = Math.min(end, rowEnd);
    if (segmentEnd >= segmentStart) {
      segments.push({ row, start: segmentStart, end: segmentEnd });
    }
  }

  return segments;
}

function starPoints(cx, cy, outer, inner) {
  const points = [];
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    points.push(
      `${round(cx + Math.cos(angle) * radius, 2)},${round(
        cy + Math.sin(angle) * radius,
        2
      )}`
    );
  }
  return points.join(" ");
}

function markerLine(x, y1, y2, color, width = 2, dash = "") {
  return `<line x1="${round(x, 2)}" y1="${round(y1, 2)}" x2="${round(
    x,
    2
  )}" y2="${round(y2, 2)}" stroke="${color}" stroke-width="${width}"${
    dash ? ` stroke-dasharray="${dash}"` : ""
  } />`;
}

function rect(x, y, width, height, fill, opacity = 1) {
  return `<rect x="${round(x, 2)}" y="${round(y, 2)}" width="${round(
    width,
    2
  )}" height="${round(height, 2)}" fill="${fill}" opacity="${opacity}" />`;
}

function renderActivationBands(activations, rowCount, rowSeconds, layout) {
  const parts = [];

  for (const activation of activations) {
    const timerStart = activation.activateAtTime;
    const timerEnd = activation.activeUntilTime;
    const coverageStart = activation.firstCoveredTime ?? timerStart;
    const coverageEnd = activation.forcedEndWindowUntilTime ?? timerEnd;

    for (const segment of intervalRowSegments(
      timerStart,
      timerEnd,
      rowSeconds,
      rowCount
    )) {
      const rowTop = layout.headerHeight + segment.row * layout.rowHeight;
      const x1 = xForTime(segment.start, segment.row * rowSeconds, rowSeconds, layout);
      const x2 = xForTime(segment.end, segment.row * rowSeconds, rowSeconds, layout);
      parts.push(
        rect(
          x1,
          rowTop + layout.chartTop - layout.noteRadius - 4,
          x2 - x1,
          layout.chartHeight + layout.noteRadius * 2 + 8,
          "#7567ff",
          0.34
        )
      );
    }

    for (const segment of intervalRowSegments(
      coverageStart,
      coverageEnd,
      rowSeconds,
      rowCount
    )) {
      const rowTop = layout.headerHeight + segment.row * layout.rowHeight;
      const x1 = xForTime(segment.start, segment.row * rowSeconds, rowSeconds, layout);
      const x2 = xForTime(segment.end, segment.row * rowSeconds, rowSeconds, layout);
      parts.push(
        rect(
          x1,
          rowTop + layout.chartTop - layout.noteRadius - 4,
          x2 - x1,
          layout.chartHeight + layout.noteRadius * 2 + 8,
          "#40e963",
          0.18
        )
      );
    }
  }

  return parts.join("\n");
}

function renderGrid(rowCount, rowSeconds, layout) {
  const parts = [];
  const minorStep = rowSeconds <= 10 ? 0.5 : 1;
  const majorStep = rowSeconds <= 12 ? 3 : 4;

  for (let row = 0; row < rowCount; row += 1) {
    const rowTop = layout.headerHeight + row * layout.rowHeight;
    const chartTop = rowTop + layout.chartTop - layout.noteRadius - 4;
    const chartBottom = chartTop + layout.chartHeight + layout.noteRadius * 2 + 8;
    const rowStart = row * rowSeconds;
    const rowEnd = rowStart + rowSeconds;

    parts.push(
      `<text x="${layout.left}" y="${rowTop + 17}" class="row-label">${row + 1}</text>`
    );
    parts.push(
      `<text x="${layout.left + layout.plotWidth}" y="${rowTop + 17}" class="time-label" text-anchor="end">${round(
        rowStart,
        1
      )}s - ${round(rowEnd, 1)}s</text>`
    );
    parts.push(
      `<rect x="${layout.left}" y="${chartTop}" width="${layout.plotWidth}" height="${
        chartBottom - chartTop
      }" fill="#ffffff" stroke="#444" stroke-width="1" />`
    );

    for (let track = 0; track < 5; track += 1) {
      const y = yForTrack(track, rowTop, layout);
      parts.push(
        `<line x1="${layout.left}" y1="${round(y, 2)}" x2="${
          layout.left + layout.plotWidth
        }" y2="${round(y, 2)}" stroke="#9a9a9a" stroke-width="1" />`
      );
    }

    for (let offset = 0; offset <= rowSeconds + 0.000001; offset += minorStep) {
      const x = xForTime(rowStart + offset, rowStart, rowSeconds, layout);
      const isMajor =
        Math.abs(offset % majorStep) < 0.000001 ||
        Math.abs((offset % majorStep) - majorStep) < 0.000001;
      parts.push(
        `<line x1="${round(x, 2)}" y1="${round(chartTop, 2)}" x2="${round(
          x,
          2
        )}" y2="${round(chartBottom, 2)}" stroke="${
          isMajor ? "#8f8f8f" : "#d4d4d4"
        }" stroke-width="${isMajor ? 1 : 0.7}" />`
      );
    }
  }

  return parts.join("\n");
}

function renderSustains(grouped, rowCount, rowSeconds, layout) {
  const parts = [];

  for (const event of grouped) {
    for (const note of event.sustainNotes) {
      for (const segment of intervalRowSegments(
        note.start,
        note.end,
        rowSeconds,
        rowCount
      )) {
        const rowTop = layout.headerHeight + segment.row * layout.rowHeight;
        const rowStart = segment.row * rowSeconds;
        const x1 = xForTime(segment.start, rowStart, rowSeconds, layout);
        const x2 = xForTime(segment.end, rowStart, rowSeconds, layout);
        const y = yForTrack(note.track, rowTop, layout);
        const color = TRACK_COLORS[note.track] ?? "#777";
        parts.push(
          `<line x1="${round(x1, 2)}" y1="${round(y, 2)}" x2="${round(
            x2,
            2
          )}" y2="${round(y, 2)}" stroke="${color}" stroke-width="7" stroke-linecap="round" opacity="0.88" />`
        );
      }
    }
  }

  return parts.join("\n");
}

function renderNotes(grouped, rowSeconds, layout) {
  const parts = [];

  for (const event of grouped) {
    const row = rowIndexForTime(event.time, rowSeconds);
    const rowTop = layout.headerHeight + row * layout.rowHeight;
    const rowStart = row * rowSeconds;
    const x = xForTime(event.time, rowStart, rowSeconds, layout);
    const specialTracks = new Set(event.specialTracks);

    for (const track of event.tracks) {
      const y = yForTrack(track, rowTop, layout);
      const color = TRACK_COLORS[track] ?? "#777";
      const stroke = TRACK_STROKES[track] ?? "#333";

      if (specialTracks.has(track)) {
        parts.push(
          `<polygon points="${starPoints(
            x,
            y,
            layout.noteRadius + 2,
            layout.noteRadius * 0.48
          )}" fill="${color}" stroke="#132613" stroke-width="1.1" />`
        );
      } else {
        parts.push(
          `<circle cx="${round(x, 2)}" cy="${round(y, 2)}" r="${
            layout.noteRadius
          }" fill="${color}" stroke="${stroke}" stroke-width="1.2" />`
        );
      }
    }
  }

  return parts.join("\n");
}

function renderPhrases(phrases, rowCount, rowSeconds, layout) {
  const parts = [];

  for (const phrase of phrases) {
    for (const segment of intervalRowSegments(
      phrase.start,
      phrase.end,
      rowSeconds,
      rowCount
    )) {
      const rowTop = layout.headerHeight + segment.row * layout.rowHeight;
      const rowStart = segment.row * rowSeconds;
      const x1 = xForTime(segment.start, rowStart, rowSeconds, layout);
      const x2 = xForTime(segment.end, rowStart, rowSeconds, layout);
      const y = rowTop + layout.chartTop + layout.chartHeight + 17;
      parts.push(
        `<line x1="${round(x1, 2)}" y1="${round(y, 2)}" x2="${round(
          x2,
          2
        )}" y2="${round(y, 2)}" stroke="#00a6a6" stroke-width="3" opacity="0.75" />`
      );
    }
  }

  return parts.join("\n");
}

function renderActivationMarkers(activations, rowSeconds, layout) {
  const parts = [];

  for (const activation of activations) {
    const row = rowIndexForTime(activation.activateAtTime, rowSeconds);
    const rowStart = row * rowSeconds;
    const rowTop = layout.headerHeight + row * layout.rowHeight;
    const chartTop = rowTop + layout.chartTop - layout.noteRadius - 4;
    const chartBottom = chartTop + layout.chartHeight + layout.noteRadius * 2 + 8;
    const x = xForTime(activation.activateAtTime, rowStart, rowSeconds, layout);
    const labelReserve = isMaxActivation(activation) ? 88 : 56;
    const labelX = Math.min(
      layout.left + layout.plotWidth - labelReserve,
      Math.max(layout.left + 4, x + 5)
    );
    const activateCombo = activationComboText(activation);

    parts.push(markerLine(x, chartTop - 8, chartBottom + 18, "#d71920", 2.5));
    parts.push(
      `<text x="${round(labelX, 2)}" y="${round(
        chartTop - 12,
        2
      )}" class="activation-label">${escapeXml(
        `${activation.activationIndex}${maxSuffix(activation)}`
      )}</text>`
    );
    parts.push(
      `<text x="${round(labelX, 2)}" y="${round(
        chartTop + 2,
        2
      )}" class="activation-small">${escapeXml(
        `${activation.spAmountUsed}SP @${activateCombo}`
      )}</text>`
    );

    const endRow = rowIndexForTime(activation.activeUntilTime, rowSeconds);
    const endRowStart = endRow * rowSeconds;
    const endRowTop = layout.headerHeight + endRow * layout.rowHeight;
    const endChartTop = endRowTop + layout.chartTop - layout.noteRadius - 4;
    const endChartBottom =
      endChartTop + layout.chartHeight + layout.noteRadius * 2 + 8;
    const endX = xForTime(
      activation.activeUntilTime,
      endRowStart,
      rowSeconds,
      layout
    );
    const endLabelX = Math.min(
      layout.left + layout.plotWidth - 60,
      Math.max(layout.left + 4, endX + 5)
    );
    parts.push(markerLine(endX, endChartTop, endChartBottom, "#4d3bd1", 1.5, "4 3"));
    parts.push(
      `<text x="${round(endLabelX, 2)}" y="${round(
        endChartBottom + 15,
        2
      )}" class="end-label">fim ${activation.endAtCombo}</text>`
    );
  }

  return parts.join("\n");
}

function renderHeader(input, summary, layout) {
  const title = path.basename(input);
  const pathNotation = summary.pathNotation || "(sem ativacoes)";
  const line1 = `${title}`;
  const line2 = `Path ${pathNotation} | score ${summary.estimatedScoreWithSPGame} | sem SP ${summary.estimatedBaseScoreGame}`;
  const line3 = `${summary.totalGems} bolinhas | ${summary.totalEvents} eventos | ${summary.totalSpecialPhrases} frases de SP`;

  return `
    <text x="${layout.left}" y="28" class="title">${escapeXml(line1)}</text>
    <text x="${layout.left}" y="52" class="subtitle">${escapeXml(line2)}</text>
    <text x="${layout.left}" y="72" class="meta">${escapeXml(line3)}</text>
    ${renderActivationSummary(summary, layout)}
  `;
}

function activationSummaryHeight(summary) {
  if (summary.activations.length === 0) return 0;
  return Math.ceil(summary.activations.length / 4) * 18;
}

function renderActivationSummary(summary, layout) {
  if (summary.activations.length === 0) return "";

  const parts = [];
  const columns = 4;
  const columnWidth = layout.plotWidth / columns;
  const yStart = 96;

  for (const activation of summary.activations) {
    const index = activation.activationIndex - 1;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = layout.left + column * columnWidth;
    const y = yStart + row * 18;
    const activateCombo = activationComboText(activation);
    const text = `${activation.activationIndex}) ${activation.spAmountUsed}SP @ ${activateCombo} -> fim ${activation.endAtCombo}`;
    parts.push(
      `<text x="${round(x, 2)}" y="${round(y, 2)}" class="activation-summary">${escapeXml(text)}</text>`
    );
  }

  return parts.join("\n");
}

function renderLegend(layout) {
  const labels = [
    ["#7567ff", "timer do SP"],
    ["#40e963", "squeeze/forcada"],
    ["#00a6a6", "frase de SP"],
    ["#d71920", "ativacao"],
  ];
  const parts = [];
  let x = layout.left + 600;
  const y = 52;

  for (const [color, label] of labels) {
    parts.push(`<rect x="${x}" y="${y - 10}" width="18" height="10" fill="${color}" opacity="0.5" />`);
    parts.push(`<text x="${x + 24}" y="${y}" class="legend">${escapeXml(label)}</text>`);
    x += 150;
  }

  return parts.join("\n");
}

function renderSvg(input, grouped, phrases, summary, options) {
  const layout = {
    width: options.width,
    left: 36,
    right: 24,
    headerHeight: 106 + activationSummaryHeight(summary),
    rowHeight: 118,
    chartTop: 36,
    chartHeight: 56,
    laneGap: 14,
    noteRadius: 5,
  };
  layout.plotWidth = layout.width - layout.left - layout.right;

  const maxTime = chartMaxTime(grouped, summary.activations);
  const rowCount = Math.max(1, Math.ceil(maxTime / options.rowSeconds));
  const height = layout.headerHeight + rowCount * layout.rowHeight + 30;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${height}" viewBox="0 0 ${layout.width} ${height}">
  <style>
    .title { font: 700 22px Arial, sans-serif; fill: #111; }
    .subtitle { font: 700 15px Arial, sans-serif; fill: #111; }
    .meta { font: 12px Arial, sans-serif; fill: #444; }
    .legend { font: 11px Arial, sans-serif; fill: #444; }
    .activation-summary { font: 700 12px Arial, sans-serif; fill: #007878; }
    .row-label { font: 700 13px Arial, sans-serif; fill: #d71920; }
    .time-label { font: 11px Arial, sans-serif; fill: #777; }
    .activation-label { font: 700 13px Arial, sans-serif; fill: #d71920; }
    .activation-small { font: 700 10px Arial, sans-serif; fill: #008f8f; }
    .end-label { font: 700 10px Arial, sans-serif; fill: #008f8f; }
  </style>
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${renderHeader(input, summary, layout)}
  ${renderLegend(layout)}
  ${renderGrid(rowCount, options.rowSeconds, layout)}
  ${renderActivationBands(summary.activations, rowCount, options.rowSeconds, layout)}
  ${renderPhrases(phrases, rowCount, options.rowSeconds, layout)}
  ${renderSustains(grouped, rowCount, options.rowSeconds, layout)}
  ${renderNotes(grouped, options.rowSeconds, layout)}
  ${renderActivationMarkers(summary.activations, options.rowSeconds, layout)}
</svg>
`;
}

async function writeOutputs(svg, outDir, writePng) {
  fs.mkdirSync(outDir, { recursive: true });
  const svgPath = path.join(outDir, "path.svg");
  const pngPath = path.join(outDir, "path.png");

  fs.writeFileSync(svgPath, svg, "utf8");

  if (writePng) {
    if (!sharp) {
      console.warn("sharp nao esta instalado; gerei apenas o SVG.");
      return { svgPath, pngPath: null };
    }
    await sharp(Buffer.from(svg)).png().toFile(pngPath);
    return { svgPath, pngPath };
  }

  return { svgPath, pngPath: null };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { grouped, phrases, summary } = optimize(args.input, args.config);
  const svg = renderSvg(args.input, grouped, phrases, summary, args);
  const outputs = await writeOutputs(
    svg,
    outputDirForInput(args.input, args.outRoot),
    args.png
  );

  console.log(`Path: ${summary.pathNotation || "(sem ativacoes)"}`);
  console.log(`Score estimado: ${summary.estimatedScoreWithSPGame}`);
  console.log(`SVG: ${outputs.svgPath}`);
  if (outputs.pngPath) console.log(`PNG: ${outputs.pngPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
