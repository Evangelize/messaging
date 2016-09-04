import fs from 'fs';
import url from 'url';
import chalk from 'chalk';
import path from 'path';
import async from 'async';
import nconf from 'nconf';
import Cron from 'cron';
import { createClient } from './redisClient';
import WebSocket from 'websocket';
import http from 'http';
import jwt from 'jsonwebtoken';
let subClient, pubClient;
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
        /*
        ws.broadcast(
          subChannels[0],
          {
            type: subChannels[1],
            payload: payload
          }
        );
        */
        ws.broadcast(JSON.stringify(
          {
            type: subChannels[1],
            payload: payload
          }
        ));
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
        // console.log("incoming: ", socket);
        //message.clientId = socket.id;
        pubClient.publish("congregate:"+message.type, JSON.stringify(message));
        //server.publish('/changes', message);
        //server.eachSocket(function(socket){
        //  console.log("socket list: ", socket.id);
        //});
        //switch (message.type) {
        //}
      };
const WebSocketServer = WebSocket.server;
const server = http.createServer(
  function(request, response) {
    console.log((new Date()) + ' Received request for ' + request.url);
    response.writeHead(404);
    response.end();
  }
);
// Start server function
const config = nconf.argv()
 .env()
 .file({ file: 'config/settings.json' });
const cert = fs.readFileSync(config.get("jwtCert"));
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

server.listen(
  config.get("port"), 
  function() {
    console.log((new Date()) + ' Server is listening on port');
  }
);
const ws = new WebSocketServer({
    httpServer: server,
    // You should not use autoAcceptConnections for production
    // applications, as it defeats all standard cross-origin protection
    // facilities built into the protocol and the browser.  You should
    // *always* verify the connection's origin and decide whether or not
    // to accept it.
    autoAcceptConnections: false
});
const validateJwt = function(resourceUrl, callback) {
  let query = url.parse(resourceUrl, true).query;
  console.log('validateJwt', query.token);

  jwt.verify(
    query.token, 
    cert,
    {  
      algorithms: ['RS256',],
    }, 
    function(err, decoded) {
      let retVal = true;
      if (err) {
        console.log('invalid token', err);
        retVal = false;
      }
      callback(retVal) ;
    }
  );
};



ws.on(
  'request', 
  function(request) {
    /**
    if (!originIsAllowed(request.origin)) {
      // Make sure we only accept requests from an allowed origin
      request.reject();
      console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
      return;
    }
    **/

    validateJwt(
      request.resourceURL,
      function(valid){
        if (!valid) {
          request.reject();
          console.log((new Date()) + ' Connection from origin ' + request.remoteAddress + ' rejected.');
          return;
        }
        // console.log(request);
        let connection = request.accept();
        console.log((new Date()) + ' Connection accepted from', connection.remoteAddress);
        connection.on(
          'message', 
          function(data) {
            if (data.type === 'utf8') {
              console.log('Received Message: ' + data.utf8Data);
              //connection.sendUTF(data.utf8Data);
              try {
                let command = JSON.parse(data.utf8Data);
                onMessage(connection, command);
              } catch(e) {
                console.log(e);
              }
              
            } else if (data.type === 'binary') {
              console.log('Received Binary Message of ' + data.binaryData.length + ' bytes');
              //connection.sendBytes(data.binaryData);
            }
          }
        );
        connection.on('close', function(reasonCode, description) {
          console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
        });
      }
    );
  }
);
