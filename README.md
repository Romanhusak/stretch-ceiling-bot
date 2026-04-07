# Stretch Ceiling Telegram Bot

Telegram bot for calculating the full cost of stretch ceiling services.

## Features

- step-by-step quote flow
- multiple rooms in one quote
- material and labor calculation
- lighting, curtain rail, pipe bypass, extra corners and dismantling
- clear estimate breakdown with totals
- prices stored in a separate config file
- admin menu with inline buttons
- quote history stored in SQLite-compatible format
- Excel export of saved quotes
- admin notifications about new quotes

## Setup

1. Create a bot via BotFather and get a token.
2. Copy `.env.example` to `.env`.
3. Put your bot token into `.env`.
4. Add your Telegram numeric ID to `ADMIN_IDS` if you want access to the admin commands.
5. Install dependencies:

```bash
npm install
```

6. Start the bot:

```bash
npm start
```

## Project structure

- `src/index.js` - bot bootstrap and handlers
- `src/config/defaultPricing.js` - default prices
- `data/pricing.json` - active editable prices
- `data/quotes.sqlite` - saved quote database
- `src/services/calculator.js` - estimate calculation logic
- `src/services/pricingStore.js` - price read/write service
- `src/services/quoteStore.js` - SQLite quote storage and CSV export
- `src/services/sessionStore.js` - in-memory session state
- `src/constants/flow.js` - step order and prompts

## Services included in MVP

- room area
- room perimeter
- room corners
- PVC ceiling sheet
- installation labor
- spotlights
- chandeliers
- LED strip lighting
- curtain rail installation
- pipe bypasses
- extra corners
- old ceiling dismantling
- multiple rooms in one order

## Notes

- Session data is currently stored in memory.
- You can tune prices from Telegram admin commands or directly in `data/pricing.json`.
- Saved quotes are stored in `data/quotes.sqlite`.
- Excel exports are generated inside `data/exports/`.
- After every completed quote, the bot can notify admin IDs from `.env`.

## Admin commands

- `/myid` - show your Telegram user ID
- `/admin` - show available admin commands and editable keys
- `/adminmenu` - open button-based admin menu
- `/setprice category.key value` - update a price value

Inside `/adminmenu` you can:

- edit prices with buttons
- reset prices to defaults
- see quote statistics
- export saved quotes to Excel

Example:

```bash
/setprice material.sheetPerSquareMeter 350
```
