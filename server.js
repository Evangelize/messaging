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
import shortid from 'shortid';
import * as admin from "firebase-admin";

let subClient;
let pubClient;

class Connections {
  connections = [];
  add(connection) {
    this.connections.push(connection);
  }

  remove(id) {
    this.connections = this.connections.filter(e => e.id !== id);
  }

  list() {
    console.log(this.connections);
  }

  getByEntityId(entityId) {
    return this.connections.filter(e => e.entityId === entityId);
  }

  getByPeopleId(peopleId) {
    return this.connections.filter(e => e.peopleId === peopleId);
  }
};
const connections = new Connections();
const CronJob = Cron.CronJob;
const ping = () => {
  subClient.ping((err, res) => {
    console.log("redis server pinged");
  });
};
const startPing = () => {
  new CronJob(
    '05 * * * * *',
    function() {
      ping();
    },
    null,
    true,
    'America/Chicago'
  );
};
const sendMessage = (channel, message) => {
  const _channel = channel.split(":");
  const subChannels = _channel[1].split(".");
  const payload = {
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
  broadcastEntity(
    message.entityId, 
    JSON.stringify(
      {
        type: subChannels[1],
        payload: payload
      }
    )
  );
};
// Broadcast to all open connections
const broadcastEntity = (entityId, data) => {
  async.each(
    connections.getByEntityId(entityId),
    (client, cb) => {
      const connection = client.ws;
      if (connection.connected) {
        connection.send(data);
      }
      cb();
    },
    (err) => {
      if (err) {
        console.log(err);
      }
      console.log('done broadcasting to entity', entityId)
    }

  );
}

// Send a message to a connection by its connectionID
function sendToPeopleId(connectionID, data) {
  var connection = connections[connectionID];
  if (connection && connection.connected) {
    connection.send(data);
  }
}


const setSubscription = () => {
  subClient.psubscribe("evangelize:*");
  console.log("Subscribing");
  subClient.on(
    "pmessage", 
    (pattern, channel, message) => {
      console.log("channel ", channel, ": ", message);
      message = JSON.parse(message);
      sendMessage(channel, message);
    }
  );
};
const onMessage = (socket, message) => {
  // console.log("incoming: ", socket);
  //message.clientId = socket.id;
  pubClient.publish("evangelize:"+message.type, JSON.stringify(message));
  //server.publish('/changes', message);
  //server.eachSocket(function(socket){
  //  console.log("socket list: ", socket.id);
  //});
  //switch (message.type) {
  //}
};
const WebSocketServer = WebSocket.server;
const server = http.createServer(
  (request, response) => {
    console.log((new Date()) + ' Received request for ' + request.url);
    response.writeHead(404);
    response.end();
  }
);
// Start server function
const config = nconf.argv()
 .env()
 .file({ file: 'config/settings.json' });

const serviceAccount = require(config.get("push:fcm:key"));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: config.get("push:fcm:databaseUri")
});

const cert = fs.readFileSync(config.get("jwtCert"));
createClient().then(
  (client) => {
    subClient = client;
    startPing();
    setSubscription();
  }
);

createClient().then(
  (client) => {
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
    autoAcceptConnections: false,
    clientTracking: true
});
const validateJwt = (resourceUrl, callback) => {
  let query = url.parse(resourceUrl, true).query;
  console.log('validateJwt', query.token);

  jwt.verify(
    query.token, 
    cert,
    {  
      algorithms: ['RS256',],
    }, 
    (err, decoded) => {
      let retVal = true;
      if (err) {
        console.log('invalid token', err);
        retVal = false;
      }
      callback(retVal, decoded) ;
    }
  );
};



ws.on(
  'request', 
  (request) => {
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
      (valid, token) => {
        if (!valid) {
          request.reject();
          console.log((new Date()) + ' Connection from origin ' + request.remoteAddress + ' rejected.');
          return;
        }
        // console.log(request);
        const id = shortid.generate();
        let connection = request.accept();
        connection.id = id;
        console.log((new Date()) + ' Connection accepted from', connection.remoteAddress);
        connection.on(
          'message', 
          (data) => {
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
        console.log(token);
        connections.add({
          id,
          peopleId: token.peopleId,
          entityId: token.entityId,
          ws: connection,
        });
        connections.list();
        connection.on(
          'close', 
          (reasonCode, description) => {
            console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.', token.peopleId, id);
            connections.remove(id);
            connections.list();
          }
        );
        connection.on(
          'ping', 
          (data, flags) => {
            console.log('ping', token.peopleId, id);
          }
        );
        connection.on(
          'pong', 
          (data, flags) => {
            console.log('pong', token.peopleId, id);
          }
        );
        connection.ping({data: 'ping'});
      }
    );
  }
);