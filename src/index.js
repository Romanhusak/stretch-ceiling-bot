require('dotenv').config();

const { Input, Markup, Telegraf } = require('telegraf');
const { steps, helpText } = require('./constants/flow');
const {
  calculateEstimate,
  calculateRoomEstimate,
  formatDetailedEstimate,
  formatPrices,
  formatRoomEstimate
} = require('./services/calculator');
const { listEditableKeys, pricingFilePath, readPricing, resetPricing, updatePrice } = require('./services/pricingStore');
const { dbFilePath, exportQuotesToXlsx, getLatestQuotes, getQuoteStats, saveQuote } = require('./services/quoteStore');
const { getSession, resetSession, clearSession } = require('./services/sessionStore');

const token = process.env.BOT_TOKEN;
const adminIds = new Set(
  String(process.env.ADMIN_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

if (!token) {
  throw new Error('BOT_TOKEN is missing. Create a .env file based on .env.example.');
}

const bot = new Telegraf(token);

function normalizeNumber(text) {
  return Number(String(text).trim().replace(',', '.'));
}

function isValidPositiveNumber(value) {
  return Number.isFinite(value) && value >= 0;
}

function normalizePhoneNumber(text) {
  return String(text || '').trim().replace(/[^\d+]/g, '');
}

function isValidPhoneNumber(text) {
  const normalized = normalizePhoneNumber(text);
  return /^\+?\d{10,15}$/.test(normalized);
}

function buildStepPrompt(step, roomNumber) {
  return `Кімната ${roomNumber}\nКрок: ${step.label}\n${step.prompt}`;
}

function resetCalculationState(session) {
  session.active = false;
  session.stepIndex = 0;
  session.answers = {};
  session.rooms = [];
  session.currentRoomNumber = 1;
  session.phoneNumber = null;
  session.mode = 'idle';
  session.adminEditKey = null;
}

function isAdmin(ctx) {
  return adminIds.has(String(ctx.from?.id || ''));
}

function formatKeyLabel(key) {
  const labels = {
    'canvas.width320': 'Полотно 3.20 м',
    'canvas.width400': 'Полотно 4 м',
    'canvas.width600': 'Полотно 6 м',
    'profiles.profileH': 'Профіль H',
    'profiles.insertStrip': 'Вставка',
    'profiles.shadowProfile': 'Тіньовий профіль',
    'profiles.noInsertProfile': 'Безвставочний профіль',
    'profiles.floatingProfile': 'Парящий профіль',
    'lighting.spotlightInstallation': 'Точковий світильник',
    'lighting.chandelierInstallation': 'Люстра',
    'curtain.q7': 'Гардина Q7',
    'curtain.q10': 'Гардина Q10',
    'curtain.ending': 'Закінчення гардини',
    'extras.extraCorner': 'Додатковий кут',
    'extras.pipeBypass': 'Обхід труби',
  };

  return labels[key] || key;
}

function buildAdminHelp() {
  return [
    'Адмін-команди:',
    '/admin - показати цю довідку',
    '/adminmenu - відкрити меню кнопок',
    '/prices - поточний прайс',
    '/setprice category.key value - змінити значення',
    '',
    'Доступні ключі:',
    ...listEditableKeys(readPricing()).map((key) => `- ${key}`),
    '',
    `Файл з цінами: ${pricingFilePath}`,
    `База заявок: ${dbFilePath}`
  ].join('\n');
}

function buildAdminMainKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Змінити ціни', 'admin:edit_prices'),
      Markup.button.callback('Поточні ціни', 'admin:show_prices')
    ],
    [
      Markup.button.callback('Excel експорт', 'admin:export_xlsx'),
      Markup.button.callback('Статистика', 'admin:stats')
    ],
    [
      Markup.button.callback('Скинути ціни', 'admin:reset_prices')
    ]
  ]);
}

function buildCategoryListKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Матеріали', 'admin:category:material'),
      Markup.button.callback('Роботи', 'admin:category:labor')
    ],
    [
      Markup.button.callback('Освітлення', 'admin:category:lighting'),
      Markup.button.callback('Додатково', 'admin:category:extras')
    ],
    [
      Markup.button.callback('Назад', 'admin:back')
    ]
  ]);
}

