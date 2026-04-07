const { readPricing } = require('./pricingStore');

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function getCanvasRate(pricing, canvasType) {
  const normalized = Number(canvasType);

  if (normalized === 3.2) {
    return pricing.canvas.width320;
  }

  if (normalized === 4) {
    return pricing.canvas.width400;
  }

  if (normalized === 6) {
    return pricing.canvas.width600;
  }

  throw new Error('Unsupported canvas type');
}

function calculateRoomEstimate(input, roomNumber = 1) {
  const pricing = readPricing();
  const area = Number(input.area);
  const canvasType = Number(input.canvasType);
  const profileHMeters = Number(input.profileHMeters);
  const insertStripMeters = Number(input.insertStripMeters);
  const extraCorners = Number(input.extraCorners);
  const spotlights = Number(input.spotlights);
  const chandeliers = Number(input.chandeliers);
  const shadowProfileMeters = Number(input.shadowProfileMeters);
  const noInsertProfileMeters = Number(input.noInsertProfileMeters);
  const floatingProfileMeters = Number(input.floatingProfileMeters);
  const curtainQ7Count = Number(input.curtainQ7Count);
  const curtainQ10Count = Number(input.curtainQ10Count);
  const curtainEndingCount = Number(input.curtainEndingCount);
  const pipeBypasses = Number(input.pipeBypasses);
  const canvasRate = getCanvasRate(pricing, canvasType);

  const materialSheet = area * canvasRate;
  const profileHCost = profileHMeters * pricing.profiles.profileH;
  const insertStripCost = insertStripMeters * pricing.profiles.insertStrip;
  const extraCornerCost = extraCorners * pricing.extras.extraCorner;
  const spotlightCost = spotlights * pricing.lighting.spotlightInstallation;
  const chandelierCost = chandeliers * pricing.lighting.chandelierInstallation;
  const shadowProfileCost = shadowProfileMeters * pricing.profiles.shadowProfile;
  const noInsertProfileCost = noInsertProfileMeters * pricing.profiles.noInsertProfile;
  const floatingProfileCost = floatingProfileMeters * pricing.profiles.floatingProfile;
  const curtainQ7Cost = curtainQ7Count * pricing.curtain.q7;
  const curtainQ10Cost = curtainQ10Count * pricing.curtain.q10;
  const curtainEndingCost = curtainEndingCount * pricing.curtain.ending;
  const pipeBypassCost = pipeBypasses * pricing.extras.pipeBypass;

  const items = [
    { label: `Полотно ${canvasType} м`, quantity: `${area} м2`, total: materialSheet },
    { label: 'Профіль H', quantity: `${profileHMeters} м`, total: profileHCost },
    { label: 'Вставка', quantity: `${insertStripMeters} м`, total: insertStripCost },
    { label: 'Додаткові кути', quantity: `${extraCorners} шт`, total: extraCornerCost },
    { label: 'Точкові світильники', quantity: `${spotlights} шт`, total: spotlightCost },
    { label: 'Люстри', quantity: `${chandeliers} шт`, total: chandelierCost },
    { label: 'Тіньовий профіль', quantity: `${shadowProfileMeters} м`, total: shadowProfileCost },
    { label: 'Безвставочний профіль', quantity: `${noInsertProfileMeters} м`, total: noInsertProfileCost },
    { label: 'Парящий профіль', quantity: `${floatingProfileMeters} м`, total: floatingProfileCost },
    { label: 'Гардина Q7', quantity: `${curtainQ7Count} шт`, total: curtainQ7Cost },
    { label: 'Гардина Q10', quantity: `${curtainQ10Count} шт`, total: curtainQ10Cost },
    { label: 'Закінчення гардини', quantity: `${curtainEndingCount} шт`, total: curtainEndingCost },
    { label: 'Обхід труб', quantity: `${pipeBypasses} шт`, total: pipeBypassCost },
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
    `Полотно 3.20 м: ${pricing.canvas.width320} / м2`,
    `Полотно 4 м: ${pricing.canvas.width400} / м2`,
    `Полотно 6 м: ${pricing.canvas.width600} / м2`,
    `Профіль H: ${pricing.profiles.profileH} / м`,
    `Вставка: ${pricing.profiles.insertStrip} / м`,
    `Додатковий кут: ${pricing.extras.extraCorner} / шт`,
    `Точковий світильник: ${pricing.lighting.spotlightInstallation} / шт`,
    `Люстра: ${pricing.lighting.chandelierInstallation} / шт`,
    `Тіньовий профіль: ${pricing.profiles.shadowProfile} / м`,
    `Безвставочний профіль: ${pricing.profiles.noInsertProfile} / м`,
    `Парящий профіль: ${pricing.profiles.floatingProfile} / м`,
    `Гардина Q7: ${pricing.curtain.q7} / шт`,
    `Гардина Q10: ${pricing.curtain.q10} / шт`,
    `Закінчення гардини: ${pricing.curtain.ending} / шт`,
    `Обхід труби: ${pricing.extras.pipeBypass} / шт`,
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
