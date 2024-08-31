
var Buffer = require('safe-buffer').Buffer
var finalhandler = require('..')
var http = require('http')

var http2

try {
  http2 = require('http2')
} catch (_err) {
  // Nothing
}

var utils = require('./support/utils')

var assert = utils.assert
var createError = utils.createError
var createHTTPServer = utils.createHTTPServer
var createHTTP2Server = utils.createHTTP2Server
var createSlowWriteStream = utils.createSlowWriteStream
var rawrequest = utils.rawrequest
var rawrequestHTTP2 = utils.rawrequestHTTP2
var request = utils.request
var shouldHaveStatusMessage = utils.shouldHaveStatusMessage
var shouldNotHaveBody = utils.shouldNotHaveBody
var shouldNotHaveHeader = utils.shouldNotHaveHeader

var topDescribe = function (type, createServer) {
  var wrapper = function wrapper (req) {
    if (type === 'http2') {
      return req.http2()
    }

    return req
  }

  describe('headers', function () {
    it('should ignore err.headers without status code', function (done) {
      wrapper(request(createServer(createError('oops!', {
        headers: { 'X-Custom-Header': 'foo' }
      })))
        .get('/'))
        .expect(shouldNotHaveHeader('X-Custom-Header'))
        .expect(500, done)
    })

    it('should ignore err.headers with invalid res.status', function (done) {
      wrapper(request(createServer(createError('oops!', {
        headers: { 'X-Custom-Header': 'foo' },
        status: 601
      })))
        .get('/'))
        .expect(shouldNotHaveHeader('X-Custom-Header'))
        .expect(500, done)
    })

    it('should ignore err.headers with invalid res.statusCode', function (done) {
      wrapper(request(createServer(createError('oops!', {
        headers: { 'X-Custom-Header': 'foo' },
        statusCode: 601
      })))
        .get('/'))
        .expect(shouldNotHaveHeader('X-Custom-Header'))
        .expect(500, done)
    })

    it('should include err.headers with err.status', function (done) {
      wrapper(request(createServer(createError('oops!', {
        headers: { 'X-Custom-Header': 'foo=500', 'X-Custom-Header2': 'bar' },
        status: 500
      })))
        .get('/'))
        .expect('X-Custom-Header', 'foo=500')
        .expect('X-Custom-Header2', 'bar')
        .expect(500, done)
    })

    it('should include err.headers with err.statusCode', function (done) {
      wrapper(request(createServer(createError('too many requests', {
        headers: { 'Retry-After': '5' },
        statusCode: 429
      })))
        .get('/'))
        .expect('Retry-After', '5')
        .expect(429, done)
    })

    it('should ignore err.headers when not an object', function (done) {
      wrapper(request(createServer(createError('oops!', {
        headers: 'foobar',
        statusCode: 500
      })))
        .get('/'))
        .expect(500, done)
    })
  })

  describe('status code', function () {
    it('should 404 on no error', function (done) {
      wrapper(request(createServer())
        .get('/'))
        .expect(404, done)
    })

    it('should 500 on error', function (done) {
      wrapper(request(createServer(createError()))
        .get('/'))
        .expect(500, done)
    })

    it('should use err.statusCode', function (done) {
      wrapper(request(createServer(createError('nope', {
        statusCode: 400
      })))
        .get('/'))
        .expect(400, done)
    })

    it('should ignore non-error err.statusCode code', function (done) {
      wrapper(request(createServer(createError('created', {
        statusCode: 201
      })))
        .get('/'))
        .expect(500, done)
    })

    it('should ignore non-numeric err.statusCode', function (done) {
      wrapper(request(createServer(createError('oops', {
        statusCode: 'oh no'
      })))
        .get('/'))
        .expect(500, done)
    })

    it('should use err.status', function (done) {
      wrapper(request(createServer(createError('nope', {
        status: 400
      })))
        .get('/'))
        .expect(400, done)
    })

    it('should use err.status over err.statusCode', function (done) {
      wrapper(request(createServer(createError('nope', {
        status: 400,
        statusCode: 401
      })))
        .get('/'))
        .expect(400, done)
    })

    it('should set status to 500 when err.status < 400', function (done) {
      wrapper(request(createServer(createError('oops', {
        status: 202
      })))
        .get('/'))
        .expect(500, done)
    })

    it('should set status to 500 when err.status > 599', function (done) {
      wrapper(request(createServer(createError('oops', {
        status: 601
      })))
        .get('/'))
        .expect(500, done)
    })

    it('should use err.statusCode over invalid err.status', function (done) {
      wrapper(request(createServer(createError('nope', {
        status: 50,
        statusCode: 410
      })))
        .get('/'))
        .expect(410, done)
    })

    it('should ignore non-error err.status code', function (done) {
      wrapper(request(createServer(createError('created', {
        status: 201
      })))
        .get('/'))
        .expect(500, done)
    })

    it('should ignore non-numeric err.status', function (done) {
      wrapper(request(createServer(createError('oops', {
        status: 'oh no'
      })))
        .get('/'))
        .expect(500, done)
    })
  })

  // http2 does not support status message
  var describeStatusMessage = !/statusMessage/.test(http.IncomingMessage.toString()) || type === 'http2'
    ? describe.skip
    : describe

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
    it('should include method and pathname', function (done) {
      wrapper(request(createServer())
        .get('/foo'))
        .expect(404, /<pre>Cannot GET \/foo<\/pre>/, done)
    })

    it('should escape method and pathname characters', function (done) {
      (type === 'http2' ? rawrequestHTTP2 : rawrequest)(createServer())
        .get('/<la\'me>')
        .expect(404, /<pre>Cannot GET \/%3Cla&#39;me%3E<\/pre>/, done)
    })

    it('should fallback to generic pathname without URL', function (done) {
      var server = createServer(function (req, res, next) {
        req.url = undefined
        next()
      })

      wrapper(request(server)
        .get('/foo'))
        .expect(404, /<pre>Cannot GET resource<\/pre>/, done)
    })

    it('should include original pathname', function (done) {
      var server = createServer(function (req, res, next) {
        var parts = req.url.split('/')
        req.originalUrl = req.url
        req.url = '/' + parts.slice(2).join('/')
        next()
      })

      wrapper(request(server)
        .get('/foo/bar'))
        .expect(404, /<pre>Cannot GET \/foo\/bar<\/pre>/, done)
    })

    it('should include pathname only', function (done) {
      (type === 'http2' ? rawrequestHTTP2 : rawrequest)(createServer())
        .get('http://localhost/foo?bar=1')
        .expect(404, /<pre>Cannot GET \/foo<\/pre>/, done)
    })

    it('should handle HEAD', function (done) {
      wrapper(request(createServer())
        .head('/foo'))
        .expect(404)
        .expect(shouldNotHaveBody())
        .end(done)
    })

    it('should include X-Content-Type-Options header', function (done) {
      wrapper(request(createServer())
        .get('/foo'))
        .expect('X-Content-Type-Options', 'nosniff')
        .expect(404, done)
    })

    it('should include Content-Security-Policy header', function (done) {
      wrapper(request(createServer())
        .get('/foo'))
        .expect('Content-Security-Policy', "default-src 'none'")
        .expect(404, done)
    })

    it('should not hang/error if there is a request body', function (done) {
      var buf = Buffer.alloc(1024 * 16, '.')
      var server = createServer()
      var test = wrapper(request(server).post('/foo'))
      test.write(buf)
      test.write(buf)
      test.write(buf)
      test.expect(404, done)
    })
  })

  describe('error response', function () {
    it('should include error stack', function (done) {
      wrapper(request(createServer(createError('boom!')))
        .get('/foo'))
        .expect(500, /<pre>Error: boom!<br> &nbsp; &nbsp;at/, done)
    })

    it('should handle HEAD', function (done) {
      wrapper(request(createServer(createError('boom!')))
        .head('/foo'))
        .expect(500)
        .expect(shouldNotHaveBody())
        .end(done)
    })

    it('should include X-Content-Type-Options header', function (done) {
      wrapper(request(createServer(createError('boom!')))
        .get('/foo'))
        .expect('X-Content-Type-Options', 'nosniff')
        .expect(500, done)
    })

    it('should includeContent-Security-Policy header', function (done) {
      wrapper(request(createServer(createError('boom!')))
        .get('/foo'))
        .expect('Content-Security-Policy', "default-src 'none'")
        .expect(500, done)
    })

    it('should handle non-error-objects', function (done) {
      wrapper(request(createServer('lame string'))
        .get('/foo'))
        .expect(500, /<pre>lame string<\/pre>/, done)
    })

    it('should handle null prototype objects', function (done) {
      wrapper(request(createServer(Object.create(null)))
        .get('/foo'))
        .expect(500, /<pre>Internal Server Error<\/pre>/, done)
    })

    it('should send staus code name when production', function (done) {
      var err = createError('boom!', {
        status: 501
      })
      wrapper(request(createServer(err, {
        env: 'production'
      }))
        .get('/foo'))
        .expect(501, /<pre>Not Implemented<\/pre>/, done)
    })

    describe('when there is a request body', function () {
      it('should not hang/error when unread', function (done) {
        var buf = Buffer.alloc(1024 * 16, '.')
        var server = createServer(new Error('boom!'))
        var test = wrapper(request(server).post('/foo'))
        test.write(buf)
        test.write(buf)
        test.write(buf)
        test.expect(500, done)
      })

      it('should not hang/error when actively piped', function (done) {
        var buf = Buffer.alloc(1024 * 16, '.')
        var server = createServer(function (req, res, next) {
          req.pipe(stream)
          process.nextTick(function () {
            next(new Error('boom!'))
          })
        })
        var stream = createSlowWriteStream()
        var test = wrapper(request(server).post('/foo'))
        test.write(buf)
        test.write(buf)
        test.write(buf)
        test.expect(500, done)
      })

      it('should not hang/error when read', function (done) {
        var buf = Buffer.alloc(1024 * 16, '.')
        var server = createServer(function (req, res, next) {
          // read off the request
          req.once('end', function () {
            next(new Error('boom!'))
          })
          req.resume()
        })
        var test = wrapper(request(server).post('/foo'))
        test.write(buf)
        test.write(buf)
        test.write(buf)
        test.expect(500, done)
      })
    })

    describe('when res.statusCode set', function () {
      it('should keep when >= 400', function (done) {
        var server = createServer(function (req, res) {
          var done = finalhandler(req, res)
          res.statusCode = 503
          done(new Error('oops'))
        })

        wrapper(request(server)
          .get('/foo'))
          .expect(503, done)
      })

      it('should convert to 500 is not a number', function (done) {
        // http2 does not support non numeric status code
        if (type === 'http2') {
          done()
          return
        }

        var server = createServer(function (req, res) {
          var done = finalhandler(req, res)
          res.statusCode = 'oh no'
          done(new Error('oops'))
        })

        wrapper(request(server)
          .get('/foo'))
          .expect(500, done)
      })

      it('should override with err.status', function (done) {
        var server = createServer(function (req, res) {
          var done = finalhandler(req, res)
          var err = createError('oops', {
            status: 414,
            statusCode: 503
          })
          done(err)
        })

        wrapper(request(server)
          .get('/foo'))
          .expect(414, done)
      })

      it('should default body to status message in production', function (done) {
        var err = createError('boom!', {
          status: 509
        })
        wrapper(request(createServer(err, {
          env: 'production'
        }))
          .get('/foo'))
          .expect(509, /<pre>Bandwidth Limit Exceeded<\/pre>/, done)
      })
    })

    describe('when res.statusCode undefined', function () {
      it('should set to 500', function (done) {
        // http2 does not support non numeric status code
        if (type === 'http2') {
          done()
          return
        }

        var server = createServer(function (req, res) {
          var done = finalhandler(req, res)
          res.statusCode = undefined
          done(new Error('oops'))
        })

        wrapper(request(server)
          .get('/foo'))
          .expect(500, done)
      })
    })
  })

  describe('headers set', function () {
    it('should persist set headers', function (done) {
      var server = createServer(function (req, res) {
        var done = finalhandler(req, res)
        res.setHeader('Server', 'foobar')
        done()
      })

      wrapper(request(server)
        .get('/foo'))
        .expect(404)
        .expect('Server', 'foobar')
        .end(done)
    })

    it('should override content-type and length', function (done) {
      var server = createServer(function (req, res) {
        var done = finalhandler(req, res)
        res.setHeader('Content-Type', 'image/png')
        res.setHeader('Content-Length', '50')
        done()
      })

      wrapper(request(server)
        .get('/foo'))
        .expect(404)
        .expect('Content-Type', 'text/html; charset=utf-8')
        .expect('Content-Length', '142')
        .end(done)
    })

    it('should remove other content headers', function (done) {
      var server = createServer(function (req, res) {
        var done = finalhandler(req, res)
        res.setHeader('Content-Encoding', 'gzip')
        res.setHeader('Content-Language', 'jp')
        res.setHeader('Content-Range', 'bytes 0-2/10')
        done()
      })

      wrapper(request(server)
        .get('/foo'))
        .expect(404)
        .expect(shouldNotHaveHeader('Content-Encoding'))
        .expect(shouldNotHaveHeader('Content-Language'))
        .expect(shouldNotHaveHeader('Content-Range'))
        .end(done)
    })
  })

  describe('request started', function () {
    it('should not respond', function (done) {
      var server = createServer(function (req, res) {
        var done = finalhandler(req, res)
        res.statusCode = 301
        res.write('0')
        process.nextTick(function () {
          done()
          res.end('1')
        })
      })

      wrapper(request(server)
        .get('/foo'))
        .expect(301, '01', done)
    })

    it('should terminate on error', function (done) {
      var server = createServer(function (req, res) {
        var done = finalhandler(req, res)
        res.statusCode = 301
        res.write('0')
        process.nextTick(function () {
          done(createError('too many requests', {
            status: 429,
            headers: { 'Retry-After': '5' }
          }))
          res.end('1')
        })
      })

      wrapper(request(server)
        .get('/foo'))
        .on('request', function onrequest (test) {
          test.req.on('response', function onresponse (res) {
            if (res.listeners('error').length > 0) {
              // forward aborts as errors for supertest
              res.on('aborted', function onabort () {
                res.emit('error', new Error('aborted'))
              })
            }
          })
        })
        .end(function (err) {
          if (err && err.message !== 'aborted') return done(err)
          assert.strictEqual(this.res.statusCode, 301)
          assert.strictEqual(this.res.text, '0')
          done()
        })
    })
  })

  describe('onerror', function () {
    it('should be invoked when error', function (done) {
      var err = new Error('boom!')
      var error

      function log (e) {
        error = e
      }

      wrapper(request(createServer(err, { onerror: log }))
        .get('/'))
        .end(function () {
          assert.equal(error, err)
          done()
        })
    })
  })

  if (parseInt(process.version.split('.')[0].replace(/^v/, ''), 10) > 11) {
    describe('req.socket', function () {
      it('should not throw when socket is null', function (done) {
        wrapper(request(createServer(function (req, res, next) {
          res.statusCode = 200
          res.end('ok')
          process.nextTick(function () {
            req.socket = null
            next(new Error())
          })
        }))
          .get('/'))
          .expect(200)
          .end(function (err) {
            done(err)
          })
      })
    })
  }

  describe('no deprecation warnings', function () {
    it('should respond 404 on no error', function (done) {
      var warned = false

      process.once('warning', function (warning) {
        if (/The http2 module is an experimental API/.test(warning)) return
        assert.fail(warning)
      })

      wrapper(request(createServer())
        .head('/foo'))
        .expect(404)
        .end(function (err) {
          assert.strictEqual(warned, false)
          done(err)
        })
    })

    it('should respond 500 on error', function (done) {
      var warned = false

      process.once('warning', function (warning) {
        if (/The http2 module is an experimental API/.test(warning)) return
        assert.fail(warning)
      })

      var err = createError()

      wrapper(request(createServer(function (req, res) {
        var done = finalhandler(req, res)

        if (typeof err === 'function') {
          err(req, res, done)
          return
        }

        done(err)
      }))
        .head('/foo'))
        .expect(500)
        .end(function (err, res) {
          assert.strictEqual(warned, false)
          done(err)
        })
    })
  })
}

var servers = [
  ['http', createHTTPServer]
]

var nodeVersion = process.versions.node.split('.').map(Number)

// `superagent` only supports `http2` since Node.js@10
if (http2 && nodeVersion[0] >= 10) {
  servers.push(['http2', createHTTP2Server])
}

for (var i = 0; i < servers.length; i++) {
  var tests = topDescribe.bind(undefined, servers[i][0], servers[i][1])

  describe(servers[i][0], tests)
}
