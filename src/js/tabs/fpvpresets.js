
var firebase = require("firebase");
var http = require('http');
var hash = require('crypto-toolkit').Hash('base64-urlsafe');
var randomhash = require('crypto-toolkit').RandomHash('base64-urlsafe');
var opn = require('opn');
var querystring = require("querystring");

var FpvPresets = function (){
  var self = this;
  self._credentials = require('./FpvPresets_credentials.json');
  self._firebase_config = {
    apiKey: "AIzaSyCRR_LrqYNwPKlG4NQDQSvhuQ1SLZ_a5KY",
    authDomain: "fpvpresets.firebaseapp.com",
    databaseURL: "https://fpvpresets.firebaseio.com",
    storageBucket: "fpvpresets.appspot.com",
  };
  self._user_info_request_uri = 'https://www.googleapis.com/oauth2/v3/userinfo';
  self._query_string_parsed = [];
  self.initialize();
}

FpvPresets.prototype.initialize = function (){
  var self = this;
  firebase.initializeApp(self._firebase_config);

  self._auth_server = http.createServer(function (req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.write(i18n.getMessage('fpvPresetsCloseBrowser'));
    res.end();
    self._processReq(req);
  });

  self._attachOnListening = function(auth_server){
    auth_server.on('listening', function(){
      self._credentials.installed.redirect_uris.push(`http://${auth_server.address().address}:${auth_server.address().port}`);
      self._state = randomhash.sha256();
      self._code_verifier = randomhash.sha256();
      var code_challenge = hash.sha256(self._code_verifier);
      var code_challenge_method = 'S256';
      var params = querystring.stringify( {
        client_id: self._credentials.installed.client_id,
        redirect_uri: self._credentials.installed.redirect_uris[self._credentials.installed.redirect_uris.length - 1],
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
    self._query_string_parsed.push(this_req);
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
    self._performCodeExchange(this_req.code, self._code_verifier, self._credentials.installed.redirect_uris[1]);
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
        self.getProfileInfo(self.tokens.access_token);
      }
    ).fail(function(error){
      GUI.log(`Error during token exchange: ${error.responseJSON.error}, ${error.responseJSON.error_description}`);
    });
  }
  
  self.getProfileInfo = function(access_token){
    var jqXHR = $.ajax({
      url: self._user_info_request_uri,
      type: 'GET',
      headers: {
        Authorization: `Bearer ${access_token}`
      },
      success: function(data){
        self.profile_info=data;
      }
    }).fail(function(error){
      GUI.log(`Error getting profile info: ${error.responseJSON.error}, ${error.responseJSON.error_description}`);
    })
  }
}

FpvPresets.prototype.authenticate = function(){
  var self = this;
  if(self._auth_server){
    if(!self._auth_server.listening){
      var port = 0;
      if(self._auth_server.address()){
        port = self._auth_server.address().port;
      }
      self._auth_server.listen(port,'127.0.0.1');
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