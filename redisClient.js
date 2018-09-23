import redis from 'redis';
import path from 'path';
import nconf from 'nconf';
import Promise from 'bluebird';
import config from './config';

export default {
  createClient(cb) {
    return new Promise(function(resolve, reject){
      let client;
      client = redis.createClient(
        config.redis.port,
        config.redis.host
      );
      if (config.redis.db >= 0) {
        client.select(
          config.redis.db,
          function() {
            resolve(client);
          }
        );
      } else {
        resolve(client);
      }
    });
  }
}
