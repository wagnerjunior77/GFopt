const fs = require("fs");
const path = require("path");

const { GF_ENGINE } = require("./config");
const { detectSpecialPhrases } = require("./detectSpecialPhrases");
const { findBestPath } = require("./pathfinder");
const { groupNotes } = require("./groupNotes");
const { loadNotes } = require("./loadNotes");
const { roundScore } = require("./score");

function parseArgs(argv) {
  const args = {
    input: null,
    outDir: "output",
    config: structuredClone(GF_ENGINE),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      args.outDir = argv[++index];
    } else if (arg === "--phrase-gap") {
      args.config.phraseGapSeconds = Number(argv[++index]);
    } else if (arg === "--extra-score-mode") {
      args.config.spExtraScoreMode = argv[++index];
    } else if (arg === "--partial-sp") {
      args.config.activationUsesFullBar = false;
    } else if (arg === "--squeeze") {
      args.config.enableSqueeze = true;
    } else if (arg === "--squeeze-window") {
      args.config.squeezeWindowSeconds = Number(argv[++index]);
    } else if (arg === "--force-window") {
      args.config.forceWindowSeconds = Number(argv[++index]);
    } else if (arg === "--sustain-min") {
      args.config.sustainMinDurationSeconds = Number(argv[++index]);
    } else if (arg === "--no-plain-activation-variant") {
      args.config.includePlainActivationVariant = false;
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
        throw new Error("--sp-timing amount must be 2, 3, or 4");
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
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.input) {
    throw new Error("Usage: node optimize-sp.js <chart.json>");
  }

  if (!Number.isFinite(args.config.phraseGapSeconds)) {
    throw new Error("--phrase-gap must be a number");
  }
  if (!Number.isFinite(args.config.sustainMinDurationSeconds)) {
    throw new Error("--sustain-min must be a number");
  }
  for (const [amount, timing] of Object.entries(args.config.spTimings)) {
    if (
      !Number.isFinite(timing.duration) ||
      !Number.isFinite(timing.squeezeWindowSeconds) ||
      !Number.isFinite(timing.forceWindowSeconds)
    ) {
      throw new Error(
        `Invalid spTimings for ${amount}SP: duration/squeeze/force must be numbers`
      );
    }
  }
  if (
    !["gfEngine", "baseGem", "comboMultiplier"].includes(
      args.config.spExtraScoreMode
    )
  ) {
    throw new Error(
      '--extra-score-mode must be "gfEngine", "baseGem", or "comboMultiplier"'
    );
  }

  return args;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildSummary(notes, grouped, phrases, pathResult, config) {
  const totalGems = grouped.reduce((total, event) => total + event.gemCount, 0);
  const totalSustainTicks = grouped.reduce(
    (total, event) => total + event.sustainTickCount,
    0
  );
  const estimatedSustainScore = grouped.reduce(
    (total, event) => total + event.sustainScore,
    0
  );
  const estimatedHeadScore = grouped.reduce(
    (total, event) => total + event.headScore,
    0
  );
  const estimatedBaseScore = roundScore(
    grouped.reduce((total, event) => total + event.comboScore, 0)
  );
  const estimatedGainFromSP = roundScore(
    pathResult.activations.reduce(
      (total, activation) => total + activation.extraScoreFromSP,
      0
    )
  );
  const estimatedScoreWithSP = roundScore(
    estimatedBaseScore + estimatedGainFromSP
  );
  const estimatedBaseScoreGame = Math.floor(estimatedBaseScore);
  const estimatedScoreWithSPGame = Math.floor(estimatedScoreWithSP);
  const estimatedGainFromSPGame =
    estimatedScoreWithSPGame - estimatedBaseScoreGame;
  const pathNotation = pathResult.activations
    .map((activation) => activation.spAmountUsed)
    .join("-");

  return {
    inputNotes: notes.length,
    totalEvents: grouped.length,
    totalGems,
    totalSustainTicks,
    totalSpecialPhrases: phrases.length,
    estimatedHeadScore: roundScore(estimatedHeadScore),
    estimatedHeadScoreGame: Math.floor(estimatedHeadScore),
    estimatedSustainScore: roundScore(estimatedSustainScore),
    estimatedSustainScoreGameDelta:
      estimatedBaseScoreGame - Math.floor(estimatedHeadScore),
    estimatedBaseScore,
    estimatedBaseScoreGame,
    estimatedGainFromSP,
    estimatedGainFromSPGame,
    estimatedScoreWithSP,
    estimatedScoreWithSPGame,
    scoreEstimateMode: config.spExtraScoreMode,
    pathNotation,
    activations: pathResult.activations.map((activation) => ({
      activationIndex: activation.activationIndex,
      spAmountUsed: activation.spAmountUsed,
      activateAtTime: activation.activateAtTime,
      activateAtCombo: activation.activateAtCombo,
      activateAtComboEnd: activation.activateAtComboEnd,
      activationAnchorType: activation.activationAnchorType,
      activationAnchorTracks: activation.activationAnchorTracks,
      postPhraseEndActivation: activation.postPhraseEndActivation,
      activeUntilTime: activation.activeUntilTime,
      firstCoveredTime: activation.firstCoveredTime,
      firstCoveredCombo: activation.firstCoveredCombo,
      forcedEndWindowUntilTime: activation.forcedEndWindowUntilTime,
      lastCoveredTime: activation.lastCoveredTime,
      endAtCombo: activation.endAtCombo,
      coveredGemCount: activation.coveredGemCount,
      coveredEventsCount: activation.coveredEventsCount,
      coveredHeadScore: activation.coveredHeadScore,
      coveredSustainScore: activation.coveredSustainScore,
      coveredSustainTickCount: activation.coveredSustainTickCount,
      extraHeadScoreFromSP: activation.extraHeadScoreFromSP,
      extraSustainScoreFromSP: activation.extraSustainScoreFromSP,
      extraScoreFromSP: activation.extraScoreFromSP,
      spTimingCalibrated: activation.spTimingCalibrated,
      spTimingSource: activation.spTimingSource,
      activationTimingVariant: activation.activationTimingVariant,
      activationEndSlackSeconds: activation.activationEndSlackSeconds,
      requiresMaxSqueeze: activation.requiresMaxSqueeze === true,
      lostSpecialPhrases: activation.lostSpecialPhrases,
      ...(activation.usesSqueeze
        ? {
            usesSqueeze: activation.usesSqueeze,
            squeezeOffsetSeconds: activation.squeezeOffsetSeconds,
          }
        : {}),
      ...(activation.usesPreActivation
        ? {
            usesPreActivation: activation.usesPreActivation,
            preActivationOffsetSeconds: activation.preActivationOffsetSeconds,
          }
        : {}),
      ...(activation.usesForcedEnd
        ? {
            usesForcedEnd: activation.usesForcedEnd,
            usesForcedPhrase: activation.usesForcedPhrase,
            forcedPhraseOffsetSeconds: activation.forcedPhraseOffsetSeconds,
          }
        : {}),
    })),
    engine: {
      baseGemScore: config.baseGemScore,
      headScoreByMultiplier: config.headScoreByMultiplier,
      sustainMinDurationSeconds: config.sustainMinDurationSeconds,
      sustainTickIntervalSeconds: config.sustainTickIntervalSeconds,
      sustainTickScoreByMultiplier: config.sustainTickScoreByMultiplier,
      spSustainTickScoreByMultiplier: config.spSustainTickScoreByMultiplier,
      spDurations: config.spDurations,
      spTimings: config.spTimings,
      phraseGapSeconds: config.phraseGapSeconds,
      comboThresholds: config.comboThresholds,
      sustainComboThresholds: config.sustainComboThresholds,
      activationUsesFullBar: config.activationUsesFullBar,
      gainSpWhileActive: config.gainSpWhileActive,
      enableSqueeze: config.enableSqueeze,
      squeezeWindowSeconds: config.squeezeWindowSeconds,
      forceWindowSeconds: config.forceWindowSeconds,
      includePlainActivationVariant: config.includePlainActivationVariant,
      includeSustainActivationAnchors: config.includeSustainActivationAnchors,
      allowPhraseEndActivation: config.allowPhraseEndActivation,
    },
  };
}

function formatPoints(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function isMaxActivation(activation) {
  return activation.requiresMaxSqueeze === true;
}

function maxSuffix(activation) {
  return isMaxActivation(activation) ? " (Max)" : "";
}

function printPath(summary) {
  console.log(`Path: ${summary.pathNotation || "(sem ativacoes)"}`);
  console.log("");

  if (summary.activations.length === 0) {
    console.log("Nenhuma ativacao com ganho estimado foi encontrada.");
    return;
  }

  for (const activation of summary.activations) {
    const activateCombo =
      activation.activateAtComboEnd &&
      activation.activateAtComboEnd !== activation.activateAtCombo
        ? `${activation.activateAtCombo}-${activation.activateAtComboEnd}`
        : activation.activateAtCombo;
    console.log(
      `${activation.activationIndex}) ${activation.spAmountUsed}SP: ativar no combo ${activateCombo}${maxSuffix(activation)}, termina no combo ${activation.endAtCombo}`
    );
    console.log(
      `   tempo: ${activation.activateAtTime.toFixed(3)}s -> ${activation.activeUntilTime.toFixed(3)}s`
    );
    if (activation.firstCoveredTime !== activation.activateAtTime) {
      const endLabel = activation.usesForcedEnd ? "forca ate" : "termina em";
      console.log(
        `   janela: cobre desde combo ${activation.firstCoveredCombo} (${activation.firstCoveredTime.toFixed(3)}s), ${endLabel} ${activation.forcedEndWindowUntilTime.toFixed(3)}s`
      );
    }
    if (!activation.spTimingCalibrated) {
      console.log(`   timing: ${activation.spAmountUsed}SP ainda nao calibrado`);
    }
    if (activation.activationTimingVariant) {
      const slack =
        activation.activationTimingVariant === "max" &&
        !activation.requiresMaxSqueeze &&
        activation.activationEndSlackSeconds > 0
          ? ` (metade suficiente; folga final ${activation.activationEndSlackSeconds.toFixed(3)}s)`
          : "";
      console.log(`   variante: ${activation.activationTimingVariant}${slack}`);
    }
    if (activation.usesPreActivation) {
      console.log(
        `   solta ${activation.preActivationOffsetSeconds.toFixed(3)}s antes do combo ${activation.activateAtCombo}`
      );
    }
    if (activation.activationAnchorType === "sustain") {
      console.log(
        `   ativa durante sustain nas tracks ${activation.activationAnchorTracks.join(", ")}`
      );
    }
    if (activation.postPhraseEndActivation) {
      console.log("   ativa apos fechar frase de SP no mesmo combo");
    }
    console.log(
      `   cobre ${activation.coveredGemCount} bolinhas em ${activation.coveredEventsCount} eventos, ${activation.coveredSustainTickCount} ticks de long, +${formatPoints(activation.extraScoreFromSP)} pontos estimados`
    );

    if (activation.lostSpecialPhrases.length > 0) {
      const ids = activation.lostSpecialPhrases
        .map((phrase) => phrase.phraseId)
        .join(", ");
      console.log(`   perde frase(s) especial(is): ${ids}`);
    }
    console.log("");
  }

  console.log(
    `Ganho SP estimado: +${formatPoints(summary.estimatedGainFromSP)} (jogo: +${summary.estimatedGainFromSPGame})`
  );
  console.log(
    `Score estimado sem SP: ${formatPoints(summary.estimatedBaseScore)} (jogo: ${summary.estimatedBaseScoreGame})`
  );
  console.log(
    `Score estimado com SP: ${formatPoints(summary.estimatedScoreWithSP)} (jogo: ${summary.estimatedScoreWithSPGame})`
  );
}

function main() {
  const { input, outDir, config } = parseArgs(process.argv.slice(2));
  const notes = loadNotes(input);
  const grouped = groupNotes(notes, config);
  const phrases = detectSpecialPhrases(grouped, config);
  const pathResult = findBestPath(grouped, phrases, config);
  const summary = buildSummary(notes, grouped, phrases, pathResult, config);

  writeJson(path.join(outDir, "grouped-notes.json"), grouped);
  writeJson(path.join(outDir, "special-phrases.json"), phrases);
  writeJson(path.join(outDir, "sp-path.json"), pathResult.activations);
  writeJson(path.join(outDir, "summary.json"), summary);

  printPath(summary);
}

function runMain() {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runMain();
}

module.exports = { buildSummary, main, parseArgs, runMain };
