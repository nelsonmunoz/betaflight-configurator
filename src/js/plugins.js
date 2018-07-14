'use strict';
/* Plugin Loader */
const fs = require('fs');
const plugins_folder = './plugins';
function getFiles (dir, files_){
    files_ = files_ || [];
    var files = fs.readdirSync(dir);
    for (var i in files){
        var name = dir + '/' + files[i];
        if (fs.statSync(name).isDirectory()){
            getFiles(name, files_);
        } else {
            if(files[i]=='plugin.js'){
                files_.push(name);
            }
        }
    }
    return files_;
}

var plugin_files=getFiles(plugins_folder);

for (var plugin_js of plugin_files){
    var plugin_folder = plugin_js.match(/plugins\/(.*)\/plugin\.js/)[1];
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src=plugin_js;
    $('head').append(script);
}