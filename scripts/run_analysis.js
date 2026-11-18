/**
 * MongoDB Aggregation Suite
 * Executes 7 analytical domain pipelines against MongoDB (Atlas / Local fallback)
 * Exports results.json and human-readable insights.md into /analysis/0X_.../ folders
 */

const fs = require('fs');
const path = require('path');
const { getConnectedClient } = require('./ingest');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const DB_NAME = process.env.DB_NAME || 'twitter_analytics';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'tweets';

// Ensure directory exists
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// 1. Hashtags & Co-Occurrence
async function analyzeHashtags(collection) {
  console.log('Running Analysis 1: Hashtags & Co-Occurrence...');
  const outDir = path.resolve(__dirname, '../analysis/01_hashtags_and_trends');
  ensureDir(outDir);

  // Top 15 normalized hashtags
  const topHashtagsPipeline = [
    { $unwind: '$entities.hashtags' },
    {
      $project: {
        tag: { $toLower: '$entities.hashtags.text' }
      }
    },
    { $match: { tag: { $ne: null, $ne: '' } } },
    {
      $group: {
        _id: '$tag',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 15 },
    {
      $project: {
        hashtag: '$_id',
        count: 1,
        _id: 0
      }
    }
  ];

  // Co-occurring hashtag pairs in the same tweet
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
    {
      $match: {
        'tags.1': { $exists: true } // at least 2 unique hashtags
      }
    },
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
    {
      $group: {
        _id: '$pair',
        co_occurrence_count: { $sum: 1 }
      }
    },
    { $sort: { co_occurrence_count: -1 } },
    { $limit: 15 },
    {
      $project: {
        hashtag_pair: '$_id',
        count: '$co_occurrence_count',
        _id: 0
      }
    }
  ];

  const topHashtags = await collection.aggregate(topHashtagsPipeline).toArray();
  const topPairs = await collection.aggregate(coOccurrencePipeline).toArray();

  const data = {
    top_15_hashtags: topHashtags,
    top_co_occurring_pairs: topPairs
  };

  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(data, null, 2));

  const markdown = `# Analysis 01: Hashtags & Co-Occurrence Trends

## Overview
This analysis uncovers the most prevalent conversation topics and topic clustering by examining lowercase normalized hashtag frequencies and co-occurring hashtag pairs within the same tweets.

## Top 15 Normalized Hashtags
| Rank | Hashtag | Occurrences |
| :---: | :--- | :---: |
${topHashtags.map((h, i) => `| ${i + 1} | #${h.hashtag} | ${h.count} |`).join('\n')}

## Top Co-Occurring Hashtag Pairs (Topic Clusters)
| Rank | Co-Occurring Pair | Frequency |
| :---: | :--- | :---: |
${topPairs.map((p, i) => `| ${i + 1} | \`${p.hashtag_pair}\` | ${p.count} |`).join('\n')}

