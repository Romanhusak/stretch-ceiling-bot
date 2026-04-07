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
          answers_json TEXT NOT NULL,
          items_json TEXT NOT NULL,
          total REAL NOT NULL,
          currency TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);

      await persistDatabase(db);
      return db;
    })();
  }

  return dbPromise;
}

async function saveQuote({ chatId, user, answers, estimate }) {
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
        answers_json,
        items_json,
        total,
        currency,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      String(chatId),
      user?.id ? String(user.id) : null,
      user?.username || null,
      user?.first_name || null,
      user?.last_name || null,
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
    SELECT id, total, currency, created_at, first_name, username
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
    SELECT id, created_at, first_name, last_name, username, user_id, chat_id, total, currency, answers_json, items_json
    FROM quotes
    ORDER BY id DESC
  `));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const exportPath = path.join(exportsDir, `quotes-export-${timestamp}.xlsx`);

  const sheetRows = rows.map((row) => {
    const answers = JSON.parse(row.answers_json || '{}');
    const rooms = Array.isArray(answers.rooms) ? answers.rooms : [];
    return {
      id: row.id,
      created_at: row.created_at,
      first_name: row.first_name,
      last_name: row.last_name,
      username: row.username,
      user_id: row.user_id,
      chat_id: row.chat_id,
      rooms_count: rooms.length,
      total: row.total,
      currency: row.currency,
      rooms_json: JSON.stringify(rooms)
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
