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
import socketio from 'socket.io';
import jwtAuth from 'socketio-jwt-auth';

import config from './config';
console.log(config);
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
  try {
    const entityId = message.entityId || message.record.entityId;
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
      entityId, 
      {
        type: subChannels[1],
        payload: payload
      }
    );
    } catch (e) {
      console.log(e);
    }
};
// Broadcast to all open connections
const broadcastEntity = (entityId, data) => {
  async.each(
    connections.getByEntityId(entityId),
    (client, cb) => {
      const connection = client.ws;
      if (connection.connected) {
        connection.emit('message', data);
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
  subClient.psubscribe("evangelize:outgoing:*");
  console.log("Subscribing");
  subClient.on(
    "pmessage", 
    (pattern, channel, message) => {
      console.log("channel ", channel, ": ", message);
      const msg = JSON.parse(message);
      sendMessage(channel, msg);
    }
  );
};
const onMessage = (socket, message) => {
  // console.log("incoming: ", socket);
  //message.clientId = socket.id;
  const msg = JSON.parse(message);
  pubClient.publish("evangelize:incoming:"+msg.type, message);
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

const serviceAccount = require(config.firebase.serviceAccount);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: config.firebase.databaseUri,
});

const cert = fs.readFileSync(config.jwtCert);
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
  config.port, 
  function() {
    console.log(`${new Date()} Server is listening on port ${config.port}`);
  }
);
const ws = socketio(server);
ws.use((socket, next) => {
  let query = url.parse(socket.request.url, true).query;
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
        err  = new Error('Authentication error');
      } else {
        socket.request.user = decoded;
      }
      next(err);
    }
  );
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
  'connection', 
  (connection) => {
    const id = shortid.generate();
    console.log((new Date()) + ' Connection accepted from', connection.remoteAddress);
    connection.on(
      'event', 
      (data) => {
        /*
        if (data.type === 'utf8') {
          console.log('Received Message: ' + data);
          //connection.sendUTF(data.utf8Data);
          try {
            onMessage(connection, data);
          } catch(e) {
            console.log(e);
          }
          
        } else if (data.type === 'binary') {
          console.log('Received Binary Message of ' + data.binaryData.length + ' bytes');
          //connection.sendBytes(data.binaryData);
        }
        */
        onMessage(connection, data);
      }
    );
    console.log(connection.request.user);
    connections.add({
      id,
      peopleId: connection.request.user.peopleId,
      entityId: connection.request.user.entityId,
      ws: connection,
    });
    connections.list();
    connection.on(
      'disconnect', 
      () => {
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.', connection.request.user.peopleId, id);
        connections.remove(id);
        connections.list();
      }
    );
    // connection.ping({data: 'ping'});
  }
);