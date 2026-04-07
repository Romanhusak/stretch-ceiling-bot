const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const XLSX = require('xlsx');

const dataDir = path.join(__dirname, '..', '..', 'data');
const exportsDir = path.join(dataDir, 'exports');
const dbFilePath = path.join(dataDir, 'quotes.sqlite');

let sqlPromise;
let dbPromise;

function ensureDirectories() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }
}

async function getSql() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs();
  }

  return sqlPromise;
}

async function persistDatabase(db) {
  ensureDirectories();
  const data = db.export();
  fs.writeFileSync(dbFilePath, Buffer.from(data));
}

function mapResultRows(result) {
  if (!result.length) {
    return [];
  }

  const [first] = result;
  return first.values.map((row) => Object.fromEntries(
    first.columns.map((column, index) => [column, row[index]])
  ));
}

async function getDatabase() {
  ensureDirectories();

  if (!dbPromise) {
    dbPromise = (async () => {
      const SQL = await getSql();
      const dbBuffer = fs.existsSync(dbFilePath)
        ? fs.readFileSync(dbFilePath)
        : null;
      const db = dbBuffer ? new SQL.Database(dbBuffer) : new SQL.Database();

      db.run(`
        CREATE TABLE IF NOT EXISTS quotes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id TEXT NOT NULL,
          user_id TEXT,
          username TEXT,
          first_name TEXT,
          last_name TEXT,
          phone_number TEXT,
          answers_json TEXT NOT NULL,
          items_json TEXT NOT NULL,
          total REAL NOT NULL,
          currency TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);

      const columns = mapResultRows(db.exec('PRAGMA table_info(quotes)'));
      const hasPhoneNumber = columns.some((column) => column.name === 'phone_number');
      if (!hasPhoneNumber) {
        db.run('ALTER TABLE quotes ADD COLUMN phone_number TEXT');
      }

      await persistDatabase(db);
      return db;
    })();
  }

  return dbPromise;
}

async function saveQuote({ chatId, user, phoneNumber, answers, estimate }) {
  const db = await getDatabase();
  const createdAt = new Date().toISOString();

  db.run(
    `
      INSERT INTO quotes (
        chat_id,
        user_id,
        username,
        first_name,
        last_name,
        phone_number,
        answers_json,
        items_json,
        total,
        currency,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      String(chatId),
      user?.id ? String(user.id) : null,
      user?.username || null,
      user?.first_name || null,
      user?.last_name || null,
      phoneNumber || null,
      JSON.stringify(answers),
      JSON.stringify(estimate.rooms),
      estimate.total,
      estimate.currency,
      createdAt
    ]
  );

  const rows = mapResultRows(db.exec('SELECT last_insert_rowid() AS id'));
  await persistDatabase(db);
  return rows[0]?.id || null;
}

async function getQuoteStats() {
  const db = await getDatabase();
  const rows = mapResultRows(db.exec(`
    SELECT COUNT(*) AS totalQuotes, COALESCE(SUM(total), 0) AS totalRevenue
    FROM quotes
  `));

  return rows[0] || { totalQuotes: 0, totalRevenue: 0 };
}

async function getLatestQuotes(limit = 5) {
  const db = await getDatabase();
  return mapResultRows(db.exec(`
    SELECT id, total, currency, created_at, first_name, username, phone_number
    FROM quotes
    ORDER BY id DESC
    LIMIT ${Number(limit)}
  `));
}

function escapeCsv(value) {
  const stringValue = String(value ?? '');
  return `"${stringValue.replace(/"/g, '""')}"`;
}

async function exportQuotesToCsv() {
  ensureDirectories();
  const db = await getDatabase();
  const rows = mapResultRows(db.exec(`
    SELECT id, created_at, first_name, last_name, username, user_id, chat_id, total, currency, answers_json
    FROM quotes
    ORDER BY id DESC
  `));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const exportPath = path.join(exportsDir, `quotes-export-${timestamp}.csv`);
  const header = [
    'id',
    'created_at',
    'first_name',
    'last_name',
    'username',
    'user_id',
    'chat_id',
    'total',
    'currency',
    'answers_json'
  ];

  const csvLines = [header.join(',')];

  for (const row of rows) {
    csvLines.push([
      escapeCsv(row.id),
      escapeCsv(row.created_at),
      escapeCsv(row.first_name),
      escapeCsv(row.last_name),
      escapeCsv(row.username),
      escapeCsv(row.user_id),
      escapeCsv(row.chat_id),
      escapeCsv(row.total),
      escapeCsv(row.currency),
      escapeCsv(row.answers_json)
    ].join(','));
  }

  fs.writeFileSync(exportPath, csvLines.join('\n'), 'utf8');
  return exportPath;
}

async function exportQuotesToXlsx() {
  ensureDirectories();
  const db = await getDatabase();
  const rows = mapResultRows(db.exec(`
    SELECT id, created_at, first_name, last_name, username, user_id, chat_id, phone_number, total, currency, answers_json, items_json
    FROM quotes
    ORDER BY id DESC
  `));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const exportPath = path.join(exportsDir, `quotes-export-${timestamp}.xlsx`);

  const sheetRows = rows.map((row) => {
    const answers = JSON.parse(row.answers_json || '{}');
    const rooms = Array.isArray(answers.rooms) ? answers.rooms : [];
    return {
      'ID заявки': row.id,
      'Дата': row.created_at,
      "Ім'я": row.first_name || '',
      'Прізвище': row.last_name || '',
      'Username': row.username || '',
      'Телефон': row.phone_number || '',
      'Telegram ID': row.user_id || '',
      'Chat ID': row.chat_id || '',
      'Кількість кімнат': rooms.length,
      'Сума': row.total,
      'Валюта': row.currency,
      'Кімнати': rooms.map((room, index) => {
        const canvasType = room.canvasType ? `${room.canvasType} м` : 'невідомо';
        return `Кімната ${index + 1}: ${room.area || 0} м2, полотно ${canvasType}`;
      }).join(' | ')
    };
  });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Quotes');
  XLSX.writeFile(workbook, exportPath);

  return exportPath;
}

module.exports = {
  dbFilePath,
  saveQuote,
  getQuoteStats,
  getLatestQuotes,
  exportQuotesToCsv,
  exportQuotesToXlsx
};
