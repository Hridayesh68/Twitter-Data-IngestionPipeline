/**
 * Ingestion and Indexing Script for Twitter Dataset
 * Connects to MongoDB Atlas using MONGODB_URI from .env
 * Ingests cleaned Twitter documents and creates performance indexes.
 */

const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'twitter_analytics';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'tweets';

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI is not defined in .env file!');
  process.exit(1);
}

// 1. Recursive file finder for tweets.json
function findTweetsFile(startDir) {
  const candidateNames = ['tweets.json'];
  const commonPaths = [
    path.join(startDir, 'tweets.json'),
    path.join(startDir, 'mongodb-json-files', 'datasets', 'dump', 'twitter', 'tweets.json'),
    path.join(startDir, 'datasets', 'dump', 'twitter', 'tweets.json')
  ];

  for (const cp of commonPaths) {
    if (fs.existsSync(cp)) {
      return cp;
    }
  }

  function searchDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (['node_modules', '.git', 'dist', 'build', '.gemini'].includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = searchDir(fullPath);
        if (found) return found;
      } else if (candidateNames.includes(entry.name.toLowerCase())) {
        return fullPath;
      }
    }
    return null;
  }

  return searchDir(startDir);
}

// 2. Read file with BOM/encoding detection
function readFileAutoEncoding(filePath) {
  const buf = Buffer.alloc(4);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);

  let encoding = 'utf8';
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    encoding = 'utf16le';
  } else if (buf[0] === 0xfe && buf[1] === 0xff) {
    encoding = 'utf16be';
  }

  console.log(`Detected file encoding for ${path.basename(filePath)}: ${encoding}`);
  const raw = fs.readFileSync(filePath, encoding);
  return raw.replace(/^\uFEFF/, '');
}

// 3. Clean MongoDB Extended JSON recursively
function cleanExtendedJson(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (obj.$oid && typeof obj.$oid === 'string') {
    try {
      return new ObjectId(obj.$oid);
    } catch {
      return obj.$oid;
    }
  }

  if (obj.$numberDouble !== undefined) {
    return parseFloat(obj.$numberDouble);
  }

  if (obj.$numberLong !== undefined) {
    const val = Number(obj.$numberLong);
    return Number.isSafeInteger(val) ? val : obj.$numberLong;
  }

  if (obj.$numberInt !== undefined) {
    return parseInt(obj.$numberInt, 10);
  }

  if (obj.$date !== undefined) {
    if (typeof obj.$date === 'object' && obj.$date.$numberLong !== undefined) {
      return new Date(parseInt(obj.$date.$numberLong, 10));
    }
    return new Date(obj.$date);
  }

  if (Array.isArray(obj)) {
    return obj.map(cleanExtendedJson);
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    cleaned[key] = cleanExtendedJson(value);
  }

  // Ensure coordinates GeoJSON compatibility for 2dsphere index
  if (cleaned.coordinates && typeof cleaned.coordinates === 'object') {
    if (cleaned.coordinates.type === 'Point' && Array.isArray(cleaned.coordinates.coordinates)) {
      const [lon, lat] = cleaned.coordinates.coordinates;
      if (typeof lon === 'number' && typeof lat === 'number' && !isNaN(lon) && !isNaN(lat)) {
        cleaned.coordinates = {
          type: 'Point',
          coordinates: [lon, lat]
        };
      } else {
        cleaned.coordinates = null;
      }
    } else {
      cleaned.coordinates = null;
    }
  }

  // Attach parsed BSON Date for temporal aggregations
  if (typeof cleaned.created_at === 'string' && !cleaned.created_at_date) {
    const parsedDate = new Date(cleaned.created_at);
    if (!isNaN(parsedDate.getTime())) {
      cleaned.created_at_date = parsedDate;
    }
  }

  return cleaned;
}

// Helper to connect to MongoDB Atlas with fallback
async function getConnectedClient() {
  console.log(`Connecting to MongoDB at: ${MONGODB_URI.replace(/:([^@]+)@/, ':****@')} ...`);
  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 6000,
    connectTimeoutMS: 6000
  });

  try {
    await client.connect();
    console.log('Connected successfully to MongoDB Atlas.');
    return { client, isAtlas: true };
  } catch (err) {
    console.warn('\n⚠️  Could not connect to MongoDB Atlas directly:');
    console.warn(`   Reason: ${err.message}`);
    console.warn('   NOTE: If Atlas reports ECONNRESET, add 0.0.0.0/0 (or your IP) in MongoDB Atlas -> Network Access.');
    console.log('\n🔄 Attempting connection to local MongoDB instance (mongodb://127.0.0.1:27017)...');
    
    const localClient = new MongoClient('mongodb://127.0.0.1:27017', {
      serverSelectionTimeoutMS: 4000
    });
    await localClient.connect();
    console.log('Connected successfully to local MongoDB fallback.');
    return { client: localClient, isAtlas: false };
  }
}

