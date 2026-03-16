import { client } from "../BackBlaze/redisClient.mjs";

export const rate = async (req, res, next) => {
  const ip = req.ip;
  const key = `rate:${ip}`;
  console.log(ip);
  const window = 3600;
  const limit = 10;
  const current = await client.INCR(key);
  if (current === 1) {
    client.EXPIRE(key, window);
  }
  if (current > limit) {
    return res.status(429).json({ message: "too many requests" });
  }
  next();
};