function buildCategoryKeyboard(categoryKey) {
  const pricing = readPricing();
  const rows = Object.entries(pricing[categoryKey]).map(([propertyKey, value]) => ([
    Markup.button.callback(
      `${formatKeyLabel(`${categoryKey}.${propertyKey}`)}: ${value}`,
      `admin:edit:${categoryKey}.${propertyKey}`
    )
  ]));

  rows.push([Markup.button.callback('Назад', 'admin:back')]);
  return Markup.inlineKeyboard(rows);
}

function buildRoomCompleteKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Додати ще кімнату', 'calc:add_room'),
      Markup.button.callback('Завершити', 'calc:finish')
    ]
  ]);
}

function buildPhoneRequestKeyboard() {
  return Markup.keyboard([
    [Markup.button.contactRequest('Поділитися номером')],
    ['Пропустити']
  ]).resize();
}

async function showAdminMenu(ctx, text = 'Адмін-меню. Оберіть дію.') {
  if ('editMessageText' in ctx && ctx.callbackQuery?.message) {
    await ctx.editMessageText(text, buildAdminMainKeyboard());
    return;
  }

  await ctx.reply(text, buildAdminMainKeyboard());
}

async function buildStatsMessage() {
  const stats = await getQuoteStats();
  const latest = await getLatestQuotes(5);
  const lines = [
    'Статистика заявок:',
    `Всього прорахунків: ${stats.totalQuotes}`,
    `Сума всіх прорахунків: ${stats.totalRevenue}`,
    ''
  ];

  if (!latest.length) {
    lines.push('Поки що збережених заявок немає.');
    return lines.join('\n');
  }

  lines.push('Останні 5 заявок:');

  for (const quote of latest) {
    const customerName = quote.first_name || quote.username || 'Без імені';
    const phone = quote.phone_number || 'не вказано';
    lines.push(`- #${quote.id} ${customerName}, тел: ${phone}, ${quote.total} ${quote.currency} (${quote.created_at})`);
  }

  return lines.join('\n');
}

async function notifyAdminsAboutQuote(ctx, estimate, rooms) {
  if (!adminIds.size) {
    return;
  }

  const customer = [
    ctx.from?.first_name,
    ctx.from?.last_name
  ].filter(Boolean).join(' ') || ctx.from?.username || 'Без імені';
  const lines = [
    'Нове замовлення на прорахунок.',
    `Клієнт: ${customer}`,
    `Username: ${ctx.from?.username ? `@${ctx.from.username}` : 'немає'}`,
    `Telegram ID: ${ctx.from?.id || 'невідомо'}`,
    `Телефон: ${ctx.sessionPhoneNumber || 'не вказано'}`,
    `Кімнат: ${rooms.length}`,
    `Сума: ${estimate.total} ${estimate.currency}`
  ];

  for (const adminId of adminIds) {
    try {
      await bot.telegram.sendMessage(adminId, lines.join('\n'));
    } catch (error) {
      console.error(`Failed to notify admin ${adminId}:`, error.message);
    }
  }
}

async function askCurrentStep(ctx, session) {
  const currentStep = steps[session.stepIndex];
  await ctx.reply(buildStepPrompt(currentStep, session.currentRoomNumber));
}

async function startCalculation(ctx) {
  const session = resetSession(ctx.chat.id);
  session.mode = 'phone_request';
  session.currentRoomNumber = 1;

  await ctx.reply(
    [
      'Починаємо новий розрахунок.',
      'Спочатку надішліть номер телефону або натисніть "Пропустити".'
    ].join('\n')
    ,
    buildPhoneRequestKeyboard()
  );
}

async function finalizeCalculation(ctx, session) {
  const estimate = calculateEstimate(session.rooms);
  ctx.sessionPhoneNumber = session.phoneNumber;
  await saveQuote({
    chatId: ctx.chat.id,
    user: ctx.from,
    phoneNumber: session.phoneNumber,
    answers: { rooms: session.rooms },
    estimate
  });

  await ctx.reply(formatDetailedEstimate(estimate));
  await notifyAdminsAboutQuote(ctx, estimate, session.rooms);
  clearSession(ctx.chat.id);
}

