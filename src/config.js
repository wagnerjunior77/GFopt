const GF_ENGINE = {
  baseGemScore: 20,
  headScoreByMultiplier: {
    1: 5,
    2: 10,
    3: 15,
    4: 20,
  },
  maxMultiplier: 4,
  spScoreMultiplier: 2,

  sustainMinDurationSeconds: 0.208333,
  sustainTickIntervalSeconds: 1 / 24,
  sustainTickScoreByMultiplier: {
    1: 0.12,
    2: 0.13,
    3: 0.14,
    4: 0.15,
  },
  spSustainTickScoreByMultiplier: {
    1: 0.14,
    2: 0.16,
    3: 0.18,
    4: 0.2,
  },

  phraseGain: 1,
  minActivation: 2,
  maxBar: 4,

  spDurations: {
    2: 7.3,
    3: 11.38,
    4: 15.51,
  },

  spTimings: {
    2: {
      duration: 7.3,
      squeezeWindowSeconds: 0.125,
      forceWindowSeconds: 0.125,
      calibrated: true,
      source: "calibrated AV 7.55s",
    },
    3: {
      duration: 11.38,
      squeezeWindowSeconds: 0.125,
      forceWindowSeconds: 0.125,
      calibrated: true,
      source: "calibrated AV 11.63s",
    },
    4: {
      duration: 15.51,
      squeezeWindowSeconds: 0.125,
      forceWindowSeconds: 0.125,
      calibrated: true,
      source: "calibrated AV 15.76s",
    },
  },

  gainSpWhileActive: false,

  enableSqueeze: true,
  squeezeWindowSeconds: 0,
  forceWindowSeconds: 0,
  includePlainActivationVariant: true,
  includeSustainActivationAnchors: true,
  allowPhraseEndActivation: true,
  maxSqueezeSlackToleranceSeconds: 0.011,

  phraseGapSeconds: 2.0,

  comboThresholds: {
    x2: 11,
    x3: 21,
    x4: 31,
  },
  sustainComboThresholds: {
    x2: 10,
    x3: 20,
    x4: 30,
  },

  activationUsesFullBar: true,

  spExtraScoreMode: "gfEngine",
};

module.exports = { GF_ENGINE };
