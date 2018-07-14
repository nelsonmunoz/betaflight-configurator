'use strict';
var firebase = require("firebase");
var http = require('http');
var hash = require('crypto-toolkit').Hash('base64-urlsafe');
var randomhash = require('crypto-toolkit').RandomHash('base64-urlsafe');
var opn = require('opn');
var querystring = require("querystring");

var firebase_config = {
    apiKey: "AIzaSyDbIw3j6hy-UM5sGFmJG9KA_RF_GG1Ax7g",
    authDomain: "fpvpresets-test1.firebaseapp.com",
    databaseURL: "https://fpvpresets-test1.firebaseio.com",
    projectId: "fpvpresets-test1",
    storageBucket: "fpvpresets-test1.appspot.com",
    messagingSenderId: "544264153980"
};

if(firebase.apps.length==0){
    firebase.initializeApp(firebase_config);
}

var FpvPresets = function (){
    var self = this;
    self._credentials = require('./plugins/fpvpresets/FpvPresets_credentials.json');
    self._firebase_config = firebase_config;
    self._user_info_request_uri = 'https://www.googleapis.com/oauth2/v3/userinfo';
    self._redirect_uri = 'localhost';
    self._redirect_port = '50000'; //TODO: search for random free port
    self._querystring_parsed = [];
    self.i18n_en=require('./plugins/fpvpresets/_locales/en/messages.json');
    self.initialize();
}

FpvPresets.prototype.initialize = function (){
    var self = this;
    i18n.addResources(self.i18n_en);
    $('head').append('<link rel="stylesheet" type="text/css" href="./plugins/fpvpresets/css/fpvpresets.css">');
    self._auth_server = http.createServer(function (req, res) {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.write(i18n.getMessage('fpvPresetsCloseBrowser'));
        res.end();
        self._processReq(req);
    });

    self._attachOnListening = function(auth_server){
        auth_server.on('listening', function(){
        self._state = randomhash.sha256();
        self._code_verifier = randomhash.sha256();
        var code_challenge = hash.sha256(self._code_verifier);
        var code_challenge_method = 'S256';
        var params = querystring.stringify( {
            client_id: self._credentials.installed.client_id,
            redirect_uri: `http://${self._redirect_uri}:${auth_server.address().port}`,
            response_type: 'code',
            scope: 'openid profile',
            state: self._state,
            code_challenge : code_challenge,
            code_challenge_method : code_challenge_method
        });

        opn(`${self._credentials.installed.auth_uri}?${params}`);

        });
    }

    self._attachOnListening(self._auth_server);

    self._processReq = function(req){
        self._auth_server.close();
        chrome.app.window.get('main-window').focus();
        //TODO:
        //Check headers
        //return favico
        //i18n alerts
        if(req.url.includes('favico')){
        return;
        }
        var this_req = querystring.parse(req.url.split('?')[1]);
        self._querystring_parsed.push(this_req);
        if('error' in this_req){
        var msg = `Oauth authorization error: ${this_req.error}`;
        GUI.log(msg);
        alert(msg);
        return;
        }
        if(this_req.code == null || this_req.state == null){
        var msg = `Malformed authorization response: ${req}`;
        GUI.log(msg);
        alert(msg);
        return;
        }
        if(this_req.state != self._state){
        var msg = `Received request with invalid state: ${this_req.state}`;
        GUI.log(msg);
        alert(msg);
        return;
        }
        self._performCodeExchange(this_req.code, self._code_verifier, `http://${self._redirect_uri}:${self._redirect_port}`);
    }
    
    self._performCodeExchange = function(code, code_verifier, redirect_uri){
        var token_request_body = querystring.stringify({
        code:code,
        redirect_uri:redirect_uri,
        client_id:self._credentials.installed.client_id,
        code_verifier: code_verifier,
        client_secret:self._credentials.installed.client_secret,
        scope:'',
        grant_type:'authorization_code'
        });
        var jqXHR = $.post(
        self._credentials.installed.token_uri,
        token_request_body,
        function(data){
            //TODO: refresh tokens based on expiration
            self.tokens = data;
            var credential = firebase.auth.GoogleAuthProvider.credential(self.tokens.id_token);
            firebase.auth().signInAndRetrieveDataWithCredential(credential).catch(function(error) {
            // Handle Errors here.
            console.log(`Errors here. ${error.code}`);
            console.log(error.message);
            // The email of the user's account used.
            console.log(`The email of the user's account used.${error.email}`);
            // The firebase.auth.AuthCredential type that was used.
            console.log(`The firebase.auth.AuthCredential type that was used.${error.credential}`);
            // ...
            });
        }
        ).fail(function(error){
        GUI.log(`Error during token exchange: ${error.responseJSON.error}, ${error.responseJSON.error_description}`);
        });
        firebase.auth().onAuthStateChanged(function(){
        $('select[name="tuningPresets"]').trigger('change');
        });
    }
}

FpvPresets.prototype.authenticate = function(){
  var self = this;
  if(self._auth_server){
    if(!self._auth_server.listening){
      var port = self._redirect_port;
      if(self._auth_server.address()){
        port = self._auth_server.address().port;
      }
      self._auth_server.listen(port,self._redirect_uri);
      //self._attachOnListening(self._auth_server);
    }else {
      GUI.log('Authetication server already listening.');
      alert('Please check your browser window for initiated authentication.');
    }
  }else {
    //TODO i18n
    GUI.log('Error authenticating: FpvPresets not properly initialized.');
  }
}

var temp = TABS.pid_tuning.initialize.toString();
temp = temp.replace('function (callback)','');
temp = temp.replace('GUI.content_ready(callback);',
`self.fpvPresets = new FpvPresets();
GUI.content_ready(callback);`);
TABS.pid_tuning.initialize = new Function('callback',temp);