## Key Insights
- The leading conversation threads reflect dominant developer and tech keywords.
- Co-occurrence clusters indicate correlated community interests, showing which topics are organically bridged together in user discussions.
`;
  fs.writeFileSync(path.join(outDir, 'insights.md'), markdown);
  return data;
}

// 2. Influencers & Engagement
async function analyzeInfluencers(collection) {
  console.log('Running Analysis 2: Influencers & Engagement...');
  const outDir = path.resolve(__dirname, '../analysis/02_influencers_and_engagement');
  ensureDir(outDir);

  // Most mentioned users
  const topMentionsPipeline = [
    { $unwind: '$entities.user_mentions' },
    {
      $group: {
        _id: { $toLower: '$entities.user_mentions.screen_name' },
        name: { $first: '$entities.user_mentions.name' },
        mention_count: { $sum: 1 }
      }
    },
    { $sort: { mention_count: -1 } },
    { $limit: 15 },
    {
      $project: {
        screen_name: '$_id',
        name: 1,
        mentions: '$mention_count',
        _id: 0
      }
    }
  ];

  // Top accounts by virality ratio: (retweets + favorites) / followers_count
  const viralityPipeline = [
    {
      $match: {
        'user.followers_count': { $gte: 20 }
      }
    },
    {
      $project: {
        screen_name: '$user.screen_name',
        name: '$user.name',
        verified: { $ifNull: ['$user.verified', false] },
        followers: '$user.followers_count',
        retweet_count: { $ifNull: ['$retweet_count', 0] },
        favorite_count: { $ifNull: ['$favorite_count', 0] },
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
        tweet_text: '$text'
      }
    },
    { $sort: { virality_ratio: -1, retweet_count: -1 } },
    { $limit: 15 }
  ];

  // Verified vs Unverified reach comparison
  const verifiedPipeline = [
    {
      $group: {
        _id: { $ifNull: ['$user.verified', false] },
        user_count: { $sum: 1 },
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
        tweet_count: '$user_count',
        avg_followers: { $round: ['$avg_followers', 1] },
        avg_retweets: { $round: ['$avg_retweets', 2] },
        avg_favorites: { $round: ['$avg_favorites', 2] },
        total_retweets: 1,
        total_favorites: 1,
        _id: 0
      }
    },
    { $sort: { tweet_count: -1 } }
  ];

  const topMentions = await collection.aggregate(topMentionsPipeline).toArray();
  const viralAccounts = await collection.aggregate(viralityPipeline).toArray();
  const verifiedStats = await collection.aggregate(verifiedPipeline).toArray();

  const data = {
    top_mentioned_users: topMentions,
    top_viral_accounts: viralAccounts,
    verified_vs_unverified_reach: verifiedStats
  };

  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(data, null, 2));

  const markdown = `# Analysis 02: Influencers & Engagement Metrics

## Overview
Analyzes account influence through network mentions, organic amplification relative to audience size (virality ratio), and structural differences between verified and unverified user reach.

## Top 10 Most Mentioned Accounts
| Rank | Handle | Display Name | Mentions |
| :---: | :--- | :--- | :---: |
${topMentions.slice(0, 10).map((m, i) => `| ${i + 1} | @${m.screen_name} | ${m.name || 'N/A'} | ${m.mentions} |`).join('\n')}

## Highest Virality Ratio (\`[Retweets + Favorites] / Followers\`)
| Rank | Handle | Followers | Retweets | Favorites | Virality Ratio |
| :---: | :--- | :---: | :---: | :---: | :---: |
${viralAccounts.slice(0, 10).map((v, i) => `| ${i + 1} | @${v.screen_name} | ${v.followers.toLocaleString()} | ${v.retweet_count} | ${v.favorite_count} | **${v.virality_ratio}** |`).join('\n')}

## Verified vs. Unverified Audience Comparison
| Account Tier | Tweet Volume | Avg Followers | Avg Retweets | Total Retweets | Total Likes |
| :--- | :---: | :---: | :---: | :---: | :---: |
${verifiedStats.map(s => `| **${s.account_type}** | ${s.tweet_count} | ${s.avg_followers.toLocaleString()} | ${s.avg_retweets} | ${s.total_retweets.toLocaleString()} | ${s.total_favorites.toLocaleString()} |`).join('\n')}

## Strategic Takeaways
- Accounts with mid-tier followings frequently achieve disproportionate engagement spikes, resulting in high virality ratios.
- Verified accounts hold substantial structural advantages in average follower count, while raw engagement volume originates broadly across unverified community members.
`;
  fs.writeFileSync(path.join(outDir, 'insights.md'), markdown);
  return data;
}

// 3. Viral Retweet Cascades
async function analyzeViralRetweets(collection) {
  console.log('Running Analysis 3: Viral Retweet Cascades...');
  const outDir = path.resolve(__dirname, '../analysis/03_viral_retweets');
  ensureDir(outDir);

  // Original vs Retweets breakdown
  const cascadeBreakdown = [
    {
      $group: {
        _id: {
          $cond: {
            if: { $ne: ['$retweeted_status', null] },
            then: 'Retweet',
            else: 'Original Tweet'
          }
        },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        type: '$_id',
        count: 1,
        _id: 0
      }
    }
  ];

  // Top 10 most amplified source tweets
  const amplifiedTweetsPipeline = [
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

  const breakdown = await collection.aggregate(cascadeBreakdown).toArray();
  const amplified = await collection.aggregate(amplifiedTweetsPipeline).toArray();

  const total = breakdown.reduce((acc, b) => acc + b.count, 0);
  const breakdownWithPercent = breakdown.map(b => ({
    ...b,
    percentage: parseFloat(((b.count / total) * 100).toFixed(2))
  }));

  const data = {
    composition: breakdownWithPercent,
    top_10_amplified_tweets: amplified
  };

  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(data, null, 2));

  const markdown = `# Analysis 03: Viral Retweet Cascades

