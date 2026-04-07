const fs = require('fs');
const path = require('path');
const defaultPricing = require('../config/defaultPricing');

const dataDir = path.join(__dirname, '..', '..', 'data');
const pricingFilePath = path.join(dataDir, 'pricing.json');

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(pricingFilePath)) {
    fs.writeFileSync(
      pricingFilePath,
      JSON.stringify(defaultPricing, null, 2),
      'utf8'
    );
  }
}

function readPricing() {
  ensureDataFile();

  const raw = fs.readFileSync(pricingFilePath, 'utf8');
  return JSON.parse(raw);
}

function writePricing(pricing) {
  ensureDataFile();

  fs.writeFileSync(
    pricingFilePath,
    JSON.stringify(pricing, null, 2),
    'utf8'
  );

  return pricing;
}

function listEditableKeys(pricing = readPricing()) {
  const keys = [];

  for (const [groupKey, groupValue] of Object.entries(pricing)) {
    if (typeof groupValue !== 'object' || groupValue === null || Array.isArray(groupValue)) {
      continue;
    }

    for (const propertyKey of Object.keys(groupValue)) {
      keys.push(`${groupKey}.${propertyKey}`);
    }
  }

  return keys;
}

function updatePrice(pathKey, value) {
  const pricing = readPricing();
  const [groupKey, propertyKey] = pathKey.split('.');

  if (!groupKey || !propertyKey) {
    throw new Error('Невірний шлях. Використовуйте формат category.key');
  }

  if (!pricing[groupKey] || typeof pricing[groupKey] !== 'object') {
    throw new Error(`Категорію ${groupKey} не знайдено.`);
  }

  if (!(propertyKey in pricing[groupKey])) {
    throw new Error(`Поле ${propertyKey} не знайдено в категорії ${groupKey}.`);
  }

  pricing[groupKey][propertyKey] = value;
  writePricing(pricing);

  return pricing;
}

function resetPricing() {
  return writePricing(defaultPricing);
}

module.exports = {
  pricingFilePath,
  readPricing,
  writePricing,
  listEditableKeys,
  updatePrice,
  resetPricing
};
