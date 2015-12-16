import chalk from 'chalk';
import path from 'path';
import async from 'async';
import nconf from 'nconf';
import Cron from 'cron';
import {createClient} from './redisClient';

// Hapi server imports
import Hapi from 'hapi';
import Nes from 'nes';
let config, subClient;
const CronJob = Cron.CronJob,
      server = new Hapi.Server(),
      ping = function() {
        subClient.ping(function (err, res) {
          console.log("redis server pinged");
        });
      },
      startPing = function() {
        new CronJob(
          '05 * * * * *',
          function() {
            ping();
          },
          null,
          true,
          'America/Chicago'
        );
      },
      sendMessage = function(channel, message) {
        var _channel = channel.split(":"),
            subChannels = _channel[1].split("."),
            payload = {
              data: message
            };

        server.publish(
          '/'+subChannels[0],
          {
            type: subChannels[1],
            payload: payload
          }
        );
      },
      setSubscription = function() {
        subClient.psubscribe("congregate:*");
        console.log("Subscribing");
        subClient.on("pmessage", function (pattern, channel, message) {
          console.log("channel ", channel, ": ", message);
          message = JSON.parse(message);
          sendMessage(channel, message);
        });
      };
// Start server function
config = nconf.argv()
 .env()
 .file({ file: 'config/settings.json' });

createClient().then(
  function(client) {
    subClient = client;
    startPing();
    setSubscription();
  }
);

server.connection(
  {
    host: config.get("host"),
    port: config.get("port")
  }
);
// Webpack compiler

// Register Hapi plugins
server.register(
  Nes,
  ( error ) => {
    if ( error ) {
      console.error( error );
    }

    server.subscription('/attendance');
    server.subscription('/classes');
    server.subscription('/notes');
    server.start(
      (err) => {
        console.log( '==> Websocket Server is listening on', server.info.uri );
      }
    );
  }
);
