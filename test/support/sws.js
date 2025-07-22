const { Writable } = require('node:stream')

class SlowWriteStream extends Writable {
  _write (chunk, encoding, callback) {
    setTimeout(callback, 1000)
  }
}

module.exports = SlowWriteStream
