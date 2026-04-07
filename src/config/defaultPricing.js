const defaultPricing = {
  currency: 'грн',
  material: {
    sheetPerSquareMeter: 320,
    profilePerMeter: 90
  },
  labor: {
    installationPerSquareMeter: 180,
    baseCornerIncluded: 4,
    extraCorner: 70
  },
  lighting: {
    spotlightInstallation: 180,
    chandelierInstallation: 350,
    ledStripPerMeter: 220
  },
  extras: {
    curtainRailPerMeter: 240,
    pipeBypass: 130,
    dismantlingPerSquareMeter: 80
  }
};

module.exports = defaultPricing;
