const path = require('path');
const fs = require('fs');
let settings = {
  mysql: {},
  redis: {},
  firebase: {},
};
try {
  settings = require('./settings');
} catch(e) {
  console.log('no settings.js');
}
// Main server/app configuration
module.exports = {
  mysql: {
    host     : process.env.DB_PORT_3306_TCP_ADDR || process.env.DB_HOST || settings.mysql.host || 'localhost',
    username : process.env.DB_USERNAME || settings.mysql.username || 'wdwtables',
    password : process.env.DB_PASSWORD || settings.mysql.password || 'password',
    database : process.env.DB_DATABASE || settings.mysql.database|| 'wdwtables',
    dialect: 'mysql',
    multipleStatements: true,
  },
  redis: {
    host: process.env.REDIS_PORT_6379_TCP_ADDR || process.env.REDIS_HOST || settings.redis.host || 'localhost',
    port: process.env.REDIS_PORT_6379_TCP_PORT || process.env.REDIS_PORT || settings.redis.port || 6379,
    db: process.env.REDIS_DB || settings.redis.db || 0,
  },
  mail: {
    host: 'localhost',
    port: 25,
  },
  firebase: {
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || settings.firebase.serviceAccount || null,
    databaseURL: process.env.FIREBASE_DATABASE_URL || settings.firebase.databaseURL || 'https://xxxx.firebaseio.com',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || settings.firebase.authDomain || 'evangelize-75f29.firebaseapp.com',
    projectId: process.env.FIREBASE_PROJECT_ID || settings.firebase.projectId || 'project Id',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || settings.firebase.storageBucket || 'xxxx.appspot.com',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || settings.firebase.messagingSenderId || 'messaging sender id',
    fbAppId: process.env.FIREBASE_FB_APP_ID || settings.firebase.fbAppId || 'fb app id',
    apiKey: process.env.FIREBASE_API_KEY || settings.firebase.apiKey || 'api key',
  },
  host: process.env.WEB_HOST || settings.host || 'localhost',
  port: process.env.WEB_PORT || settings.port || 3000,
  key: process.env.SALT_KEY || settings.key || 'key',
  jwtCert: process.env.JWT_CERT || settings.jwtCert || 'private.pem',
  jwtKey: process.env.JWT_KEY || settings.jwtKey || 'private.key'
};
