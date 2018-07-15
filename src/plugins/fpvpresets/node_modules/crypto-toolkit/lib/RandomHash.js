var _crypto = require('crypto');
var _hash = require('./Hash')();

// generator
function _frontend(hashtype, defaultOutputType){
    return function(outputType){
        // generate random input
        var input = _crypto.randomBytes(514);

        // calculate the hash
        return _hash.hash(input, hashtype, outputType || defaultOutputType);
    }
}

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
        whirlpool: _frontend('whirlpool', outputType)
    }
};