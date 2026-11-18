/**
 * Pure mongosh JavaScript Aggregation Script
 * Run inside mongosh:
 *   mongosh "mongodb+srv://.../twitter_analytics" scripts/queries.mongosh.js
 * or on local MongoDB:
 *   mongosh twitter_analytics scripts/queries.mongosh.js
 */

print("========================================================");
print("     MongoDB Shell (mongosh) Twitter Aggregation Suite   ");
print("========================================================");

const collection = db.tweets;
print(`Total documents in collection: ${collection.countDocuments()}`);

// ---------------------------------------------------------
// 1. Hashtags & Co-Occurrence Trends
// ---------------------------------------------------------
print("\n>>> Analysis 01: Top 15 Normalized Hashtags");
const topHashtags = collection.aggregate([
  { $unwind: "$entities.hashtags" },
  { $project: { tag: { $toLower: "$entities.hashtags.text" } } },
  { $match: { tag: { $ne: null, $ne: "" } } },
  { $group: { _id: "$tag", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 15 }
]).toArray();
printjson(topHashtags);

print("\n>>> Analysis 01b: Top Co-Occurring Hashtag Pairs in Same Tweet");
const hashtagPairs = collection.aggregate([
  {
    $project: {
      tags: {
        $setUnion: {
          $map: {
            input: { $ifNull: ["$entities.hashtags", []] },
            as: "h",
            in: { $toLower: "$$h.text" }
          }
        }
      }
    }
  },
  { $match: { "tags.1": { $exists: true } } },
  {
    $project: {
      pairs: {
        $reduce: {
          input: { $range: [0, { $subtract: [{ $size: "$tags" }, 1] }] },
          initialValue: [],
          in: {
            $concatArrays: [
              "$$value",
              {
                $map: {
                  input: { $range: [{ $add: ["$$this", 1] }, { $size: "$tags" }] },
                  as: "j",
                  in: [
                    { $arrayElemAt: ["$tags", "$$this"] },
                    { $arrayElemAt: ["$tags", "$$j"] }
                  ]
                }
              }
            ]
          }
        }
      }
    }
  },
  { $unwind: "$pairs" },
  {
    $project: {
      pair: {
        $cond: {
          if: { $lt: [{ $arrayElemAt: ["$pairs", 0] }, { $arrayElemAt: ["$pairs", 1] }] },
          then: { $concat: ["#", { $arrayElemAt: ["$pairs", 0] }, " + #", { $arrayElemAt: ["$pairs", 1] }] },
          else: { $concat: ["#", { $arrayElemAt: ["$pairs", 1] }, " + #", { $arrayElemAt: ["$pairs", 0] }] }
        }
      }
    }
  },
  { $group: { _id: "$pair", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 10 }
]).toArray();
printjson(hashtagPairs);

// ---------------------------------------------------------
// 2. Influencers & Engagement
// ---------------------------------------------------------
print("\n>>> Analysis 02: Most Mentioned Users");
const topMentions = collection.aggregate([
  { $unwind: "$entities.user_mentions" },
  {
    $group: {
      _id: { $toLower: "$entities.user_mentions.screen_name" },
      name: { $first: "$entities.user_mentions.name" },
      mentions: { $sum: 1 }
    }
  },
  { $sort: { mentions: -1 } },
  { $limit: 10 }
]).toArray();
printjson(topMentions);

print("\n>>> Analysis 02b: Top Accounts by Virality Ratio");
const virality = collection.aggregate([
  { $match: { "user.followers_count": { $gte: 20 } } },
  {
    $project: {
      screen_name: "$user.screen_name",
      followers: "$user.followers_count",
      retweets: "$retweet_count",
      favorites: "$favorite_count",
      virality_ratio: {
        $round: [
          {
            $divide: [
              { $add: [{ $ifNull: ["$retweet_count", 0] }, { $ifNull: ["$favorite_count", 0] }] },
              { $max: ["$user.followers_count", 1] }
            ]
          },
          4
        ]
      }
    }
  },
  { $sort: { virality_ratio: -1 } },
  { $limit: 10 }
]).toArray();
printjson(virality);

// ---------------------------------------------------------
// 3. Viral Retweet Cascades
// ---------------------------------------------------------
print("\n>>> Analysis 03: Original Tweets vs. Retweets Breakdown");
const retweetBreakdown = collection.aggregate([
  {
    $group: {
      _id: {
        $cond: {
          if: { $ne: ["$retweeted_status", null] },
          then: "Retweet",
          else: "Original Tweet"
        }
      },
      count: { $sum: 1 }
    }
  }
]).toArray();
printjson(retweetBreakdown);

// ---------------------------------------------------------
// 4. Temporal Activity (Hour of Day & Day of Week)
// ---------------------------------------------------------
print("\n>>> Analysis 04: Tweet Volume by Hour of Day (UTC)");
const hourlyVolume = collection.aggregate([
  {
    $project: {
      hour: {
        $hour: {
          $cond: {
            if: { $ne: [{ $ifNull: ["$created_at_date", null] }, null] },
            then: "$created_at_date",
            else: { $toDate: "$created_at" }
          }
        }
      }
    }
  },
  { $group: { _id: "$hour", tweets: { $sum: 1 } } },
  { $sort: { _id: 1 } }
]).toArray();
printjson(hourlyVolume);

// ---------------------------------------------------------
// 5. Geospatial & Regional Breakdown
// ---------------------------------------------------------
print("\n>>> Analysis 05: Geographic Metadata Coverage");
const geoStats = collection.aggregate([
  {
    $group: {
      _id: null,
      total_tweets: { $sum: 1 },
      with_coordinates: {
        $sum: {
          $cond: [{ $and: [{ $ne: ["$coordinates", null] }, { $ne: ["$coordinates.coordinates", null] }] }, 1, 0]
        }
      },
      with_place: {
        $sum: { $cond: [{ $ne: ["$place", null] }, 1, 0] }
      }
    }
  }
]).toArray();
printjson(geoStats);

// ---------------------------------------------------------
// 6. Client Device Ecosystem
// ---------------------------------------------------------
print("\n>>> Analysis 06: Client Device Ecosystem Distribution");
const clients = collection.aggregate([
  {
    $project: {
      platform: {
        $cond: {
          if: { $regexMatch: { input: { $ifNull: ["$source", ""] }, regex: /iphone/i } },
          then: "iPhone",
          else: {
            $cond: {
              if: { $regexMatch: { input: { $ifNull: ["$source", ""] }, regex: /android/i } },
              then: "Android",
              else: {
                $cond: {
                  if: { $regexMatch: { input: { $ifNull: ["$source", ""] }, regex: /web|browser/i } },
                  then: "Web Client",
                  else: "3rd-Party App / Bot"
                }
              }
            }
          }
        }
      }
    }
  },
  { $group: { _id: "$platform", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]).toArray();
printjson(clients);

// ---------------------------------------------------------
// 7. Keyword & Multi-Faceted Summary ($facet)
// ---------------------------------------------------------
print("\n>>> Analysis 07: Dataset KPIs & Language Multi-Faceted Summary ($facet)");
const facetSummary = collection.aggregate([
  {
    $facet: {
      languages: [
        { $group: { _id: "$lang", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ],
      dataset_kpis: [
        {
          $group: {
            _id: null,
            total_tweets: { $sum: 1 },
            unique_authors: { $addToSet: "$user.screen_name" },
            total_retweets: { $sum: { $ifNull: ["$retweet_count", 0] } }
          }
        },
        {
          $project: {
            total_tweets: 1,
            unique_authors_count: { $size: "$unique_authors" },
            total_retweets: 1
          }
        }
      ]
    }
  }
]).toArray();
printjson(facetSummary);

print("\n========================================================");
print("     All 7 Aggregation Queries Completed Successfully!   ");
print("========================================================");
