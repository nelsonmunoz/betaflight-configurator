'use strict';
//TODO: coherent jquery or plain javascript
var firebase = require('./plugins/fpvpresets/node_modules/firebase/index.node.js');
var hash = require('./plugins/fpvpresets/node_modules/crypto-toolkit/crypto-toolkit.js').Hash('base64-urlsafe');
var randomhash = require('./plugins/fpvpresets/node_modules/crypto-toolkit/crypto-toolkit.js').RandomHash('base64-urlsafe');
var opn = require('./plugins/fpvpresets/node_modules/opn/index.js');
var http = require('http');
var querystring = require('querystring');

var firebase_config = {
    apiKey: 'AIzaSyDbIw3j6hy-UM5sGFmJG9KA_RF_GG1Ax7g',
    authDomain: 'fpvpresets-test1.firebaseapp.com',
    databaseURL: 'https://fpvpresets-test1.firebaseio.com',
    projectId: 'fpvpresets-test1',
    storageBucket: 'fpvpresets-test1.appspot.com',
    messagingSenderId: '544264153980'
};

var sanitize = function(input){
    return $('<div/>').text(input).html().replace(/\n/gi,'');
};

var FpvPresets = function (){
    var self = this;
    self._credentials = require('./plugins/fpvpresets/FpvPresets_credentials.json');
    self._firebase_config = firebase_config;
    self._user_info_request_uri = 'https://www.googleapis.com/oauth2/v3/userinfo';
    self._redirect_uri = 'localhost';
    self._redirect_port = '50000'; //TODO: search for random free port
    self._querystring_parsed = [];
    self.i18n_en=require('./plugins/fpvpresets/_locales/en/messages.json');
    switch (CONFIG.flightControllerIdentifier){
        case 'BTFL':
            self._firmware = 'betaflight';
            break;
        case 'BTTR':
            self._firmware = 'butterflight';
            break;
        default:
            self._firmware = CONFIG.flightControllerIdentifier;
            break;
    }
    self.initialize(self);
};

