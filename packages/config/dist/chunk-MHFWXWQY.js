// src/redis.ts
function createRedisKey(app, domain, id) {
  return `${app}:${domain}:${id}`;
}

export {
  createRedisKey
};
