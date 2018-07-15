var _crypto = require('crypto');

// generic string hashing
function hash(input, algo, type){
    // string or buffer input ? => keep it
    if (typeof input !== 'string' && !(input instanceof Buffer)){
        input = JSON.stringify(input);
    }

    // create hash algo
    var sum = _crypto.createHash(algo);

    // set content
    sum.update(input);

    // binary output ?
    if (type && type.toLowerCase().trim() == 'binary'){
        // calculate hashsum
        return sum.digest();

    // base 64 urlsafe ?
    }else if (type==='base64-urlsafe'){
        return base64urlsafe(sum.digest('base64'));

    // string output
    }else{
        // calculate hashsum
        return sum.digest(type);
    }
}

// create a base64 url-safe hash (escape some chars)
function base64urlsafe(hash){
    // replace some chars
    hash = hash.replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '');

    return hash;
}

// generator
function _frontend(hashtype, defaultOutputType){
    return function(input, outputType){
        return hash(input, hashtype, outputType || defaultOutputType);
    }
}

// export all function
module.exports = function(outputType){
    // default value
    outputType = outputType || 'hex';

    // create the user frontend functions
    return {
        md5:    _frontend('md5', outputType),
        sha1:   _frontend('sha1', outputType),
        sha2:   _frontend('sha256', outputType),
        sha224: _frontend('sha224', outputType),
        sha256: _frontend('sha256', outputType),
        sha384: _frontend('sha384', outputType),
        sha512: _frontend('sha512', outputType),
        whirlpool: _frontend('whirlpool', outputType),

        // generic frontend
        hash: hash
    }
};
