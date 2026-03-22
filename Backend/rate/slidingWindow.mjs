import { connection } from '../BackBlaze/redisClient.mjs';

const WINDOW_SIZE = 60*1000*60;
const MAX_REQUEST = 1;

export const slidingWindowLimiter = async (key) => {
  const now = Date.now();
  const windowStart = now - WINDOW_SIZE;
  const multi = connection.multi();

  multi.zremrangebyscore(key, 0, windowStart);
  multi.zcard(key);
  multi.zadd(key, now, `${now}-${Math.random()}`);
  multi.expire(key, Math.ceil(WINDOW_SIZE / 1000));

  const results = await multi.exec();

  const requestCount = results[1][1];

  if (requestCount >= MAX_REQUEST) {
    return { allowed: false };
  }

  return { allowed: true };
}
