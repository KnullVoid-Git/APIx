# APIx — National Airfare Price Index

> **Smart India Hackathon 2026 · Problem Statement 26056 · Ministry of Statistics and Programme Implementation (MoSPI) / Data Informatics and Innovation Division (DIID)**

APIx is an end-to-end software platform that scrapes domestic airfare data from airline and OTA endpoints, normalizes and cleans the data using statistical outlier fences (Tukey IQR), computes an automated twice-daily Laspeyres-style Airfare Price Index weighted by DGCA passenger-traffic volume, and exposes the index via a financial-terminal-style dashboard and public REST API to augment the **"Transport and Communication"** sub-group of India's official Consumer Price Index (CPI).

---

## 🌐 Live Demo & Deployments

- **Live Production Terminal**: **[https://ap-ix.vercel.app](https://ap-ix.vercel.app)**
- **Live REST API Base**: **[https://ap-ix.vercel.app/api](https://ap-ix.vercel.app/api)**
- **Interactive API Documentation**: **[https://ap-ix.vercel.app/api-docs](https://ap-ix.vercel.app/api-docs)**

---

## 🛫 Key Capabilities

- **Ethical Scraping Safeguards**: Automated, rate-limited (3–7s randomized jitter delay to keep server load minimal), transparent User-Agent identification (`APIx-PriceIndex-Bot/1.0`), and strict RFC 9309 robots.txt path validation across active sources (EaseMyTrip, Cleartrip, Akasa Air). Audited portals with search-route bot disallows (Ixigo, Goibibo, Yatra, MakeMyTrip, IndiGo) are bypassed for direct scraping, with carrier inventories represented via compliant OTA aggregators (EaseMyTrip/Cleartrip) without breaching crawler boundaries. Air India direct scraping is excluded due to edge firewall connection termination (`net::ERR_HTTP2_PROTOCOL_ERROR`); Air India and Air India Express fares are represented in the index via compliant OTA aggregators (EaseMyTrip, Cleartrip) where available; OTA-listed fares may differ from airline-direct pricing due to aggregator markups, and coverage is partial rather than exhaustive.
- **Data Cleaning & Anomaly Detection**: Enforces mandatory `fare_class` metadata (`Economy` / `Premium Economy` / `Business`), base fare and GST tax separation, composite deduplication, and Tukey IQR statistical outlier tagging.
- **Laspeyres Index Engine**: Aggregates quotes across 5 booking windows ($T+1, T+7, T+15, T+30, T+45$) weighted by official DGCA route volume shares with Jan 2026 base period normalization ($100.00 = ₹5,280$). Ingests the single latest cleaned snapshot per date run to prevent artificial record inflation.
- **Institutional Terminal Dashboard**: High-frequency Solari Split-Flap board with mechanical flip audio, 30D/90D/365D trend line chart, departure route heatmap, advance-purchase elasticity curves, and dedicated read-only Sample Fare Inspector for raw quote transparency.
- **Empirical DGCA Ground-Truth Validation**: Live daily observations dynamically accumulating toward multi-month Pearson $r$ correlation validation against official DGCA reference benchmark circulars (with initial illustrative templates clearly labelled pending published government sourcing).
- **Open REST API**: High-frequency read-only endpoints (`/api/index`, `/api/routes`, `/api/fares`, `/api/latest`) supporting `fare_class` filtering with built-in rate limiting (60 req/min) and interactive documentation at `/api-docs`.

---

## 🛠️ Tech Stack & Architecture

- **Framework**: Next.js 15 (App Router, React 19, TypeScript)
- **Styling**: Tailwind CSS v3 with custom Airport/Financial Terminal design system
- **Data Storage & Pipeline Architecture**: Production index computations and historical time-series run directly on structured, immutable flat files under `data/` (`data/snapshots/`, `data/cleaned/`, `data/index/daily/`, `data/index/time_series.csv`). This provides zero-dependency runtime reliability, complete transparency, and auditable Git-backed data versioning.
- **Convex Backend (Optional/Provisioned)**: Convex DB schemas and client providers are fully configured in the repository as an optional backend for future multi-client state synchronization, while live production reads operate directly from verified flat-file snapshots.
- **Scraping & ETL**: Playwright, TypeScript, Robots-Parser, tsx
- **Scheduled Ingestion**: GitHub Actions automated cron workflow running twice daily (00:00 IST and 05:30 IST).

---

## 🚀 Quick Start (Local Development)

### 1. Installation

```bash
npm install
```

### 2. Run the Data Pipeline

```bash
# 1. Scrape raw airfares from airline & OTA endpoints
npm run scrape

# 2. Clean, deduplicate & tag Tukey IQR outliers
npm run clean

# 3. Compute DGCA Laspeyres Index, rollups & lead-time elasticity
npm run compute-index

# 4. Run automated unit test suite (Deduplication, Tukey IQR, Laspeyres math)
npm test
```

### 3. Launch the Terminal Dashboard

```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 📡 Public REST API Endpoints

**Base URL:** `https://ap-ix.vercel.app` (production) or `http://localhost:3000` (local development)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/index?frequency=daily&from=YYYY-MM-DD&to=YYYY-MM-DD` | Query APIx index time series with base normalization |
| `GET` | `/api/routes?active_only=true` | Query 16 DGCA route corridors with traffic volume weights |
| `GET` | `/api/fares?route_id=DEL-BOM&booking_window=T+1` | Query clean non-outlier flight quotes with base/tax breakdown and `fare_class` |
| `GET` | `/api/latest` | Query latest index snapshot with full corridor telemetry |
| `GET` | `/api/cron/scrape` | Automated scheduled scraping & Laspeyres re-computation endpoint |

Interactive API documentation is accessible at **[https://ap-ix.vercel.app/api-docs](https://ap-ix.vercel.app/api-docs)** (production) or **[http://localhost:3000/api-docs](http://localhost:3000/api-docs)** (local development).

---

## 📊 DGCA Route Basket & Passenger Volume Weights (16 Corridors · 86.8% National Volume Coverage)

The basket captures both high-density primary trunk routes and lower-density tier-2/regional corridors to reflect realistic dynamic price volatility across supply-constrained markets:

| Corridor | Route | Corridor Type | DGCA Volume Weight ($w_r$) |
| :--- | :--- | :--- | :--- |
| **DEL-BOM** | Delhi $\to$ Mumbai | Primary Trunk | $15.5\%$ |
| **BOM-DEL** | Mumbai $\to$ Delhi | Primary Trunk | $14.5\%$ |
| **DEL-BLR** | Delhi $\to$ Bengaluru | Tech Corridor | $9.5\%$ |
| **BLR-DEL** | Bengaluru $\to$ Delhi | Tech Corridor | $9.0\%$ |
| **BOM-BLR** | Mumbai $\to$ Bengaluru | Metro Link | $7.8\%$ |
| **BLR-BOM** | Bengaluru $\to$ Mumbai | Metro Link | $7.5\%$ |
| **DEL-CCU** | Delhi $\to$ Kolkata | Eastern Trunk | $5.8\%$ |
| **CCU-DEL** | Kolkata $\to$ Delhi | Eastern Trunk | $5.5\%$ |
| **BLR-HYD** | Bengaluru $\to$ Hyderabad | Southern Hub | $4.0\%$ |
| **MAA-DEL** | Chennai $\to$ Delhi | Southern Trunk | $3.4\%$ |
| **DEL-GAU** | Delhi $\to$ Guwahati | North-East Tier-2 Trunk | $3.5\%$ |
| **BOM-GOI** | Mumbai $\to$ Goa | Leisure & Regional Tier-2 | $3.2\%$ |
| **DEL-PAT** | Delhi $\to$ Patna | High-Density Tier-2 Link | $3.8\%$ |
| **BLR-COK** | Bengaluru $\to$ Kochi | Southern Regional Tier-2 | $2.8\%$ |
| **DEL-IXC** | Delhi $\to$ Chandigarh | Northern Short-Haul Regional | $2.2\%$ |
| **BOM-PNQ** | Mumbai $\to$ Pune | Western Short-Haul Feeder | $2.0\%$ |

---

## 🏛️ License

Designed for Ministry of Statistics and Programme Implementation (MoSPI) / DIID · SIH 2026.
