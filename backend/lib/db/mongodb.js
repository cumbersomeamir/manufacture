import { MongoClient } from "mongodb";

const DEFAULT_DB_NAME = process.env.MONGODB_DB || "manufacture_ai";

let clientPromise = null;
let dbInstance = null;
let clientInstance = null;

function getMongoUri() {
  return process.env.MONGODB_URI || "";
}

export function isMongoConfigured() {
  return Boolean(getMongoUri());
}

async function createClient() {
  const uri = getMongoUri();
  if (!uri) {
    throw new Error("MONGODB_URI not configured");
  }

  const client = new MongoClient(uri, {
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 8000,
  });

  await client.connect();
  clientInstance = client;
  return client;
}

export async function getDb() {
  if (dbInstance) return dbInstance;

  if (!clientPromise) {
    clientPromise = createClient().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }

  const client = await clientPromise;
  dbInstance = client.db(DEFAULT_DB_NAME);
  return dbInstance;
}

export async function pingMongo() {
  if (!isMongoConfigured()) return false;
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function closeMongoConnection() {
  try {
    if (clientInstance) {
      await clientInstance.close();
    }
  } finally {
    clientInstance = null;
    clientPromise = null;
    dbInstance = null;
  }
}
