module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    jshint: {
      files: ['site/**/*.js', 'jquery.sonificator.js', 'sonificator.js'],
    },
    uglify: {
      dist: {
        files: {
          './site/jquery.sonificator.min.js': ['./jquery.sonificator.js'],
          './site/sonificator.min.js': ['./sonificator.js']
        }
      },
    },
    'gh-pages': {
      options: {
        base: 'site'
      },
      src: ['**/*']
    }
  });
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-gh-pages');

  grunt.registerTask('test',['jshint']);
  grunt.registerTask('default', []);
  grunt.registerTask('publish', ['jshint','gh-pages']);
};