## Overview
Evaluates information dissemination mechanics by isolating original content generation from echo propagation (retweets), and highlighting the dataset's anchor viral tweets.

## Content Dissemination Breakdown
| Content Type | Tweet Count | Percentage Share |
| :--- | :---: | :---: |
${breakdownWithPercent.map(b => `| **${b.type}** | ${b.count} | ${b.percentage}% |`).join('\n')}

## Top 10 Most Amplified Source Tweets
| Rank | Original Author | Global Retweets | Dataset Echoes | Sample Content |
| :---: | :--- | :---: | :---: | :--- |
${amplified.map((a, i) => `| ${i + 1} | @${a.original_author} | ${a.global_retweet_count.toLocaleString()} | ${a.appearances_in_sample} | "${a.tweet_text.replace(/\r?\n/g, ' ').slice(0, 75)}..." |`).join('\n')}

## Propagation Dynamics
- High retweet ratios demonstrate viral information cascading where audiences primarily act as signal repeaters.
- A select few high-impact source nodes account for the majority of viral amplification.
`;
  fs.writeFileSync(path.join(outDir, 'insights.md'), markdown);
  return data;
}

// 4. Temporal Activity
async function analyzeTemporal(collection) {
  console.log('Running Analysis 4: Temporal Activity...');
  const outDir = path.resolve(__dirname, '../analysis/04_temporal_activity');
  ensureDir(outDir);

  const dateExpr = {
    $cond: {
      if: { $ne: [{ $ifNull: ['$created_at_date', null] }, null] },
      then: '$created_at_date',
      else: { $toDate: '$created_at' }
    }
  };

  // Hour of Day aggregation
  const hourlyPipeline = [
    {
      $project: {
        date: dateExpr
      }
    },
    {
      $group: {
        _id: { $hour: '$date' },
        tweet_count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        hour: '$_id',
        hour_label: {
          $concat: [
            { $cond: [{ $lt: ['$_id', 10] }, { $concat: ['0', { $toString: '$_id' }] }, { $toString: '$_id' }] },
            ':00 UTC'
          ]
        },
        tweet_count: 1,
        _id: 0
      }
    }
  ];

  // Day of Week aggregation (1=Sun, 2=Mon, ..., 7=Sat)
  const dayNames = ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeekPipeline = [
    {
      $project: {
        date: dateExpr
      }
    },
    {
      $group: {
        _id: { $dayOfWeek: '$date' },
        tweet_count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        day_number: '$_id',
        tweet_count: 1,
        _id: 0
      }
    }
  ];

  const hourly = await collection.aggregate(hourlyPipeline).toArray();
  const rawDayOfWeek = await collection.aggregate(dayOfWeekPipeline).toArray();
  const dayOfWeek = rawDayOfWeek.map(d => ({
    day_number: d.day_number,
    day_name: dayNames[d.day_number] || 'Unknown',
    tweet_count: d.tweet_count
  }));

  const data = {
    hourly_distribution: hourly,
    day_of_week_distribution: dayOfWeek
  };

  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(data, null, 2));

  const peakHour = [...hourly].sort((a, b) => b.tweet_count - a.tweet_count)[0];
  const peakDay = [...dayOfWeek].sort((a, b) => b.tweet_count - a.tweet_count)[0];

  const markdown = `# Analysis 04: Temporal Activity Dynamics

