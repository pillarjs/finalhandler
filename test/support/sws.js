var stream = require('readable-stream')
var util = require('util')

module.exports = SlowWriteStream

function SlowWriteStream () {
  stream.Writable.call(this)
}

util.inherits(SlowWriteStream, stream.Writable)

SlowWriteStream.prototype._write = function _write (chunk, encoding, callback) {
  setTimeout(callback, 1000)
}