FpvPresets.prototype.initialize = function (self){
    i18n.addResources(self.i18n_en);
    $('head').append('<link rel="stylesheet" type="text/css" href="./plugins/fpvpresets/css/fpvpresets.css">');
    self._auth_server = http.createServer((req, res) => {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.write(i18n.getMessage('fpvPresetsCloseBrowser'));
        res.end();
        self._processReq(req);
    });

    self._attachOnListening = function(auth_server){
        auth_server.on('listening', () => {
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
    };

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
        var msg;
        if('error' in this_req){
            msg = `Oauth authorization error: ${this_req.error}`;
            GUI.log(msg);
            alert(msg);
            return;
        }
        if(this_req.code == null || this_req.state == null){
            msg = `Malformed authorization response: ${req}`;
            GUI.log(msg);
            alert(msg);
            return;
        }
        if(this_req.state != self._state){
            msg = `Received request with invalid state: ${this_req.state}`;
            GUI.log(msg);
            alert(msg);
            return;
        }
        self._performCodeExchange(this_req.code, self._code_verifier, `http://${self._redirect_uri}:${self._redirect_port}`);
    };
    
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
        $.post(
            self._credentials.installed.token_uri,
            token_request_body,
            data => {
                //TODO: refresh tokens based on expiration
                self.tokens = data;
                var credential = firebase.auth.GoogleAuthProvider.credential(self.tokens.id_token);
                firebase.auth().signInAndRetrieveDataWithCredential(credential).catch(error => {
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
        ).fail(error => {
            GUI.log(`Error during token exchange: ${error.responseJSON.error}, ${error.responseJSON.error_description}`);
        });
        firebase.auth().onAuthStateChanged(() => {
            $('select[name="tuningPresets"]').trigger('change');
        });
    };
};

FpvPresets.prototype.authenticate = function(self){
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
};

FpvPresets.prototype._starString = function(stars_average){
    var return_string = '';
    for (var i=0; i<5; i++){
        if(i<stars_average){
            return_string += '&#9733;';
        }else {
            return_string += '&#9734;';
        }
    }
    return return_string;
};

FpvPresets.prototype._populateOptionData = function(preset,option){
    var data = option.data('data');
    try {
        option.data('stars_average',preset[Object.keys(preset)[0]].stars_average);
        option.data('reviews',preset[Object.keys(preset)[0]].reviews);
        option.data('preset_uid',Object.keys(preset)[0]);
        return true;
    } catch (error){
        console.log(`Error retrieving info for ${data.file_path}.`);
        console.log(error);
    }
};

FpvPresets.prototype._drawSelectOptions = function(self,option=false){
    var drawSelection = function(option){
        if(option.data('data').file_path){
            return firebase.database().ref(`/presets`)
                .orderByChild('path')
                .equalTo(`${self._firmware}/${CONFIG.flightControllerVersion}/${option.data('data').file_path}`)
                .once('value')
                .then(preset_ss => {
                    if(preset_ss.val()){
                        if(self._populateOptionData(preset_ss.val(),option)){
                            option.html(`${self._starString(option.data('stars_average'))} ${option.html().replace(/[★☆ ]/g,'')}`);
                        }
                    }else {
                        option.html(`${self._starString(0)} ${option.html().replace(/[★☆ ]/g,'')}`);
                    }
                });
        }
    };
    if (option){
        return drawSelection(option);
    } else {
        $('.profilep select[name="tuningPresets"] option').each(function(index){
            if(index>0){
                drawSelection($(this));
            }
        });
    }
};

FpvPresets.prototype._populatePresets = function(self,data){
    var presets_e;
    if (data){
        presets_e = $('.profilep select[name="tuningPresets"]').empty();
        presets_e.append($('<option value="0">{0}</option>'.format('Choose a Preset ...')));
        data.tree.forEach(file => {
            if( file.path.includes('Filters') && file.path.includes('.preset')){
                var filename=/(Filters-.*).preset/.exec(file.path)[1];
                var select_e =
                $('<option value="{0}">{0}</option>'.format(
                    filename
                )).data('data', {'download_url':`https://raw.githubusercontent.com/ultrafpv/fpvpresets/master/${self._firmware}/${CONFIG.flightControllerVersion}/${file.path}`,'name':filename,'file_path':file.path});
                presets_e.append(select_e);
            }
        });
        self._drawSelectOptions(self);
    } else {
        if ($('div#main-wrapper #log')[0].innerHTML.includes(i18n.getMessage('releaseCheckFailed',[`${CONFIG.flightControllerVersion} presets`,'Not Found']))){
            presets_e = $('.profilep select[name="tuningPresets"]').empty();
            presets_e.append($('<option value="0">{0}</option>'.format(`No presets found for ${CONFIG.flightControllerVersion} ...`)));
        }else {
            presets_e = $('.profilep select[name="tuningPresets"]').empty();
            presets_e.append($('<option value="0">{0}</option>'.format('Offline ...')));
        }
    }
};

FpvPresets.prototype._presetLoader = function(self,callback){
    var presetChecker = new ReleaseChecker(`${self._firmware} presets directory`,`https://api.github.com/repos/ultrafpv/fpvpresets/contents/${self._firmware}`);
    presetChecker.loadReleaseData(directory => {
        if(directory){
            var presetDirsForVersion = [];
            directory.forEach( entry => {
                if(entry.type == 'dir' && (entry.name == CONFIG.flightControllerVersion || entry.name == 'Any')){
                    presetDirsForVersion.push(entry.sha);
                }
            });
            var presetDirTree = new ReleaseChecker(`${self._firmware} ${CONFIG.flightControllerVersion} presets`, `https://api.github.com/repos/ultrafpv/fpvpresets/git/trees/${presetDirsForVersion[0]}?recursive=1`);
            presetDirTree.loadReleaseData(data =>{
                callback(self,data);
            });
        } else {
            var msg = 'Offline';
            if ($('div#main-wrapper #log')[0].innerHTML.includes(i18n.getMessage('releaseCheckFailed',[`${self._firmware} presets directory`,'Not Found']))){
                msg=`No presets found for ${self._firmware} ...`;
            }
            $('.profilep select[name="tuningPresets"]')
                .empty()
                .append($('<option value="0">{0}</option>'.format(msg)));
        }
    });
};

FpvPresets.prototype._drawPresetFileData = function(preset_file_data){
    if(preset_file_data){
        $('div.presetAuthor .bottomarea').text(/#AUTHOR:(.*)/.exec(preset_file_data)[1]);
        $('div.presetDescription .bottomarea').text(/#DESCRIPTION:(.*)/.exec(preset_file_data)[1]);
        $('div.presetBody .bottomarea').text(preset_file_data.replace(/#.*([\n\r|\n|\r])/g,''));
        $('div.presetAuthor').show();
        $('div.presetDescription').show();
        $('div.presetBody').show();
        $('div.presetReviewBox').show();
    } else {
        $('div.presetAuthor .bottomarea').text('Offline ...');
        $('div.presetDescription .bottomarea').text('Offline ...');
        $('div.presetBody .bottomarea').text('Offline ...');
        $('div.presetAuthor').show();
        $('div.presetDescription').show();
        $('div.presetBody').show();
        $('div.presetReviewBox').show();
    }
};

FpvPresets.prototype._setStars = function(div,stars){
    for (var i=0; i<5; i++){
        if(i<stars){
            if(!$(div.find('span.fa-star')[i]).hasClass('checked')){
                $(div.find('span.fa-star')[i]).addClass('checked');
            }
        }else {
            if($(div.find('span.fa-star')[i]).hasClass('checked')){
                $(div.find('span.fa-star')[i]).removeClass('checked');
            }
        }
    }
    return div;
};

FpvPresets.prototype._drawStarsDivBody = function(div_name){
    return `<div class="${div_name}">
    <span class="fa fa-star"></span>
    <span class="fa fa-star"></span>
    <span class="fa fa-star"></span>
    <span class="fa fa-star"></span>
    <span class="fa fa-star"></span>
</div>`;
};

FpvPresets.prototype._drawReview = function(self,review_ss){
    if(review_ss.val().body){
        //TODO: Separate reviews from ratings in db
        var stars_div = $('<div/>').html(self._drawStarsDivBody('userRating')).contents();
        stars_div = self._setStars(stars_div,review_ss.val().stars)[0].outerHTML;
        var rts = new Date(review_ss.val().timestamp*1000);
        $('div.reviewContainer').append(`<div class="userReview" style="border: 1px solid silver; border-top-left-radius: 3px; border-top-right-radius: 3px; border-bottom-left-radius: 3px; border-bottom-right-radius: 3px; padding: 3px">
        <div class="reviewHeader" style="display: flex; position:relative;">
            ${stars_div}
            <div class="userName" style="margin-left: 15px">${sanitize(review_ss.val().pilot_handle)}</div>
            <div class="reviewdate" style="position:absolute; right:25px">${rts.getFullYear()}/${rts.getMonth()}/${rts.getDate()}</div>
            <div class="flagIcon" style="position:absolute; right:5px">
                <a class="reportReview" href="#">
                    <span class="fa fa-exclamation-triangle"></span>
                </a>
            </div>
        </div>
        <div class="reviewBody" style="padding-top: 7px; padding-bottom: 5px;">${sanitize(review_ss.val().body)}</div>
    </div>`);
    }
};

FpvPresets.prototype._drawReviews = function(self,review_refs){
    $('div.reviewContainer').empty();
    for (var key in review_refs) {
        if(review_refs[key]&&key!='empty'){
            firebase.database().ref(`/reviews/${key}`).once('value').then(review_ss => {
                self._drawReview(self,review_ss);
            });
        }
    }
};

FpvPresets.prototype._drawSubmitBtn = function(self,rating_button_class='',user_preset_review=false,prefix=false){
    $('div.presetReviewBox .submit_btn').empty();
    if(firebase.auth().currentUser){
        $('div.presetReviewBox .submit_btn')[0].outerHTML=self._drawStarsDivBody(`btn default_btn submit_btn ${rating_button_class}`);
        var msg = prefix || (user_preset_review ? 'Update Rating: ' : 'Submit Rating: ');
        $('div.presetReviewBox .submit_btn').prepend(`<span>${msg}</span>`);
    } else {
        $('div.presetReviewBox .submit_btn').html('<a class="signin" href="#">Sign in</a>');
        $('a.signin').click(() => {
            self.authenticate(self);
        });
        $('div.presetReviewBox .bottomarea textarea').empty();
        $('div.presetReviewBox .bottomarea textarea').attr('disabled', true);
        $('div.presetReviewBox .bottomarea textarea').prop('placeholder', 'Sign in to Rate and Review.');
    }
};

FpvPresets.prototype._drawUserReview = function(user_review_body){
    $('textarea.reviewText').val(user_review_body || '');
};

FpvPresets.prototype._submitReview = function(self,rating_button_class){var body = false;
    if(!$('textarea.reviewText').val()){
        if(!confirm('Submit rating without review?')){
            $('select[name="tuningPresets"]').change();
            return;
        }
    } else {
        body = sanitize($('textarea.reviewText').val());
        console.log('submit both review and rating!');
    }
    $('textarea.reviewText').prop('disabled',true);
    var rating=0;
    $(`div.presetReviewBox .submit_btn.${rating_button_class} span.fa-star`).each(function(){
        if($(this).hasClass('checked')){
            rating++;
        }
    });
    self._drawSubmitBtn(self,rating_button_class,false,'Submitting');
    self._setStars($(`div.presetReviewBox .submit_btn.${rating_button_class}`),rating);
    var path=`${self._firmware}/${CONFIG.flightControllerVersion}/${$('select[name="tuningPresets"] option:selected').data('data').file_path}`;
    var new_review_key=firebase.database().ref('/reviews').push().key;
    firebase.database().ref(`/reviews/${new_review_key}`)
        .set({
            'body':body,
            'pilot_handle': $('textarea.reviewText').data('pilot_handle'),
            'preset':path,
            'reported':0,
            'stars':rating,
            'timestamp':Math.round((new Date()).getTime() / 1000)
        })
        .then(() => {
            return firebase.database().ref(`/presets/${$('select[name="tuningPresets"] option:selected').data('preset_uid')}`).once('value');
        })
        .then(preset_ss => {
            var preset_reviews=preset_ss.val().reviews;
            if('empty' in preset_reviews){
                preset_reviews={};
            }
            preset_reviews[new_review_key]=true;
            return firebase.database().ref(`/presets/${$('select[name="tuningPresets"] option:selected').data('preset_uid')}/reviews`).set(preset_reviews); //Reference review from preset
        })
        .then(() => {
            return firebase.database().ref(`/users/${firebase.auth().currentUser.uid}/reviews`).once('value');
        })
        .then(preset_reviews_sn => {
            var user_reviews=preset_reviews_sn.val();
            user_reviews[new_review_key]=true;
            return firebase.database().ref(`/users/${firebase.auth().currentUser.uid}/reviews`).set(user_reviews); //Reference review from users
        })
        .then((return_value) => {
            console.log('RETURN VALUE:',return_value);
            return self._drawSelectOptions(self,$('.profilep select[name="tuningPresets"] option:selected'));
        })
        .then(()=>{
            self._setStars($('div.presetRating'),$('.profilep select[name="tuningPresets"] option:selected').data('stars_average'));
            self._drawSubmitBtn(self,'updateRating',true);
            self._setStars($('div.presetReviewBox .submit_btn'),rating);
            self._drawReviews(self,$('.profilep select[name="tuningPresets"] option:selected').data('reviews'));
            $('div.presetReviewBox .bottomarea textarea').attr('disabled', false);
        })
        .catch(error=>{
            console.log('Error setting review data', error.message);
        });
};

FpvPresets.prototype._eventHandlers = function(self){
    $('select[name="tuningPresets"]').change(evt => { //TODO: Spinners!
        if(evt.target.selectedIndex>0){
            var data = $('option:selected', evt.target).data('data');
            var preset_body = new ReleaseChecker(data['name'], data['download_url']);
            preset_body.loadReleaseData(preset_file_data => {
                self._drawPresetFileData(preset_file_data);
            });
            //TODO: handle realtime + offline
            var average_stars = $('option:selected', evt.target).data('stars_average');
            self._setStars($('div.presetRating'),average_stars);
            //TODO: fetch according to scrollbar
            //use a template for the event
            //hide based on reporting
            //CSS
            var review_refs = $('option:selected', evt.target).data('reviews');
            self._drawReviews(self,review_refs);
            if(firebase.auth().currentUser){
                firebase.database().ref(`/users/${firebase.auth().currentUser.uid}`)
                    .once('value')
                    .then(user_ss => {
                        //TODO: check for null results
                        var user_reviews = user_ss.val().reviews;
                        $('textarea.reviewText').data('pilot_handle',user_ss.val().pilot_handle);
                        // Check against preset file existing in github without entry in firebase
                        var preset_reviews;
                        if($('option:selected', evt.target).data('reviews')){
                            preset_reviews = Object.keys($('option:selected', evt.target).data('reviews'));
                        } else {
                            preset_reviews = [];
                        }
                        var user_preset_review = null;
                        for (const preset_review of preset_reviews) {
                            if(preset_review in user_reviews){
                                user_preset_review = preset_review;
                                break;
                            }
                        }
                        var rating_button_class =  user_preset_review ? 'updateRating' : 'newRating';
                        self._drawSubmitBtn(self,rating_button_class,user_preset_review);
                        var user_rating;
                        var user_review_body=false;
                        if(user_preset_review){
                            firebase.database().ref(`/reviews/${user_preset_review}`).once('value').then(review_ss => {
                                user_rating = review_ss.val().stars;
                                self._setStars($(`div.presetReviewBox .submit_btn.${rating_button_class}`),user_rating);
                                user_review_body = review_ss.val().body;
                                self._drawUserReview(user_review_body);
                            });
                        }
                        //TODO: i18n
                        $(`div.presetReviewBox .submit_btn.${rating_button_class} span.fa-star`).each(function(index){
                            $(this).hover(
                                () => {
                                    self._setStars($(`div.presetReviewBox .submit_btn.${rating_button_class}`),index+1);
                                },
                                () => {
                                    if(user_rating){
                                        self._setStars($(`div.presetReviewBox .submit_btn.${rating_button_class}`),user_rating);
                                    } else {
                                        self._setStars($(`div.presetReviewBox .submit_btn.${rating_button_class}`),0);
                                    }
                                }
                            );
                            $(this).click(() => {
                                //TODO: i18n
                                self._submitReview(self,rating_button_class);
                            });
                        });
                        $('div.presetReviewBox .bottomarea textarea').attr('disabled', false);
                        $('div.presetReviewBox .bottomarea textarea').prop('placeholder', 'Write your review here. What did you like the most? What did you like the least?');
                    },error => {
                        console.log(error);
                    });
            } else {
                self._drawSubmitBtn(self);
            }
        }
    });

    $('a.loadPreset').click(() => {
        var preset = $('div.presetBody .bottomarea')[0].innerText;
        if (preset){
            var filterTypeToVal = function (type){
                switch (type){
                    case 'PT1':
                        return 0;
                    case 'BIQUAD':
                        return 1;
                    case 'FIR':
                        return 2;
                }
            };
            var camelize = function(str) {
                return str.replace(/-([a-z])|_([a-z])|\s([a-z])/g, (letter, index) => {
                    return index == 0 ? letter.toLowerCase() : letter.toUpperCase();
                }).replace(/\s+|-|_/g, '').replace(/Hz$/g,'Frequency');
            };
            var setControlValue = function (lines){
                lines.forEach(line => {
                    var filterSuffixed = camelize(line.command);
                    var suffix = line.command.match(/.*_(.*)$/)[1];
                    switch (suffix){
                        case 'type':
                            $(`.pid_filter select[name="${filterSuffixed}"]`).val(filterTypeToVal(line.value));
                            break;
                        default:
                            var enabled = filterSuffixed.replace('Frequency','Enabled');
                            $(`input[id="${enabled}"]`).prop('checked', line.value != 0).change();
                            if(filterSuffixed == 'dtermNotchFrequency'){
                                filterSuffixed = 'dTermNotchFrequency';
                            } else if(filterSuffixed == 'dtermNotchCutoff'){
                                filterSuffixed = 'dTermNotchCutoff';
                            }
                            $(`.pid_filter input[name="${filterSuffixed}"]`).val(line.value);
                            console.log(filterSuffixed);
                            console.log(line.value);
                            break;
                    }
                });
            };
            var matchGroups;
            var commands = [];
            var re = new RegExp('^set\\s+(\\S+?)\\s*=\\s*(\\S[^=]*?)$','igm');
            while ((matchGroups = re.exec(preset)) !== null){
                commands.push({'command':matchGroups[1],'value':matchGroups[2].trim()});
            }
            setControlValue(commands);
        }
    });

    $('a.signin').click(() => {
        self.authenticate(self);
    });
};

FpvPresets.prototype.processHtml = function(option=false){
    var self = this;
    $.get('./plugins/fpvpresets/html/filter_presets.html', html => {
        $('div.pidtuningpreset').remove();
        $('div.subtab-filter div.note.topspacer').after(html);
        i18n.localizePage();
        self._presetLoader(self,self._populatePresets);
        if(option){
            $('select[name="tuningPresets"]').val(option).change();
        }
        self._eventHandlers(self);
    });
};

FpvPresets._inject = function(tab,object_name,injection_point,strip_header=true){
    var temp = tab.initialize.toString();
    if(strip_header){
        temp = temp.replace('function (callback)','');
    }
    temp = temp.replace(
        injection_point,
        `self.${object_name} = new FpvPresets();
        self.${object_name}.processHtml();
        ${injection_point}`
    );
    tab.initialize = new Function('callback',temp);
};

firebase.initializeApp(firebase_config);
FpvPresets._inject(TABS.pid_tuning,'fpvPresets','GUI.content_ready(callback);');