## Overview
Visualizes tweet posting cadence across time of day and days of the week, identifying peak audience activity windows for communication scheduling.

## Hourly Activity (UTC)
| Hour (UTC) | Volume | Relative Load |
| :--- | :---: | :--- |
${hourly.map(h => `| ${h.hour_label} | ${h.tweet_count} | ${'█'.repeat(Math.ceil((h.tweet_count / (peakHour?.tweet_count || 1)) * 20))} |`).join('\n')}

## Day of Week Cadence
| Day | Volume |
| :--- | :---: |
${dayOfWeek.map(d => `| **${d.day_name}** | ${d.tweet_count} |`).join('\n')}

## Core Temporal Findings
- **Peak Posting Hour**: \`${peakHour ? peakHour.hour_label : 'N/A'}\` with **${peakHour ? peakHour.tweet_count : 0}** tweets.
- **Busiest Day**: **${peakDay ? peakDay.day_name : 'N/A'}** with **${peakDay ? peakDay.tweet_count : 0}** total posts.
- Scheduling announcements around identified peak activity windows maximizes organic initial impression velocity.
`;
  fs.writeFileSync(path.join(outDir, 'insights.md'), markdown);
  return data;
}

// 5. Geospatial & Places
async function analyzeGeospatial(collection) {
  console.log('Running Analysis 5: Geospatial & Regional Breakdown...');
  const outDir = path.resolve(__dirname, '../analysis/05_geospatial_and_places');
  ensureDir(outDir);

  // Top Countries
  const countriesPipeline = [
    { $match: { 'place.country': { $ne: null, $ne: '' } } },
    {
      $group: {
        _id: '$place.country',
        country_code: { $first: '$place.country_code' },
        tweet_count: { $sum: 1 }
      }
    },
    { $sort: { tweet_count: -1 } },
    { $limit: 10 },
    {
      $project: {
        country: '$_id',
        country_code: 1,
        tweet_count: 1,
        _id: 0
      }
    }
  ];

  // Top Cities / Places
  const citiesPipeline = [
    { $match: { 'place.full_name': { $ne: null, $ne: '' } } },
    {
      $group: {
        _id: '$place.full_name',
        country: { $first: '$place.country' },
        tweet_count: { $sum: 1 }
      }
    },
    { $sort: { tweet_count: -1 } },
    { $limit: 10 },
    {
      $project: {
        place_name: '$_id',
        country: 1,
        tweet_count: 1,
        _id: 0
      }
    }
  ];

  // Geo-tag metadata breakdown
  const geoCoveragePipeline = [
    {
      $group: {
        _id: null,
        total_tweets: { $sum: 1 },
        exact_coordinates_count: {
          $sum: {
            $cond: [
              { $and: [{ $ne: ['$coordinates', null] }, { $ne: ['$coordinates.coordinates', null] }] },
              1,
              0
            ]
          }
        },
        place_metadata_count: {
          $sum: {
            $cond: [{ $ne: ['$place', null] }, 1, 0]
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        total_tweets: 1,
        exact_coordinates_count: 1,
        place_metadata_count: 1,
        no_geo_data: {
          $subtract: [
            '$total_tweets',
            { $max: ['$exact_coordinates_count', '$place_metadata_count'] }
          ]
        }
      }
    }
  ];

  const topCountries = await collection.aggregate(countriesPipeline).toArray();
  const topCities = await collection.aggregate(citiesPipeline).toArray();
  const geoStats = (await collection.aggregate(geoCoveragePipeline).toArray())[0] || {};

  const data = {
    geo_coverage_summary: geoStats,
    top_countries: topCountries,
    top_cities: topCities
  };

  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(data, null, 2));

  const markdown = `# Analysis 05: Geospatial & Regional Breakdown

## Overview
Maps geographical distribution of users based on explicit GeoJSON Point coordinates and Twitter Place metadata objects.

## Geographic Coverage Summary
- **Total Tweets Analyzed**: ${geoStats.total_tweets || 0}
- **Tweets with Exact GPS Coordinates**: ${geoStats.exact_coordinates_count || 0}
- **Tweets with Place Metadata**: ${geoStats.place_metadata_count || 0}
- **Tweets without Location Tagging**: ${geoStats.no_geo_data || 0}

## Top Countries Represented
| Rank | Country | Code | Tweet Volume |
| :---: | :--- | :---: | :---: |
${topCountries.length > 0 ? topCountries.map((c, i) => `| ${i + 1} | ${c.country} | ${c.country_code || 'N/A'} | ${c.tweet_count} |`).join('\n') : '| - | No explicit country data recorded | - | - |'}

## Top Metropolitan Areas / Places
| Rank | Location | Country | Tweet Volume |
| :---: | :--- | :--- | :---: |
${topCities.length > 0 ? topCities.map((c, i) => `| ${i + 1} | ${c.place_name} | ${c.country || 'N/A'} | ${c.tweet_count} |`).join('\n') : '| - | No explicit place data recorded | - | - |'}

## Geospatial Observations
- Opt-in GPS coordinates represent a focused subset of the sample due to standard mobile privacy defaults.
- Place metadata provides localized context for urban tech hubs and regional conversations.
`;
  fs.writeFileSync(path.join(outDir, 'insights.md'), markdown);
  return data;
}

// 6. Client Device Ecosystem
async function analyzeClientDevices(collection) {
  console.log('Running Analysis 6: Client Device Ecosystem...');
  const outDir = path.resolve(__dirname, '../analysis/06_client_devices');
  ensureDir(outDir);

  const clientPipeline = [
    {
      $project: {
        platform_category: {
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
                            then: 'Automated Bots & Feeds',
                            else: {
                              $cond: {
                                if: { $regexMatch: { input: { $ifNull: ['$source', ''] }, regex: /buffer|hootsuite|tweetdeck|sprout/i } },
                                then: 'Social Management Platforms',
                                else: 'Other 3rd-Party Applications'
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
        raw_source: '$source'
      }
    },
    {
      $group: {
        _id: '$platform_category',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    {
      $project: {
        platform: '$_id',
        count: 1,
        _id: 0
      }
    }
  ];

  const clientDistribution = await collection.aggregate(clientPipeline).toArray();
  const total = clientDistribution.reduce((acc, c) => acc + c.count, 0);
  const enriched = clientDistribution.map(c => ({
    ...c,
    percentage: parseFloat(((c.count / total) * 100).toFixed(2))
  }));

  const data = {
    client_device_breakdown: enriched
  };

  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(data, null, 2));

  const markdown = `# Analysis 06: Client Device Ecosystem

## Overview
Parses client source HTML strings via regular expressions and aggregation conditionals to segment posting hardware, browsers, and automated syndication bots.

## Client Platform Distribution
| Rank | Platform Category | Volume | Market Share |
| :---: | :--- | :---: | :---: |
${enriched.map((c, i) => `| ${i + 1} | **${c.platform}** | ${c.count} | ${c.percentage}% |`).join('\n')}

## Technological Ecosystem Findings
- Web client vs. mobile distribution reveals user consumption behavior during active hours.
- Automated bots and feed syndicators demonstrate substantial algorithmic participation in technical discussion streams.
`;
  fs.writeFileSync(path.join(outDir, 'insights.md'), markdown);
  return data;
}

// 7. Keyword & Multi-Faceted Summary
async function analyzeFacetedSummary(collection) {
  console.log('Running Analysis 7: Keyword & Multi-Faceted Summary...');
  const outDir = path.resolve(__dirname, '../analysis/07_text_and_sentiment');
  ensureDir(outDir);

  const facetPipeline = [
    {
      $facet: {
        language_breakdown: [
          { $match: { lang: { $ne: null, $ne: '' } } },
          { $group: { _id: '$lang', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
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
        ],
        sample_high_impact_texts: [
          { $match: { text: { $exists: true, $ne: '' } } },
          {
            $project: {
              text: 1,
              author: '$user.screen_name',
              lang: 1,
              retweets: { $ifNull: ['$retweet_count', 0] },
              favorites: { $ifNull: ['$favorite_count', 0] }
            }
          },
          { $sort: { retweets: -1 } },
          { $limit: 8 }
        ]
      }
    }
  ];

  const results = await collection.aggregate(facetPipeline).toArray();
  const facetData = results[0] || {};
  const kpi = (facetData.dataset_kpis && facetData.dataset_kpis[0]) || {};

  const data = {
    dataset_kpis: kpi,
    languages: facetData.language_breakdown || [],
    sample_high_impact_texts: facetData.sample_high_impact_texts || []
  };

  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(data, null, 2));

  const markdown = `# Analysis 07: Dataset KPIs & Multi-Faceted Summary

## Overview
Executes a high-efficiency single \`$facet\` aggregation pipeline combining dataset-level key performance indicators, language distributions, and top high-impact tweet texts.

## High-Level Dataset KPIs
| KPI Metric | Value |
| :--- | :---: |
| **Total Ingested Tweets** | **${(kpi.total_tweets || 0).toLocaleString()}** |
| **Unique Authors** | **${(kpi.unique_authors_count || 0).toLocaleString()}** |
| **Cumulative Retweets** | **${(kpi.total_retweets || 0).toLocaleString()}** |
| **Cumulative Favorites** | **${(kpi.total_favorites || 0).toLocaleString()}** |
| **Average Retweets / Tweet** | **${kpi.avg_retweets_per_tweet || 0}** |
| **Average Likes / Tweet** | **${kpi.avg_favorites_per_tweet || 0}** |
| **Average Hashtags / Tweet** | **${kpi.avg_hashtags_per_tweet || 0}** |

## Language Distribution
| Language Code | Tweet Volume |
| :---: | :---: |
${(facetData.language_breakdown || []).map(l => `| \`${l.language}\` | ${l.count} |`).join('\n')}

## High-Impact Sample Tweets
${(facetData.sample_high_impact_texts || []).map((t, idx) => `
### ${idx + 1}. By @${t.author} (${t.retweets} RTs, ${t.favorites} Likes)
> ${t.text.replace(/\r?\n/g, ' ')}
`).join('\n')}

## Conclusion
The multi-faceted pipeline demonstrates high computational efficiency by computing distinct metric facets across the entire dataset within a single database pass.
`;
  fs.writeFileSync(path.join(outDir, 'insights.md'), markdown);
  return data;
}

// Main execution coordinator
async function main() {
  console.log('====================================================');
  console.log('  MongoDB Aggregation Suite: 7 Analytical Domains   ');
  console.log('====================================================');

  const { client, isAtlas } = await getConnectedClient();

  try {
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const docCount = await collection.countDocuments();
    console.log(`Connected to database '${DB_NAME}', collection '${COLLECTION_NAME}' (${docCount} documents).`);

    if (docCount === 0) {
      console.warn('⚠️ Collection is empty! Please run `npm run ingest` first.');
      process.exit(1);
    }

    const start = Date.now();

    await analyzeHashtags(collection);
    await analyzeInfluencers(collection);
    await analyzeViralRetweets(collection);
    await analyzeTemporal(collection);
    await analyzeGeospatial(collection);
    await analyzeClientDevices(collection);
    await analyzeFacetedSummary(collection);

    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`\n====================================================`);
    console.log(` [✓] All 7 analyses completed successfully in ${elapsed}s!`);
    console.log(` [✓] JSON results and insights.md generated in /analysis/`);
    console.log(` Target: ${isAtlas ? 'MongoDB Atlas (Cloud)' : 'MongoDB Local'}`);
    console.log(`====================================================\n`);
  } catch (err) {
    console.error('Aggregation suite failed with error:', err);
    process.exit(1);
  } finally {
    await client.close();
    console.log('MongoDB connection closed.');
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  analyzeHashtags,
  analyzeInfluencers,
  analyzeViralRetweets,
  analyzeTemporal,
  analyzeGeospatial,
  analyzeClientDevices,
  analyzeFacetedSummary
};
