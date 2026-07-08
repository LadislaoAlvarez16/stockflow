const Redis = require('ioredis');
const redis = new Redis();
async function run() {
  await redis.flushall();
  console.log('Redis flushed!');
  process.exit(0);
}
run();
