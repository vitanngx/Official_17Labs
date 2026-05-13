# Official 17 Labs Portfolio App

<img width="2824" height="1317" alt="image" src="https://github.com/user-attachments/assets/bcb7d2ff-a928-4319-8986-5ae0634f4fec" />


This is the combination of all features that I created in two projects: **17 Labs** and **Portfolio Tracker**.

The app connects strategy optimization with real portfolio tracking. It helps users define an optimized asset allocation, compare it with their actual holdings, and monitor portfolio risk over time.

## Features

- Strategy optimizer powered by the 17 Labs Python bridge
- Efficient Frontier simulation
- Target portfolio weights with allocation constraints
- Portfolio transaction ledger
- Multi-currency holdings support
- Live quote and FX lookup with SQLite caching
- Current vs optimized allocation comparison
- Rebalance delta calculation
- Performance and risk monitoring:
  - Current Volatility
  - Max Drawdown
  - Sharpe Ratio
  - Health Score
- Light mode and dark mode

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- SQLite
- Python
- yfinance / Yahoo Finance market data
- Recharts

## Run Locally

Install JavaScript dependencies:

```bash
npm install
```

Install Python dependencies:

```bash
python3 -m pip install -r requirements.txt
```

Start the development server:

```bash
npm run dev
```

Open the app:

```text
http://localhost:3000
```

## Optional: Fast Python Optimizer

For better optimization speed, run the Python optimizer as a long-running API service:

```bash
npm run optimizer
```

In another terminal, start Next.js with:

```bash
OPTIMIZER_API_URL=http://127.0.0.1:8008 npm run dev
```

When `OPTIMIZER_API_URL` is set, Next.js calls the FastAPI optimizer over HTTP instead of spawning a new Python process for every optimization request.

## Useful Commands

Run TypeScript checks:

```bash
npm run typecheck
```

Create a production build:

```bash
npm run build
```

## Notes

The local SQLite database is created automatically in the `data/` directory. This directory is ignored by git so local portfolio data is not committed.
