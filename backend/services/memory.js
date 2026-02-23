import Redis from "ioredis";
import { CHAT_CONSTANTS, CHAT_KEYS } from "../constants/chat.js";

const store = new Map();

const memoryStore = {
  async get(key) {
    return store.get(key) ?? null;
  },
  async set(key, value) {
    store.set(key, value);
  },
  async delete(key) {
    store.delete(key);
  },
};

async function getRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    return new Redis(url);
  } catch {
    return null;
  }
}

export async function loadHistory(sessionId) {
  const redis = await getRedis();
  if (redis) {
    try {
      const raw = await redis.get(CHAT_KEYS.history(sessionId));
      await redis.quit();
      return raw ? JSON.parse(raw) : [];
    } catch {
      await redis.quit();
    }
  }
  const raw = await memoryStore.get(CHAT_KEYS.history(sessionId));
  return raw ? JSON.parse(raw) : [];
}

export async function saveHistory(sessionId, history) {
  const val = JSON.stringify(history);
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.set(CHAT_KEYS.history(sessionId), val, "EX", CHAT_CONSTANTS.TTL_SEC);
      await redis.quit();
      return;
    } catch {
      await redis.quit();
    }
  }
  await memoryStore.set(CHAT_KEYS.history(sessionId), val);
}

export async function loadSummary(sessionId) {
  const redis = await getRedis();
  if (redis) {
    try {
      const summary = await redis.get(CHAT_KEYS.summary(sessionId));
      await redis.quit();
      return summary ?? "";
    } catch {
      await redis.quit();
    }
  }
  return (await memoryStore.get(CHAT_KEYS.summary(sessionId))) ?? "";
}

export async function saveSummary(sessionId, summaryText) {
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.set(CHAT_KEYS.summary(sessionId), summaryText, "EX", CHAT_CONSTANTS.TTL_SEC);
      await redis.quit();
      return;
    } catch {
      await redis.quit();
    }
  }
  await memoryStore.set(CHAT_KEYS.summary(sessionId), summaryText);
}

export async function clearMemory(sessionId) {
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.del(CHAT_KEYS.history(sessionId));
      await redis.del(CHAT_KEYS.summary(sessionId));
      await redis.quit();
      return;
    } catch {
      await redis.quit();
    }
  }
  await memoryStore.delete(CHAT_KEYS.history(sessionId));
  await memoryStore.delete(CHAT_KEYS.summary(sessionId));
}
