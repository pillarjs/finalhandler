
var assert = require('assert')
var finalhandler = require('..')
var http = require('http')
var request = require('supertest')
var stream = require('readable-stream')
var util = require('util')

var describeStatusMessage = !/statusMessage/.test(http.IncomingMessage.toString())
  ? describe.skip
  : describe

describe('finalhandler(req, res)', function () {
  describe('headers', function () {
    it('should ignore err.headers without status code', function (done) {
      request(createServer(createError('oops!', {
        headers: {'X-Custom-Header': 'foo'}
      })))
      .get('/')
      .expect(shouldNotHaveHeader('X-Custom-Header'))
      .expect(500, done)
    })

    it('should ignore err.headers with invalid res.status', function (done) {
      request(createServer(createError('oops!', {
        headers: {'X-Custom-Header': 'foo'},
        status: 601
      })))
      .get('/')
      .expect(shouldNotHaveHeader('X-Custom-Header'))
      .expect(500, done)
    })

    it('should ignore err.headers with invalid res.statusCode', function (done) {
      request(createServer(createError('oops!', {
        headers: {'X-Custom-Header': 'foo'},
        statusCode: 601
      })))
      .get('/')
      .expect(shouldNotHaveHeader('X-Custom-Header'))
      .expect(500, done)
    })

    it('should include err.headers with err.status', function (done) {
      request(createServer(createError('oops!', {
        headers: {'X-Custom-Header': 'foo=500', 'X-Custom-Header2': 'bar'},
        status: 500
      })))
      .get('/')
      .expect('X-Custom-Header', 'foo=500')
      .expect('X-Custom-Header2', 'bar')
      .expect(500, done)
    })

    it('should include err.headers with err.statusCode', function (done) {
      request(createServer(createError('too many requests', {
        headers: {'Retry-After': '5'},
        statusCode: 429
      })))
      .get('/')
      .expect('Retry-After', '5')
      .expect(429, done)
    })
  })

  describe('status code', function () {
    it('should 404 on no error', function (done) {
      request(createServer())
      .get('/')
      .expect(404, done)
    })

    it('should 500 on error', function (done) {
      request(createServer(createError()))
      .get('/')
      .expect(500, done)
    })

    it('should use err.statusCode', function (done) {
      request(createServer(createError('nope', {
        statusCode: 400
      })))
      .get('/')
      .expect(400, done)
    })

    it('should use err.status', function (done) {
      request(createServer(createError('nope', {
        status: 400
      })))
      .get('/')
      .expect(400, done)
    })

    it('should use err.status over err.statusCode', function (done) {
      request(createServer(createError('nope', {
        status: 400,
        statusCode: 401
      })))
      .get('/')
      .expect(400, done)
    })

    it('should set status to 500 when err.status < 400', function (done) {
      request(createServer(createError('oops', {
        status: 202
      })))
      .get('/')
      .expect(500, done)
    })

    it('should set status to 500 when err.status > 599', function (done) {
      request(createServer(createError('oops', {
        status: 601
      })))
      .get('/')
      .expect(500, done)
    })
  })

  describeStatusMessage('status message', function () {
    it('should be "Not Found" on no error', function (done) {
      request(createServer())
      .get('/')
      .expect(shouldHaveStatusMessage('Not Found'))
      .expect(404, done)
    })

    it('should be "Internal Server Error" on error', function (done) {
      request(createServer(createError()))
      .get('/')
      .expect(shouldHaveStatusMessage('Internal Server Error'))
      .expect(500, done)
    })

    it('should be "Bad Request" when err.statusCode = 400', function (done) {
      request(createServer(createError('oops', {
        status: 400
      })))
      .get('/')
      .expect(shouldHaveStatusMessage('Bad Request'))
      .expect(400, done)
    })

    it('should reset existing res.statusMessage', function (done) {
      function onRequest (req, res, next) {
        res.statusMessage = 'An Error Occurred'
        next(new Error())
      }

      request(createServer(onRequest))
      .get('/')
      .expect(shouldHaveStatusMessage('Internal Server Error'))
      .expect(500, done)
    })
  })

  describe('404 response', function () {
    it('include method and path', function (done) {
      request(createServer())
      .get('/foo')
      .expect(404, 'Cannot GET /foo\n', done)
    })

    it('should handle HEAD', function (done) {
      request(createServer())
      .head('/foo')
      .expect(404, '', done)
    })

    it('should include security header', function (done) {
      request(createServer())
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
  })

  describe('error response', function () {
    it('should include error stack', function (done) {
      request(createServer(createError('boom!')))
      .get('/foo')
      .expect(500, /^Error: boom!<br> &nbsp; &nbsp;at/, done)
    })

    it('should handle HEAD', function (done) {
      request(createServer())
      .head('/foo')
      .expect(404, '', done)
    })

    it('should include security header', function (done) {
      request(createServer(createError('boom!')))
      .get('/foo')
      .expect('X-Content-Type-Options', 'nosniff')
      .expect(500, done)
    })

    it('should handle non-error-objects', function (done) {
      request(createServer('lame string'))
      .get('/foo')
      .expect(500, 'lame string\n', done)
    })

    it('should send staus code name when production', function (done) {
      var err = createError('boom!', {
        status: 501
      })
      request(createServer(err, {
        env: 'production'
      }))
      .get('/foo')
      .expect(501, 'Not Implemented\n', done)
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

    describe('when res.statusCode set', function () {
      it('should keep when >= 400', function (done) {
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
          var err = createError('oops', {
            status: 414,
            statusCode: 503
          })
          done(err)
        })

        request(server)
        .get('/foo')
        .expect(414, done)
      })

      it('should default body to status message in production', function (done) {
        var err = createError('boom!', {
          status: 509
        })
        request(createServer(err, {
          env: 'production'
        }))
        .get('/foo')
        .expect(509, 'Bandwidth Limit Exceeded\n', done)
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
          done(createError('too many requests', {
            status: 429,
            headers: {'Retry-After': '5'}
          }))
          res.end('1')
        })
      })

      request(server)
      .get('/foo')
      .expect(301, '0', done)
    })
  })

  describe('onerror', function () {
    it('should be invoked when error', function (done) {
      var err = new Error('boom!')
      var error

      function log (e) {
        error = e
      }

      request(createServer(err, {onerror: log}))
      .get('/')
      .end(function () {
        assert.equal(error, err)
        done()
      })
    })
  })
})

function createError (message, props) {
  var err = new Error(message)

  if (props) {
    for (var prop in props) {
      err[prop] = props[prop]
    }
  }

  return err
}

function createServer (err, opts) {
  return http.createServer(function (req, res) {
    var done = finalhandler(req, res, opts)

    if (typeof err === 'function') {
      err(req, res, done)
      return
    }

    done(err)
  })
}

function createSlowWriteStream () {
  return new SlowWriteStream()
}

function shouldHaveStatusMessage (statusMessage) {
  return function (test) {
    assert.equal(test.res.statusMessage, statusMessage, 'should have statusMessage "' + statusMessage + '"')
  }
}

function shouldNotHaveHeader (header) {
  return function (test) {
    assert.ok(test.res.headers[header] === undefined, 'response does not have header "' + header + '"')
  }
}

function SlowWriteStream () {
  stream.Writable.call(this)
}

util.inherits(SlowWriteStream, stream.Writable)

SlowWriteStream.prototype._write = function _write (chunk, encoding, callback) {
  setTimeout(callback, 1000)
}
