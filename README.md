# Twitter Data Ingestion, MongoDB Aggregation Suite & Interactive Analytics Dashboard

An end-to-end Twitter analytics engine featuring automated Extended JSON ingestion, MongoDB performance indexing, advanced aggregation pipelines across 7 analytical domains, a high-throughput Express.js REST API, and an interactive dark-mode React dashboard connected live to **MongoDB Atlas**.

---

## 🏗️ Architecture & Project Structure

```
project CA2/
├── .env                                  # Environment variables (MONGODB_URI, DB, Collection, Port)
├── .gitignore                            # Ignores .env, node_modules, build artifacts
├── package.json                          # Root dependencies (mongodb, dotenv, express, cors)
├── scripts/
│   ├── ingest.js                         # Ingestion script: Extended JSON cleaning, upsert, and indexing
│   ├── run_analysis.js                   # Node.js runner for 7 analytical pipelines (generates JSON & Markdown)
│   └── queries.mongosh.js                # Pure mongosh JavaScript aggregation script
├── analysis/                             # Exported analytical results and executive reports
│   ├── 01_hashtags_and_trends/           # results.json & insights.md
│   ├── 02_influencers_and_engagement/    # results.json & insights.md
│   ├── 03_viral_retweets/                # results.json & insights.md
│   ├── 04_temporal_activity/             # results.json & insights.md
│   ├── 05_geospatial_and_places/         # results.json & insights.md
│   ├── 06_client_devices/                # results.json & insights.md
│   └── 07_text_and_sentiment/            # results.json & insights.md
├── backend/
│   └── server.js                         # Express.js REST API serving live Atlas aggregations & $text search
└── dashboard/                            # React + Vite + Tailwind CSS + Recharts analytics UI
    ├── src/
    │   ├── App.jsx                       # Interactive dark-mode dashboard with charts & search
    │   ├── main.jsx
    │   └── index.css
    ├── vite.config.js
    └── package.json
```

---

## ⚡ Quickstart Commands

### 1. Ingest Data & Build Indexes into MongoDB Atlas
```bash
npm run ingest
# or
node scripts/ingest.js
```
- Locates `tweets.json` recursively (handles UTF-16LE / UTF-8 BOM encoding).
- Cleans MongoDB Extended JSON (`$oid`, `$date`, `$numberDouble`, etc.).
- Performs bulk upsert into `twitter_analytics.tweets`.
- Builds 4 indexes:
  1. Multikey Index: `entities.hashtags.text: 1`
  2. Compound Index: `user.screen_name: 1, user.followers_count: -1`
  3. Full-Text Index: `text: "text"`
  4. Geospatial Index: `coordinates: "2dsphere"` (sparse)

### 2. Run the 7 Aggregation Pipelines
```bash
npm run analyze
# or
node scripts/run_analysis.js
```
Executes all 7 analytical domains against MongoDB Atlas and populates `/analysis/0X_.../` with `results.json` and `insights.md`.

To run via pure `mongosh`:
```bash
mongosh "<your MongoDB URI>" scripts/queries.mongosh.js
```

### 3. Start the Express API & Dashboard Server
```bash
npm run server
# or
node backend/server.js
```
- **Live REST API & Dashboard**: `http://localhost:5000`

For local Vite hot-reload frontend development:
```bash
cd dashboard
npm run dev
# Running on http://localhost:3000 (proxies /api to :5000)
```

---

## 📊 The 7 Analytical Domains

1. **Hashtags & Co-Occurrence (`01_hashtags_and_trends`)**:
   - Top 15 normalized hashtags (`$unwind`, `$toLower`, `$group`).
   - Top co-occurring hashtag pairs within identical tweets.
2. **Influencers & Engagement (`02_influencers_and_engagement`)**:
   - Most mentioned accounts (`@entities.user_mentions`).
   - Virality ratio ranking: `(retweets + favorites) / followers_count`.
   - Verified vs. Unverified account audience comparison.
3. **Viral Retweet Cascades (`03_viral_retweets`)**:
   - Original content vs. echo retweets ratio.
   - Top 10 most amplified source tweets (`retweeted_status.id_str`).
4. **Temporal Activity (`04_temporal_activity`)**:
   - Tweet cadence across 24 hours of the day (UTC).
   - Tweet volume by Day of the Week.
5. **Geospatial & Places (`05_geospatial_and_places`)**:
   - Top countries (`place.country`) and metropolitan areas (`place.full_name`).
   - Geo-tagging and GPS coordinates metadata breakdown.
6. **Client Device Ecosystem (`06_client_devices`)**:
   - Parsed HTML source origins (iPhone, Android, Web Client, Automated Bots, Syndication feeds).
7. **Keyword & Multi-Faceted Summary (`07_text_and_sentiment`)**:
   - Unified `$facet` pipeline computing language breakdown, high-impact tweets, and dataset-wide KPIs (total tweets, unique authors, cumulative retweets/favorites, tag density).

---

## 🔍 Live MongoDB `$text` Search Endpoint

Query live tweets ranked by MongoDB's relevance text score:
```
GET /api/search?q=javascript
GET /api/search?q=nodejs
GET /api/search?q=barcelona
```
Projected metadata includes author credentials, verified badges, timestamp, retweet/like counts, hashtags, and `score: { $meta: "textScore" }`.
