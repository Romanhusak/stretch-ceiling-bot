const { readPricing } = require('./pricingStore');

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function calculateRoomEstimate(input, roomNumber = 1) {
  const pricing = readPricing();
  const area = Number(input.area);
  const perimeter = Number(input.perimeter);
  const corners = Number(input.corners);
  const spotlights = Number(input.spotlights);
  const chandeliers = Number(input.chandeliers);
  const ledStripMeters = Number(input.ledStripMeters);
  const curtainRailMeters = Number(input.curtainRailMeters);
  const pipeBypasses = Number(input.pipeBypasses);
  const dismantlingArea = Number(input.dismantlingArea);

  const materialSheet = area * pricing.material.sheetPerSquareMeter;
  const profile = perimeter * pricing.material.profilePerMeter;
  const installation = area * pricing.labor.installationPerSquareMeter;
  const extraCorners = Math.max(0, corners - pricing.labor.baseCornerIncluded);
  const extraCornerCost = extraCorners * pricing.labor.extraCorner;
  const spotlightCost = spotlights * pricing.lighting.spotlightInstallation;
  const chandelierCost = chandeliers * pricing.lighting.chandelierInstallation;
  const ledStripCost = ledStripMeters * pricing.lighting.ledStripPerMeter;
  const curtainRailCost = curtainRailMeters * pricing.extras.curtainRailPerMeter;
  const pipeBypassCost = pipeBypasses * pricing.extras.pipeBypass;
  const dismantlingCost = dismantlingArea * pricing.extras.dismantlingPerSquareMeter;

  const items = [
    { label: 'Полотно', quantity: `${area} м2`, total: materialSheet },
    { label: 'Профіль', quantity: `${perimeter} м`, total: profile },
    { label: 'Монтаж стелі', quantity: `${area} м2`, total: installation },
    { label: 'Додаткові кути', quantity: `${extraCorners} шт`, total: extraCornerCost },
    { label: 'Точкові світильники', quantity: `${spotlights} шт`, total: spotlightCost },
    { label: 'Люстри', quantity: `${chandeliers} шт`, total: chandelierCost },
    { label: 'LED-підсвітка', quantity: `${ledStripMeters} м`, total: ledStripCost },
    { label: 'Карниз', quantity: `${curtainRailMeters} м`, total: curtainRailCost },
    { label: 'Обхід труб', quantity: `${pipeBypasses} шт`, total: pipeBypassCost },
    { label: 'Демонтаж', quantity: `${dismantlingArea} м2`, total: dismantlingCost }
  ].map((item) => ({
    ...item,
    total: roundMoney(item.total)
  }));

  const total = roundMoney(items.reduce((sum, item) => sum + item.total, 0));

  return {
    roomNumber,
    currency: pricing.currency,
    total,
    input,
    items
  };
}

function calculateEstimate(roomsInput) {
  const roomInputs = Array.isArray(roomsInput) ? roomsInput : [roomsInput];
  const rooms = roomInputs.map((roomInput, index) => calculateRoomEstimate(roomInput, index + 1));
  const currency = rooms[0]?.currency || readPricing().currency;
  const total = roundMoney(rooms.reduce((sum, room) => sum + room.total, 0));

  return {
    currency,
    total,
    rooms
  };
}

function formatRoomEstimate(roomEstimate) {
  const lines = [`Кімната ${roomEstimate.roomNumber}:`, ''];

  for (const item of roomEstimate.items) {
    lines.push(`• ${item.label}: ${item.quantity} = ${item.total} ${roomEstimate.currency}`);
  }

  lines.push('');
  lines.push(`Разом по кімнаті: ${roomEstimate.total} ${roomEstimate.currency}`);
  return lines.join('\n');
}

function formatEstimate(estimate) {
  const lines = ['Кошторис по натяжній стелі:', ''];

  for (const room of estimate.rooms) {
    lines.push(`Кімната ${room.roomNumber}: ${room.total} ${room.currency}`);
  }

  lines.push('');
  lines.push(`Загалом по замовленню: ${estimate.total} ${estimate.currency}`);
  return lines.join('\n');
}

function formatDetailedEstimate(estimate) {
  const lines = ['Кошторис по натяжній стелі:', ''];

  for (const room of estimate.rooms) {
    lines.push(`Кімната ${room.roomNumber}:`);
    for (const item of room.items) {
      lines.push(`• ${item.label}: ${item.quantity} = ${item.total} ${estimate.currency}`);
    }
    lines.push(`Підсумок кімнати: ${room.total} ${estimate.currency}`);
    lines.push('');
  }

  lines.push(`Загалом по замовленню: ${estimate.total} ${estimate.currency}`);
  return lines.join('\n');
}

function formatPrices() {
  const pricing = readPricing();
  return [
    `Поточні ціни (${pricing.currency}):`,
    '',
    `Полотно: ${pricing.material.sheetPerSquareMeter} / м2`,
    `Профіль: ${pricing.material.profilePerMeter} / м`,
    `Монтаж стелі: ${pricing.labor.installationPerSquareMeter} / м2`,
    `Додатковий кут після ${pricing.labor.baseCornerIncluded}: ${pricing.labor.extraCorner} / шт`,
    `Точковий світильник: ${pricing.lighting.spotlightInstallation} / шт`,
    `Люстра: ${pricing.lighting.chandelierInstallation} / шт`,
    `LED-підсвітка: ${pricing.lighting.ledStripPerMeter} / м`,
    `Карниз: ${pricing.extras.curtainRailPerMeter} / м`,
    `Обхід труби: ${pricing.extras.pipeBypass} / шт`,
    `Демонтаж: ${pricing.extras.dismantlingPerSquareMeter} / м2`
  ].join('\n');
}

module.exports = {
  calculateRoomEstimate,
  calculateEstimate,
  formatRoomEstimate,
  formatDetailedEstimate,
  formatEstimate,
  formatPrices
};
