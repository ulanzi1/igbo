-- award-points.lua
-- KEYS (numberOfKeys = 6):
--   KEYS[1] = points:idempotency:{compositeKey}
--   KEYS[2] = points:rapid:{actorId}
--   KEYS[3] = points:repeat:{actorId}:{contentOwnerId}  (authorId for posts, hostId for events)
--   KEYS[4] = points:daily:{earnerUserId}   (utcDate appended inside script)
--   KEYS[5] = points:leaderboard
--   KEYS[6] = points:user:{earnerUserId}
-- ARGV:
--   ARGV[1] = actorId        (string)
--   ARGV[2] = earnerUserId   (string)
--   ARGV[3] = amount         (number)
--   ARGV[4] = rapidThreshold (number)
--   ARGV[5] = rapidWindowSec (number)
--   ARGV[6] = repeatThreshold(number)
--   ARGV[7] = repeatWindowSec(number)
--   ARGV[8] = dailyCap       (number)
-- RETURN: flat array {awarded(0|1), reason(string), newTotal(number), leaderboardScore(number)}

-- Step 0: Validate all required KEYS and ARGV
for i = 1, 6 do
  if not KEYS[i] or KEYS[i] == "" then
    return redis.error_reply("invalid args: KEYS[" .. i .. "] is missing")
  end
end
for i = 1, 8 do
  if not ARGV[i] or ARGV[i] == "" then
    return redis.error_reply("invalid args: ARGV[" .. i .. "] is missing")
  end
end

-- Step 1: Self-award block (before idempotency — self-reactions never consume an idempotency slot)
-- AC 8: this must return before any Redis write so no keys are modified for self-reactions.
if ARGV[1] == ARGV[2] then
  return {0, "self", 0, 0}
end

-- Step 2: Idempotency — atomic SET NX EX (single command, no SETNX+EXPIRE race)
local set = redis.call('SET', KEYS[1], '1', 'NX', 'EX', 86400)
if set == false then
  return {0, "duplicate", 0, 0}
end

-- Step 3: Rapid-fire sliding window
-- Single TIME call — destructure both seconds and microseconds from the same timestamp pair
local time = redis.call('TIME')
local now = tonumber(time[1])
local us = tostring(time[2])
local rapidWindow = tonumber(ARGV[5])
local rapidThreshold = tonumber(ARGV[4])

redis.call('ZREMRANGEBYSCORE', KEYS[2], 0, now - rapidWindow)
if redis.call('ZCARD', KEYS[2]) >= rapidThreshold then
  return {0, "rapid_fire", 0, 0}
end
-- Unique member via microseconds to avoid same-second collision
redis.call('ZADD', KEYS[2], now, tostring(now) .. ":" .. us)
redis.call('EXPIRE', KEYS[2], ARGV[5])

-- Step 4: Repeat-pair sliding window
local repeatWindow = tonumber(ARGV[7])
local repeatThreshold = tonumber(ARGV[6])

redis.call('ZREMRANGEBYSCORE', KEYS[3], 0, now - repeatWindow)
if redis.call('ZCARD', KEYS[3]) >= repeatThreshold then
  return {0, "repeat_pair", 0, 0}
end
redis.call('ZADD', KEYS[3], now, tostring(now) .. ":" .. us)
redis.call('EXPIRE', KEYS[3], ARGV[7])

-- Step 5: Daily cap check
-- Compute UTC date string from TIME seconds (os.date is unavailable in Redis Lua sandbox).
-- Civil calendar algorithm (valid for all dates after 1970-03-01).
local z = math.floor(now / 86400) + 719468
local era = math.floor((z >= 0 and z or z - 146096) / 146097)
local doe = z - era * 146097
local yoe = math.floor((doe - math.floor(doe/1460) + math.floor(doe/36524) - math.floor(doe/146096)) / 365)
local y = yoe + era * 400
local doy = doe - (365 * yoe + math.floor(yoe/4) - math.floor(yoe/100))
local mp = math.floor((5 * doy + 2) / 153)
local calDay = doy - math.floor((153 * mp + 2) / 5) + 1
local calMonth = mp + (mp < 10 and 3 or -9)
local calYear = y + (calMonth <= 2 and 1 or 0)
local utcDate = string.format("%04d-%02d-%02d", calYear, calMonth, calDay)
local dailyKey = KEYS[4] .. ":" .. utcDate
local dailyCount = tonumber(redis.call('GET', dailyKey) or 0)
local dailyCap = tonumber(ARGV[8])
if dailyCount >= dailyCap then
  return {0, "daily_cap", 0, 0}
end

-- Step 6: Increment user counter and daily cap tracker
local newTotal = redis.call('INCRBY', KEYS[6], ARGV[3])
redis.call('INCRBY', dailyKey, ARGV[3])
-- EXPIREAT next UTC midnight — (floor+1)*86400 avoids instant-expiry at exact midnight boundary
local midnight = (math.floor(now / 86400) + 1) * 86400
redis.call('EXPIREAT', dailyKey, midnight)

-- Step 7: Leaderboard update
local leaderboardScore = tonumber(redis.call('ZINCRBY', KEYS[5], ARGV[3], ARGV[2]))

return {1, "ok", newTotal, leaderboardScore}