// 4. Main ingestion execution
async function main() {
  console.log('====================================================');
  console.log('   Twitter Dataset Ingestion & Indexing Pipeline    ');
  console.log('====================================================');
  
  const rootDir = path.resolve(__dirname, '..');
  const tweetsPath = findTweetsFile(rootDir);

  if (!tweetsPath) {
    console.error('ERROR: Could not find tweets.json in the workspace!');
    process.exit(1);
  }

  console.log(`Found tweets data file at: ${tweetsPath}`);
  const rawContent = readFileAutoEncoding(tweetsPath);

  // Parse lines or array
  let rawDocs = [];
  const trimmed = rawContent.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    rawDocs = JSON.parse(trimmed);
  } else {
    const lines = trimmed.split(/\r?\n/).filter(line => line.trim().length > 0);
    for (const line of lines) {
      try {
        rawDocs.push(JSON.parse(line));
      } catch (err) {
        console.warn(`Skipping invalid JSON line: ${err.message}`);
      }
    }
  }

  console.log(`Parsed ${rawDocs.length} raw documents from file.`);

  // Clean Extended JSON
  const cleanedDocs = rawDocs.map(cleanExtendedJson);
  console.log(`Cleaned ${cleanedDocs.length} documents into native BSON types.`);

  // Connect
  const { client, isAtlas } = await getConnectedClient();

  try {
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Bulk upsert to avoid duplicate errors
    console.log('\nExecuting bulk upsert operation into ' + DB_NAME + '.' + COLLECTION_NAME + '...');
    const bulkOps = cleanedDocs.map(doc => ({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: doc },
        upsert: true
      }
    }));

    const bulkResult = await collection.bulkWrite(bulkOps, { ordered: false });
    console.log(`Bulk write complete:`);
    console.log(` - Matched: ${bulkResult.matchedCount}`);
    console.log(` - Upserted: ${bulkResult.upsertedCount}`);
    console.log(` - Modified: ${bulkResult.modifiedCount}`);

    const totalInDb = await collection.countDocuments();
    console.log(`Total documents currently in '${COLLECTION_NAME}' collection: ${totalInDb}`);

    // Create indexes (using standard names to avoid IndexOptionsConflict)
    console.log('\nCreating performance indexes...');
    
    // 1. Multikey index on entities.hashtags.text
    const idxHashtags = await collection.createIndex(
      { 'entities.hashtags.text': 1 }
    );
    console.log(`[✓] Multikey Index confirmed: ${idxHashtags}`);

    // 2. Compound index on user.screen_name and user.followers_count
    const idxUser = await collection.createIndex(
      { 'user.screen_name': 1, 'user.followers_count': -1 }
    );
    console.log(`[✓] Compound Index confirmed: ${idxUser}`);

    // 3. Text index on text
    const idxText = await collection.createIndex(
      { text: 'text' }
    );
    console.log(`[✓] Text Index confirmed: ${idxText}`);

    // 4. 2dsphere index on coordinates (sparse)
    const idxGeo = await collection.createIndex(
      { coordinates: '2dsphere' },
      { sparse: true }
    );
    console.log(`[✓] 2dsphere Index confirmed: ${idxGeo}`);

    // Confirm all indexes
    const indexes = await collection.indexes();
    console.log('\n--- Active Indexes in Collection ---');
    indexes.forEach(idx => {
      console.log(` - ${idx.name}: ${JSON.stringify(idx.key)} (sparse: ${!!idx.sparse})`);
    });

    console.log(`\n Target: ${isAtlas ? 'MongoDB Atlas (Cloud)' : 'MongoDB Local'}`);
    console.log(' Status: Ingestion & Indexing Completed Successfully!\n');
  } catch (err) {
    console.error('Ingestion failed with error:', err);
    process.exit(1);
  } finally {
    await client.close();
    console.log('MongoDB connection closed.');
  }
}

if (require.main === module) {
  main();
}

module.exports = { cleanExtendedJson, findTweetsFile, readFileAutoEncoding, getConnectedClient };
