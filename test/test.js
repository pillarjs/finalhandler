
var assert = require('assert')
var finalhandler = require('..')
var http = require('http')
var request = require('supertest')
var stream = require('readable-stream')
var util = require('util')

describe('finalhandler(req, res)', function () {
  describe('status code', function () {
    it('should 404 on no error', function (done) {
      var server = createServer()
      request(server)
      .get('/')
      .expect(404, done)
    })

    it('should 500 on error', function (done) {
      var server = createServer(new Error())
      request(server)
      .get('/')
      .expect(500, done)
    })

    it('should use err.statusCode', function (done) {
      var err = new Error()
      err.statusCode = 400
      var server = createServer(err)
      request(server)
      .get('/')
      .expect(400, done)
    })

    it('should ignore non-error err.statusCode code', function (done) {
      var err = new Error()
      err.statusCode = 201
      var server = createServer(err)
      request(server)
      .get('/')
      .expect(500, done)
    })

    it('should ignore weird err.statusCode', function (done) {
      var err = new Error()
      err.statusCode = 'oh no'
      var server = createServer(err)
      request(server)
      .get('/')
      .expect(500, done)
    })

    it('should use err.status', function (done) {
      var err = new Error()
      err.status = 400
      var server = createServer(err)
      request(server)
      .get('/')
      .expect(400, done)
    })

    it('should ignore non-error err.status code', function (done) {
      var err = new Error()
      err.status = 201
      var server = createServer(err)
      request(server)
      .get('/')
      .expect(500, done)
    })

    it('should ignore weird err.status', function (done) {
      var err = new Error()
      err.status = 'oh no'
      var server = createServer(err)
      request(server)
      .get('/')
      .expect(500, done)
    })

    it('should use err.status over err.statusCode', function (done) {
      var err = new Error()
      err.status = 400
      err.statusCode = 401
      var server = createServer(err)
      request(server)
      .get('/')
      .expect(400, done)
    })
  })

  describe('404 response', function () {
    it('should include method and path', function (done) {
      var server = createServer()
      request(server)
      .get('/foo')
      .expect(404, /Cannot GET \/foo/, done)
    })

    it('should handle HEAD', function (done) {
      var server = createServer()
      request(server)
      .head('/foo')
      .expect(404, '', done)
    })

    it('should include security header', function (done) {
      var server = createServer()
      request(server)
      .get('/foo')
      .expect('X-Content-Type-Options', 'nosniff')
      .expect(404, done)
    })

    it('should not hang/error if there is a request body', function (done) {
      var buf = new Buffer(1024 * 16)
      var server = createServer()
      var test = request(server).post('/foo')
      buf.fill('.')
      test.write(buf)
      test.write(buf)
      test.write(buf)
      test.expect(404, done)
    })

    describe('when HTML acceptable', function () {
      it('should respond with HTML', function (done) {
        var server = createServer()
        request(server)
        .get('/foo')
        .set('Accept', 'text/html')
        .expect('Content-Type', 'text/html; charset=utf-8')
        .expect(404, /<html/, done)
      })
    })

    describe('when HTML not acceptable', function () {
      it('should respond with plain text', function (done) {
        var server = createServer()
        request(server)
        .get('/foo')
        .set('Accept', 'application/x-bogus')
        .expect('Content-Type', 'text/plain; charset=utf-8')
        .expect(404, 'Cannot GET /foo\n', done)
      })
    })
  })

  describe('error response', function () {
    it('should not include stack trace', function (done) {
      var server = createServer(new Error('boom!'))
      request(server)
      .get('/foo')
      .expect(bodyShouldNotContain('boom!'))
      .expect(500, /Internal Server Error/, done)
    })

    it('should handle HEAD', function (done) {
      var server = createServer(new Error('boom!'))
      request(server)
      .head('/foo')
      .expect(500, '', done)
    })

    it('should include security header', function (done) {
      var server = createServer(new Error('boom!'))
      request(server)
      .get('/foo')
      .expect('X-Content-Type-Options', 'nosniff')
      .expect(500, done)
    })

    describe('when there is a request body', function () {
      it('should not hang/error when unread', function (done) {
        var buf = new Buffer(1024 * 16)
        var server = createServer(new Error('boom!'))
        var test = request(server).post('/foo')
        buf.fill('.')
        test.write(buf)
        test.write(buf)
        test.write(buf)
        test.expect(500, done)
      })

      it('should not hang/error when actively piped', function (done) {
        var buf = new Buffer(1024 * 16)
        var server = createServer(function (req, res, next) {
          req.pipe(stream)
          process.nextTick(function () {
            next(new Error('boom!'))
          })
        })
        var stream = createSlowWriteStream()
        var test = request(server).post('/foo')
        buf.fill('.')
        test.write(buf)
        test.write(buf)
        test.write(buf)
        test.expect(500, done)
      })

      it('should not hang/error when read', function (done) {
        var buf = new Buffer(1024 * 16)
        var server = createServer(function (req, res, next) {
          // read off the request
          req.once('end', function () {
            next(new Error('boom!'))
          })
          req.resume()
        })
        var test = request(server).post('/foo')
        buf.fill('.')
        test.write(buf)
        test.write(buf)
        test.write(buf)
        test.expect(500, done)
      })
    })

    describe('when HTML acceptable', function () {
      it('should respond with HTML', function (done) {
        var server = createServer(new Error('boom!'))
        request(server)
        .get('/foo')
        .set('Accept', 'text/html')
        .expect('Content-Type', 'text/html; charset=utf-8')
        .expect(500, /<html/, done)
      })
    })

    describe('when HTML not acceptable', function () {
      it('should respond with plain text', function (done) {
        var server = createServer(new Error('boom!'))
        request(server)
        .get('/foo')
        .set('Accept', 'application/x-bogus')
        .expect('Content-Type', 'text/plain; charset=utf-8')
        .expect(500, 'Internal Server Error\n', done)
      })
    })

    describe('when res.statusCode set', function () {
      it('should keep when > 400', function (done) {
        var server = http.createServer(function (req, res) {
          var done = finalhandler(req, res)
          res.statusCode = 503
          done(new Error('oops'))
        })

        request(server)
        .get('/foo')
        .expect(503, done)
      })

      it('should override with err.status', function (done) {
        var server = http.createServer(function (req, res) {
          var done = finalhandler(req, res)
          var err = new Error('oops')
          res.statusCode = 503
          err.status = 414
          done(err)
        })

        request(server)
        .get('/foo')
        .expect(414, done)
      })
    })

    describe('when res.statusCode undefined', function () {
      it('should set to 500', function (done) {
        var server = http.createServer(function (req, res) {
          var done = finalhandler(req, res)
          res.statusCode = undefined
          done(new Error('oops'))
        })

        request(server)
        .get('/foo')
        .expect(500, done)
      })
    })
  })

  describe('request started', function () {
    it('should not respond', function (done) {
      var server = http.createServer(function (req, res) {
        var done = finalhandler(req, res)
        res.statusCode = 301
        res.write('0')
        process.nextTick(function () {
          done()
          res.end('1')
        })
      })

      request(server)
      .get('/foo')
      .expect(301, '01', done)
    })

    it('should terminate on error', function (done) {
      var server = http.createServer(function (req, res) {
        var done = finalhandler(req, res)
        res.statusCode = 301
        res.write('0')
        process.nextTick(function () {
          done(new Error('boom!'))
          res.end('1')
        })
      })

      request(server)
      .get('/foo')
      .expect(301, '0', done)
    })
  })

  describe('message', function () {
    it('should reject string', function () {
      assert.throws(finalhandler.bind(null, {}, {}, {message: 'wat'}), /option message/)
    })

    it('should display error message for valid err.status', function (done) {
      var err = new Error('boom!')
      err.status = 500
      var server = createServer(err, {message: true})
      request(server)
      .get('/foo')
      .expect(500, /boom!/, done)
    })

    it('should display error message for valid err.statusCode', function (done) {
      var err = new Error('boom!')
      err.statusCode = 500
      var server = createServer(err, {message: true})
      request(server)
      .get('/foo')
      .expect(500, /boom!/, done)
    })

    it('should not display error message missing stack property', function (done) {
      var err = new Error('boom!')
      var server = createServer(err, {message: true})
      request(server)
      .get('/foo')
      .expect(bodyShouldNotContain('boom!'))
      .expect(500, /Internal Server Error/, done)
    })

    it('should not display error message for bad status property', function (done) {
      var err = new Error('boom!')
      err.status = 'oh no'
      var server = createServer(err, {message: true})
      request(server)
      .get('/foo')
      .expect(bodyShouldNotContain('boom!'))
      .expect(500, /Internal Server Error/, done)
    })

    it('should escape message for HTML response', function (done) {
      var err = new Error('<boom>!')
      err.status = 500
      var server = createServer(err, {message: true})
      request(server)
      .get('/foo')
      .set('Accept', 'text/html')
      .expect(500, /&lt;boom&gt;!/, done)
    })

    describe('when function', function () {
      it('should use custom function for message', function (done) {
        var err = new Error('boom!')
        var server = createServer(err, {message: function (err, status) {
          return 'custom ' + status + ' ' + err.message
        }})

        request(server)
        .get('/foo')
        .expect(500, /custom 500 boom!/, done)
      })

      it('should provide fallback for custom function', function (done) {
        var err = new Error('boom!')
        var server = createServer(err, {message: function (err) {
          return undefined
        }})

        request(server)
        .get('/foo')
        .expect(bodyShouldNotContain('boom!'))
        .expect(500, /Internal Server Error/, done)
      })

      it('should escape message for HTML response', function (done) {
        var err = new Error('<boom>!')
        var server = createServer(err, {message: function (err) {
          return 'custom ' + err.message
        }})

        request(server)
        .get('/foo')
        .set('Accept', 'text/html')
        .expect(500, /custom &lt;boom&gt;!/, done)
      })
    })
  })

  describe('onerror', function () {
    it('should be invoked when error', function (done) {
      var err = new Error('boom!')
      var error
      var log = function (e) { error = e }
      var server = createServer(err, {onerror: log})

      request(server)
      .get('/')
      .end(function () {
        assert.equal(error, err)
        done()
      })
    })
  })

  describe('stacktrace', function () {
    it('should include error stack', function (done) {
      var server = createServer(new Error('boom!'), {stacktrace: true})
      request(server)
      .get('/foo')
      .expect(500, /Error: boom!.*at.*:[0-9]+:[0-9]+/, done)
    })

    it('should escape error stack for HTML response', function (done) {
      var server = createServer(new Error('boom!'), {stacktrace: true})
      request(server)
      .get('/foo')
      .set('Accept', 'text/html')
      .expect(500, /Error: boom!<br> &nbsp; &nbsp;at/, done)
    })

    it('should not escape error stack for plain text response', function (done) {
      var server = createServer(new Error('boom!'), {stacktrace: true})
      request(server)
      .get('/foo')
      .set('Accept', 'application/x-bogus')
      .expect('Content-Type', 'text/plain; charset=utf-8')
      .expect(500, /Error: boom!\n    at/, done)
    })

    it('should handle non-error-objects', function (done) {
      var server = createServer('lame string', {stacktrace: true})
      request(server)
      .get('/foo')
      .set('Accept', 'text/html')
      .expect(500, /lame string/, done)
    })

    describe('when message set', function () {
      it('should use custom function for message', function (done) {
        var err = new Error('boom!')
        var server = createServer(err, {stacktrace: true, message: function (err, status) {
          return 'custom ' + status + ' ' + err.message
        }})

        request(server)
        .get('/foo')
        .expect(500, /Error: custom 500 boom!.*at.*:[0-9]+:[0-9]+/, done)
      })

      it('should provide fallback for custom function', function (done) {
        var err = new Error('boom!')
        var server = createServer(err, {stacktrace: true, message: function (err, status) {
          return undefined
        }})

        request(server)
        .get('/foo')
        .expect(500, /Error: boom!.*at.*:[0-9]+:[0-9]+/, done)
      })

      it('should handle non-error-objects', function (done) {
        var err = 'lame string'
        var server = createServer(err, {stacktrace: true, message: true})

        request(server)
        .get('/foo')
        .expect(500, /lame string/, done)
      })
    })
  })
})

function bodyShouldNotContain(str) {
  return function (res) {
    assert.ok(res.text.indexOf(str) === -1, 'should not contain "' + str + '" in body')
  }
}

function createServer(err, opts) {
  return http.createServer(function (req, res) {
    var done = finalhandler(req, res, opts)

    if (typeof err === 'function') {
      err(req, res, done)
      return
    }

    done(err)
  })
}

function createSlowWriteStream() {
  return new SlowWriteStream()
}

function SlowWriteStream() {
  stream.Writable.call(this)
}

util.inherits(SlowWriteStream, stream.Writable)

SlowWriteStream.prototype._write = function _write(chunk, encoding, callback) {
  setTimeout(callback, 1000)
}
