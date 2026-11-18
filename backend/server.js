/**
 * Express REST API Server
 * Serves live aggregation pipelines and text search from MongoDB Atlas (with local fallback)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'twitter_analytics';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'tweets';

app.use(cors());
app.use(express.json());

let dbClient = null;
let db = null;
let tweetsCollection = null;
let connectionTarget = 'Disconnected';

// Connect to MongoDB
async function initDb() {
  console.log(`Connecting to MongoDB for API server...`);
  try {
    const client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });
    await client.connect();
    dbClient = client;
    db = client.db(DB_NAME);
    tweetsCollection = db.collection(COLLECTION_NAME);
    connectionTarget = 'MongoDB Atlas (Cloud)';
    console.log(`[✓] API Server connected to ${connectionTarget}`);
  } catch (atlasErr) {
    console.warn(`[!] Atlas connection failed (${atlasErr.message}).`);
    console.warn(`[!] NOTE: Check Atlas Network Access IP whitelist. Falling back to local MongoDB...`);
    try {
      const localClient = new MongoClient('mongodb://127.0.0.1:27017', {
        serverSelectionTimeoutMS: 3000
      });
      await localClient.connect();
      dbClient = localClient;
      db = localClient.db(DB_NAME);
      tweetsCollection = db.collection(COLLECTION_NAME);
      connectionTarget = 'MongoDB Local Fallback (localhost:27017)';
      console.log(`[✓] API Server connected to ${connectionTarget}`);
    } catch (localErr) {
      console.error(`[CRITICAL] Failed to connect to local MongoDB as well:`, localErr.message);
    }
  }
}

// Middleware to verify DB is ready
app.use((req, res, next) => {
  if (!tweetsCollection) {
    return res.status(503).json({
      error: 'Database connection not ready. Please try again in a few moments.'
    });
  }
  next();
});

// 0. Health & Status
app.get('/api/health', async (req, res) => {
  try {
    const count = await tweetsCollection.countDocuments();
    res.json({
      status: 'online',
      target: connectionTarget,
      database: DB_NAME,
      collection: COLLECTION_NAME,
      total_tweets: count,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1. Hashtags & Co-Occurrence (Analysis 1)
app.get('/api/hashtags', async (req, res) => {
  try {
    const topHashtagsPipeline = [
      { $unwind: '$entities.hashtags' },
      { $project: { tag: { $toLower: '$entities.hashtags.text' } } },
      { $match: { tag: { $ne: null, $ne: '' } } },
      { $group: { _id: '$tag', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
      { $project: { hashtag: '$_id', count: 1, _id: 0 } }
    ];

    const coOccurrencePipeline = [
      {
        $project: {
          tags: {
            $setUnion: {
              $map: {
                input: { $ifNull: ['$entities.hashtags', []] },
                as: 'h',
                in: { $toLower: '$$h.text' }
              }
            }
          }
        }
      },
      { $match: { 'tags.1': { $exists: true } } },
      {
        $project: {
          pairs: {
            $reduce: {
              input: { $range: [0, { $subtract: [{ $size: '$tags' }, 1] }] },
              initialValue: [],
              in: {
                $concatArrays: [
                  '$$value',
                  {
                    $map: {
                      input: { $range: [{ $add: ['$$this', 1] }, { $size: '$tags' }] },
                      as: 'j',
                      in: [
                        { $arrayElemAt: ['$tags', '$$this'] },
                        { $arrayElemAt: ['$tags', '$$j'] }
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      },
      { $unwind: '$pairs' },
      {
        $project: {
          pair: {
            $cond: {
              if: { $lt: [{ $arrayElemAt: ['$pairs', 0] }, { $arrayElemAt: ['$pairs', 1] }] },
              then: { $concat: ['#', { $arrayElemAt: ['$pairs', 0] }, ' + #', { $arrayElemAt: ['$pairs', 1] }] },
              else: { $concat: ['#', { $arrayElemAt: ['$pairs', 1] }, ' + #', { $arrayElemAt: ['$pairs', 0] }] }
            }
          }
        }
      },
      { $group: { _id: '$pair', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 12 },
      { $project: { hashtag_pair: '$_id', count: 1, _id: 0 } }
    ];

    const [topHashtags, topPairs] = await Promise.all([
      tweetsCollection.aggregate(topHashtagsPipeline).toArray(),
      tweetsCollection.aggregate(coOccurrencePipeline).toArray()
    ]);

    res.json({ top_hashtags: topHashtags, top_pairs: topPairs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Influencers & Engagement (Analysis 2)
app.get('/api/influencers', async (req, res) => {
  try {
    const topMentionsPipeline = [
      { $unwind: '$entities.user_mentions' },
      {
        $group: {
          _id: { $toLower: '$entities.user_mentions.screen_name' },
          name: { $first: '$entities.user_mentions.name' },
          mentions: { $sum: 1 }
        }
      },
      { $sort: { mentions: -1 } },
      { $limit: 10 },
      { $project: { screen_name: '$_id', name: 1, mentions: 1, _id: 0 } }
    ];

    const viralityPipeline = [
      { $match: { 'user.followers_count': { $gte: 20 } } },
      {
        $project: {
          screen_name: '$user.screen_name',
          name: '$user.name',
          verified: { $ifNull: ['$user.verified', false] },
          followers: '$user.followers_count',
          retweets: { $ifNull: ['$retweet_count', 0] },
          favorites: { $ifNull: ['$favorite_count', 0] },
          virality_ratio: {
            $round: [
              {
                $divide: [
                  { $add: [{ $ifNull: ['$retweet_count', 0] }, { $ifNull: ['$favorite_count', 0] }] },
                  { $max: ['$user.followers_count', 1] }
                ]
              },
              4
            ]
          },
          text: '$text'
        }
      },
      { $sort: { virality_ratio: -1, retweets: -1 } },
      { $limit: 10 }
    ];

    const verifiedPipeline = [
      {
        $group: {
          _id: { $ifNull: ['$user.verified', false] },
          count: { $sum: 1 },
          avg_followers: { $avg: '$user.followers_count' },
          avg_retweets: { $avg: '$retweet_count' },
          avg_favorites: { $avg: '$favorite_count' },
          total_retweets: { $sum: '$retweet_count' },
          total_favorites: { $sum: '$favorite_count' }
        }
      },
      {
        $project: {
          account_type: { $cond: { if: '$_id', then: 'Verified', else: 'Unverified' } },
          count: 1,
          avg_followers: { $round: ['$avg_followers', 1] },
          avg_retweets: { $round: ['$avg_retweets', 2] },
          avg_favorites: { $round: ['$avg_favorites', 2] },
          total_retweets: 1,
          total_favorites: 1,
          _id: 0
        }
      }
    ];

    const [mentions, virality, verifiedStats] = await Promise.all([
      tweetsCollection.aggregate(topMentionsPipeline).toArray(),
      tweetsCollection.aggregate(viralityPipeline).toArray(),
      tweetsCollection.aggregate(verifiedPipeline).toArray()
    ]);

    res.json({
      top_mentions: mentions,
      viral_accounts: virality,
      verified_comparison: verifiedStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Viral Retweet Cascades (Analysis 3)
app.get('/api/viral', async (req, res) => {
  try {
    const compositionPipeline = [
      {
        $group: {
          _id: {
            $cond: {
              if: { $ne: ['$retweeted_status', null] },
              then: 'Retweets',
              else: 'Original Tweets'
            }
          },
          count: { $sum: 1 }
        }
      },
      { $project: { type: '$_id', count: 1, _id: 0 } }
    ];

    const amplifiedPipeline = [
      { $match: { retweeted_status: { $ne: null } } },
      {
        $group: {
          _id: '$retweeted_status.id_str',
          original_author: { $first: '$retweeted_status.user.screen_name' },
          author_name: { $first: '$retweeted_status.user.name' },
          tweet_text: { $first: '$retweeted_status.text' },
          global_retweet_count: { $max: '$retweeted_status.retweet_count' },
          global_favorite_count: { $max: '$retweeted_status.favorite_count' },
          appearances_in_sample: { $sum: 1 }
        }
      },
      { $sort: { global_retweet_count: -1, appearances_in_sample: -1 } },
      { $limit: 10 },
      {
        $project: {
          tweet_id: '$_id',
          original_author: 1,
          author_name: 1,
          tweet_text: 1,
          global_retweet_count: 1,
          global_favorite_count: 1,
          appearances_in_sample: 1,
          _id: 0
        }
      }
    ];

    const [composition, amplified] = await Promise.all([
      tweetsCollection.aggregate(compositionPipeline).toArray(),
      tweetsCollection.aggregate(amplifiedPipeline).toArray()
    ]);

    res.json({ composition, top_amplified: amplified });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Temporal Activity (Analysis 4)
app.get('/api/temporal', async (req, res) => {
  try {
    const dateExpr = {
      $cond: {
        if: { $ne: [{ $ifNull: ['$created_at_date', null] }, null] },
        then: '$created_at_date',
        else: { $toDate: '$created_at' }
      }
    };

    const hourlyPipeline = [
      { $project: { date: dateExpr } },
      { $group: { _id: { $hour: '$date' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      {
        $project: {
          hour: '$_id',
          hour_label: {
            $concat: [
              { $cond: [{ $lt: ['$_id', 10] }, { $concat: ['0', { $toString: '$_id' }] }, { $toString: '$_id' }] },
              ':00'
            ]
          },
          count: 1,
          _id: 0
        }
      }
    ];

    const dayNames = ['', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayPipeline = [
      { $project: { date: dateExpr } },
      { $group: { _id: { $dayOfWeek: '$date' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      {
        $project: {
          day_index: '$_id',
          count: 1,
          _id: 0
        }
      }
    ];

    const [hourly, rawDays] = await Promise.all([
      tweetsCollection.aggregate(hourlyPipeline).toArray(),
      tweetsCollection.aggregate(dayPipeline).toArray()
    ]);

    const days = rawDays.map(d => ({
      day_index: d.day_index,
      day: dayNames[d.day_index] || 'Day ' + d.day_index,
      count: d.count
    }));

    res.json({ hourly, days });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Geospatial & Regional Breakdown (Analysis 5)
app.get('/api/geospatial', async (req, res) => {
  try {
    const countriesPipeline = [
      { $match: { 'place.country': { $ne: null, $ne: '' } } },
      {
        $group: {
          _id: '$place.country',
          code: { $first: '$place.country_code' },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 8 },
      { $project: { country: '$_id', code: 1, count: 1, _id: 0 } }
    ];

    const citiesPipeline = [
      { $match: { 'place.full_name': { $ne: null, $ne: '' } } },
      {
        $group: {
          _id: '$place.full_name',
          country: { $first: '$place.country' },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 8 },
      { $project: { city: '$_id', country: 1, count: 1, _id: 0 } }
    ];

    const geoStatsPipeline = [
      {
        $group: {
          _id: null,
          total_tweets: { $sum: 1 },
          with_exact_coords: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$coordinates', null] }, { $ne: ['$coordinates.coordinates', null] }] },
                1,
                0
              ]
            }
          },
          with_place_meta: {
            $sum: { $cond: [{ $ne: ['$place', null] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          _id: 0,
          total_tweets: 1,
          with_exact_coords: 1,
          with_place_meta: 1,
          untagged: {
            $subtract: [
              '$total_tweets',
              { $max: ['$with_exact_coords', '$with_place_meta'] }
            ]
          }
        }
      }
    ];

    const [countries, cities, rawStats] = await Promise.all([
      tweetsCollection.aggregate(countriesPipeline).toArray(),
      tweetsCollection.aggregate(citiesPipeline).toArray(),
      tweetsCollection.aggregate(geoStatsPipeline).toArray()
    ]);

    res.json({
      countries,
      cities,
      stats: rawStats[0] || { total_tweets: 0, with_exact_coords: 0, with_place_meta: 0, untagged: 0 }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Client Devices (Analysis 6)
app.get('/api/clients', async (req, res) => {
  try {
    const clientPipeline = [
      {
        $project: {
          platform: {
            $cond: {
              if: { $regexMatch: { input: { $ifNull: ['$source', ''] }, regex: /iphone/i } },
              then: 'iPhone',
              else: {
                $cond: {
                  if: { $regexMatch: { input: { $ifNull: ['$source', ''] }, regex: /android/i } },
                  then: 'Android',
                  else: {
                    $cond: {
                      if: { $regexMatch: { input: { $ifNull: ['$source', ''] }, regex: /web|browser/i } },
                      then: 'Web Client',
                      else: {
                        $cond: {
                          if: { $regexMatch: { input: { $ifNull: ['$source', ''] }, regex: /ipad/i } },
                          then: 'iPad',
                          else: {
                            $cond: {
                              if: { $regexMatch: { input: { $ifNull: ['$source', ''] }, regex: /bot|feed|rss|dlvr|rightrelevance|mean magazine/i } },
                              then: 'Automated Bot / RSS',
                              else: '3rd-Party & Tools'
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      { $group: { _id: '$platform', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { platform: '$_id', count: 1, _id: 0 } }
    ];

    const rawClients = await tweetsCollection.aggregate(clientPipeline).toArray();
    const total = rawClients.reduce((acc, c) => acc + c.count, 0);
    const clients = rawClients.map(c => ({
      ...c,
      percentage: total > 0 ? parseFloat(((c.count / total) * 100).toFixed(2)) : 0
    }));

    res.json({ clients, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Multi-Faceted Summary & Overview (Analysis 7)
app.get('/api/overview', async (req, res) => {
  try {
    const facetPipeline = [
      {
        $facet: {
          languages: [
            { $match: { lang: { $ne: null, $ne: '' } } },
            { $group: { _id: '$lang', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 8 },
            { $project: { language: '$_id', count: 1, _id: 0 } }
          ],
          dataset_kpis: [
            {
              $group: {
                _id: null,
                total_tweets: { $sum: 1 },
                unique_authors: { $addToSet: '$user.screen_name' },
                total_retweets: { $sum: { $ifNull: ['$retweet_count', 0] } },
                total_favorites: { $sum: { $ifNull: ['$favorite_count', 0] } },
                total_hashtags: {
                  $sum: { $size: { $ifNull: ['$entities.hashtags', []] } }
                }
              }
            },
            {
              $project: {
                _id: 0,
                total_tweets: 1,
                unique_authors_count: { $size: '$unique_authors' },
                total_retweets: 1,
                total_favorites: 1,
                avg_retweets_per_tweet: {
                  $round: [{ $divide: ['$total_retweets', '$total_tweets'] }, 2]
                },
                avg_favorites_per_tweet: {
                  $round: [{ $divide: ['$total_favorites', '$total_tweets'] }, 2]
                },
                avg_hashtags_per_tweet: {
                  $round: [{ $divide: ['$total_hashtags', '$total_tweets'] }, 2]
                }
              }
            }
          ]
        }
      }
    ];

    const facetRes = await tweetsCollection.aggregate(facetPipeline).toArray();
    const data = facetRes[0] || {};
    res.json({
      kpis: (data.dataset_kpis && data.dataset_kpis[0]) || {},
      languages: data.languages || [],
      connection_target: connectionTarget
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Live Text Search powered by MongoDB $text index
app.get('/api/search', async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 15, 50);

    let tweets = [];
    if (query) {
      // Text search with relevance scoring
      tweets = await tweetsCollection
        .find(
          { $text: { $search: query } },
          {
            projection: {
              score: { $meta: 'textScore' },
              text: 1,
              user: 1,
              created_at: 1,
              retweet_count: 1,
              favorite_count: 1,
              source: 1,
              'entities.hashtags': 1
            }
          }
        )
        .sort({ score: { $meta: 'textScore' }, retweet_count: -1 })
        .limit(limit)
        .toArray();
    } else {
      // Fallback: top retweeted recent tweets
      tweets = await tweetsCollection
        .find(
          {},
          {
            projection: {
              text: 1,
              user: 1,
              created_at: 1,
              retweet_count: 1,
              favorite_count: 1,
              source: 1,
              'entities.hashtags': 1
            }
          }
        )
        .sort({ retweet_count: -1, favorite_count: -1 })
        .limit(limit)
        .toArray();
    }

    const formatted = tweets.map(t => ({
      id: t._id,
      score: t.score ? parseFloat(t.score.toFixed(3)) : null,
      text: t.text,
      screen_name: t.user ? t.user.screen_name : 'unknown',
      name: t.user ? t.user.name : 'Unknown User',
      verified: t.user ? !!t.user.verified : false,
      followers: t.user ? t.user.followers_count : 0,
      avatar: (t.user && t.user.profile_image_url_https) || '',
      created_at: t.created_at,
      retweets: t.retweet_count || 0,
      favorites: t.favorite_count || 0,
      hashtags: (t.entities && t.entities.hashtags) ? t.entities.hashtags.map(h => h.text) : []
    }));

    res.json({
      query,
      count: formatted.length,
      results: formatted
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend static build if available
const distPath = path.resolve(__dirname, '../dashboard/dist');
if (require('fs').existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

// Start server
async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  Twitter Analytics REST API is listening on :${PORT} `);
    console.log(`  Target: ${connectionTarget}`);
    console.log(`  Endpoints:`);
    console.log(`   - GET /api/health`);
    console.log(`   - GET /api/overview`);
    console.log(`   - GET /api/hashtags`);
    console.log(`   - GET /api/influencers`);
    console.log(`   - GET /api/viral`);
    console.log(`   - GET /api/temporal`);
    console.log(`   - GET /api/geospatial`);
    console.log(`   - GET /api/clients`);
    console.log(`   - GET /api/search?q=...`);
    console.log(`====================================================`);
  });
}

if (require.main === module) {
  start();
}

module.exports = { app, initDb };
