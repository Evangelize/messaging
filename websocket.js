import chalk from 'chalk';
import path from 'path';
import async from 'async';
import nconf from 'nconf';
import Cron from 'cron';
import {createClient} from './redisClient';
import Server from 'socket.io';

let config, subClient, pubClient, io;
const CronJob = Cron.CronJob,
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
        io.emit(
          subChannels[0],
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
      },
      onMessage = function (socket, message) {
        console.log("incoming: ", socket.id);
        message.clientId = socket.id;
        pubClient.publish("congregate:"+message.type, JSON.stringify(message));
        //server.publish('/changes', message);
        //server.eachSocket(function(socket){
        //  console.log("socket list: ", socket.id);
        //});
        //switch (message.type) {
        //}
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

createClient().then(
  function(client) {
    pubClient = client;
  }
);

io = new Server(config.get("port"));
io.on('connection', function (socket) {
  io.emit('global', { clientConnected: socket.id });
  socket.on(
    'update',
    function (data) {
      onMessage(socket, data);
    }
  );
  socket.on(
    'insert',
    function (data) {
      onMessage(socket, data);
    }
  );
  socket.on(
    'delete',
    function (data) {
      onMessage(socket, data);
    }
  );
});