async function completeCurrentRoom(ctx, session) {
  const roomInput = { ...session.answers };
  session.rooms.push(roomInput);
  const roomEstimate = calculateRoomEstimate(roomInput, session.currentRoomNumber);

  session.mode = 'room_complete';
  session.active = false;
  session.answers = {};
  session.stepIndex = 0;

  await ctx.reply(
    [
      formatRoomEstimate(roomEstimate),
      '',
      'Бажаєте додати ще одну кімнату чи завершити замовлення?'
    ].join('\n'),
    buildRoomCompleteKeyboard()
  );
}

async function startNextRoom(ctx, session) {
  session.currentRoomNumber = session.rooms.length + 1;
  session.stepIndex = 0;
  session.answers = {};
  session.active = true;
  session.mode = 'calculator';

  await ctx.reply(`Переходимо до кімнати ${session.currentRoomNumber}.`);
  await askCurrentStep(ctx, session);
}

async function beginRoomQuestions(ctx, session) {
  session.active = true;
  session.mode = 'calculator';
  await ctx.reply(
    [
      'Надсилайте тільки числа. Десяткові можна вводити через крапку або кому.',
      '',
      buildStepPrompt(steps[0], session.currentRoomNumber)
    ].join('\n'),
    Markup.removeKeyboard()
  );
}

bot.start(async (ctx) => {
  await ctx.reply(
    [
      'Вітаю. Я бот для розрахунку вартості натяжних стель.',
      'Я допоможу швидко порахувати матеріали, монтаж, освітлення та додаткові роботи.',
      '',
      'Напишіть /calc щоб почати новий розрахунок.'
    ].join('\n')
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(helpText);
});

bot.command('prices', async (ctx) => {
  await ctx.reply(formatPrices());
});

bot.command('myid', async (ctx) => {
  await ctx.reply(`Ваш Telegram ID: ${ctx.from.id}`);
});

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.reply('У вас немає доступу до адмінки.');
    return;
  }

  await ctx.reply(buildAdminHelp());
});

bot.command('adminmenu', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.reply('У вас немає доступу до адмінки.');
    return;
  }

  await showAdminMenu(ctx);
});

bot.command('setprice', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.reply('У вас немає доступу до цієї команди.');
    return;
  }

  const parts = ctx.message.text.trim().split(/\s+/);

  if (parts.length < 3) {
    await ctx.reply('Використовуйте формат: /setprice category.key value');
    return;
  }

  const pathKey = parts[1];
  const value = normalizeNumber(parts[2]);

  if (!isValidPositiveNumber(value)) {
    await ctx.reply('Значення ціни має бути числом 0 або більше.');
    return;
  }

  try {
    updatePrice(pathKey, value);
    await ctx.reply(`Ціну оновлено:\n${pathKey} = ${value}`);
  } catch (error) {
    await ctx.reply(error.message);
  }
});

bot.command('calc', async (ctx) => {
  await startCalculation(ctx);
});

bot.command('cancel', async (ctx) => {
  const session = getSession(ctx.chat.id);
  resetCalculationState(session);
  await ctx.reply('Поточний розрахунок скасовано.');
});

bot.action(/^admin:category:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Немає доступу');
    return;
  }

  const categoryKey = ctx.match[1];
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `Категорія: ${categoryKey}\nОберіть значення для редагування.`,
    buildCategoryKeyboard(categoryKey)
  );
});

bot.action('admin:edit_prices', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Немає доступу');
    return;
  }

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    'Оберіть категорію цін для редагування.',
    buildCategoryListKeyboard()
  );
});

bot.action('admin:back', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Немає доступу');
    return;
  }

  await ctx.answerCbQuery();
  await showAdminMenu(ctx);
});

bot.action('admin:show_prices', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Немає доступу');
    return;
  }

  await ctx.answerCbQuery();
  await ctx.reply(formatPrices());
});

bot.action('admin:reset_prices', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Немає доступу');
    return;
  }

  resetPricing();
  await ctx.answerCbQuery('Ціни скинуто');
  await showAdminMenu(ctx, 'Ціни скинуто до стандартних значень.');
});

bot.action('admin:stats', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Немає доступу');
    return;
  }

  await ctx.answerCbQuery();
  await ctx.reply(await buildStatsMessage());
});

bot.action('admin:export_xlsx', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Немає доступу');
    return;
  }

  const exportPath = await exportQuotesToXlsx();
  await ctx.answerCbQuery('Excel готовий');
  await ctx.replyWithDocument(Input.fromLocalFile(exportPath));
});

