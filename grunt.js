/**
 *  Gruntfile for building and starting DummyREST
 *
 */

module.exports = function (grunt) {

    console.log("project dir", __dirname);

    var basePath = "dist/";
    var debugPath = basePath + "debug/";
    var releasePath = basePath + "release/";

    grunt.initConfig({

        concat:{
            twitter_stuff:{
                src:["node_modules/twitter-bootstrap-node/vendor/bootstrap/js/*.js"],
                dest:"public/javascripts/bootstrap.js"
            }

        },

        copy:{
            twitter_stuff:{
                options:{
                    flatten:true
                },
                files:{
                    "public/images/":["node_modules/twitter-bootstrap-node/vendor/bootstrap/img/*"]
                }
            }
        }
    });


    grunt.registerTask("prepare", "copy:twitter_stuff concat:twitter_stuff");

    grunt.registerTask("default", "prepare");
}
