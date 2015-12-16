// gulpfile.js
var gulp = require('gulp'),
    nodemon = require('gulp-nodemon');

gulp.task(
  'dev',
  function () {
    nodemon(
      {
        script: 'index.js',
        watch : [
          'index.js',
          'websocket.js',
          'lib'
        ],
        execMap: {
          js: "node --harmony"
        }
      }
    )
    .on(
      'restart',
      function () {
        console.log('restarted!')
      }
    )
  }
);