bot.action(/^admin:edit:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Немає доступу');
    return;
  }

  const session = getSession(ctx.chat.id);
  const key = ctx.match[1];
  const pricing = readPricing();
  const [categoryKey, propertyKey] = key.split('.');
  const currentValue = pricing[categoryKey]?.[propertyKey];

  session.mode = 'admin_edit';
  session.adminEditKey = key;
  session.active = false;

  await ctx.answerCbQuery();
  await ctx.reply(
    [
      `Редагування: ${formatKeyLabel(key)}`,
      `Поточне значення: ${currentValue}`,
      'Надішліть нове число одним повідомленням.',
      'Щоб скасувати, використайте /cancel'
    ].join('\n')
  );
});

bot.action('calc:add_room', async (ctx) => {
  const session = getSession(ctx.chat.id);

  if (session.mode !== 'room_complete') {
    await ctx.answerCbQuery('Немає активної кімнати');
    return;
  }

  await ctx.answerCbQuery();
  await startNextRoom(ctx, session);
});

bot.action('calc:finish', async (ctx) => {
  const session = getSession(ctx.chat.id);

  if (session.mode !== 'room_complete' || !session.rooms.length) {
    await ctx.answerCbQuery('Немає даних для завершення');
    return;
  }

  await ctx.answerCbQuery();
  await finalizeCalculation(ctx, session);
});

bot.on('contact', async (ctx) => {
  const session = getSession(ctx.chat.id);

  if (session.mode !== 'phone_request') {
    return;
  }

  session.phoneNumber = ctx.message.contact.phone_number || null;
  await beginRoomQuestions(ctx, session);
});

bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) {
    return;
  }

  const session = getSession(ctx.chat.id);

  if (session.mode === 'admin_edit') {
    if (!isAdmin(ctx)) {
      await ctx.reply('У вас немає доступу до адмінки.');
      return;
    }

    const value = normalizeNumber(ctx.message.text);

    if (!isValidPositiveNumber(value)) {
      await ctx.reply('Нове значення має бути числом 0 або більше. Спробуйте ще раз.');
      return;
    }

    try {
      const key = session.adminEditKey;
      updatePrice(key, value);
      session.mode = 'idle';
      session.adminEditKey = null;
      await ctx.reply(`Ціну оновлено:\n${formatKeyLabel(key)} = ${value}`);
      await showAdminMenu(ctx, 'Значення збережено. Можна редагувати далі.');
    } catch (error) {
      await ctx.reply(error.message);
    }

    return;
  }

  if (session.mode === 'phone_request') {
    const text = ctx.message.text.trim();
    if (text.toLowerCase() === 'пропустити') {
      session.phoneNumber = null;
      await beginRoomQuestions(ctx, session);
      return;
    }

    if (!isValidPhoneNumber(text)) {
      await ctx.reply('Надішліть коректний номер телефону, поділіться контактом або натисніть "Пропустити".');
      return;
    }

    session.phoneNumber = normalizePhoneNumber(text);
    await beginRoomQuestions(ctx, session);
    return;
  }

  if (session.mode === 'room_complete') {
    await ctx.reply('Натисніть кнопку: додати ще кімнату або завершити замовлення.');
    return;
  }

  if (!session.active) {
    await ctx.reply('Щоб почати розрахунок, напишіть /calc.');
    return;
  }

  const currentStep = steps[session.stepIndex];
  let value = normalizeNumber(ctx.message.text);

  if (currentStep.key === 'canvasType') {
    const canvasValue = Number(String(ctx.message.text).trim().replace(',', '.'));
    if (![3.2, 4, 6].includes(canvasValue)) {
      await ctx.reply('Тип полотна може бути тільки 3.2, 4 або 6.');
      return;
    }
    value = canvasValue;
  }

  if (!isValidPositiveNumber(value)) {
    await ctx.reply(`Не вдалося розпізнати число.\n${buildStepPrompt(currentStep, session.currentRoomNumber)}`);
    return;
  }

  session.answers[currentStep.key] = value;
  session.stepIndex += 1;

  if (session.stepIndex < steps.length) {
    await askCurrentStep(ctx, session);
    return;
  }

  await completeCurrentRoom(ctx, session);
});

bot.catch((error) => {
  console.error('Bot error:', error);
});

bot.launch().then(() => {
  console.log('Stretch ceiling bot is running.');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
