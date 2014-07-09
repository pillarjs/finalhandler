
var finalhandler = require('..')
var http = require('http')
var request = require('supertest')
var should = require('should')

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

    it('should use err.status', function (done) {
      var err = new Error()
      err.status = 400
      var server = createServer(err)
      request(server)
      .get('/')
      .expect(400, done)
    })
  })

  describe('404 response', function () {
    it('should respond with HTML', function (done) {
      var server = createServer()
      request(server)
      .get('/foo')
      .expect('Content-Type', 'text/html; charset=utf-8')
      .expect(404, /<html/, done)
    })

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
  })

  describe('error response', function () {
    it('should respond with HTML', function (done) {
      var server = createServer(new Error('boom!'))
      request(server)
      .get('/foo')
      .expect('Content-Type', 'text/html; charset=utf-8')
      .expect(500, /<html/, done)
    })

    it('should include error stack', function (done) {
      var server = createServer(new Error('boom!'))
      request(server)
      .get('/foo')
      .expect(500, /Error: boom!<br> &nbsp; &nbsp;at/, done)
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

    it('should handle non-error-objects', function (done) {
      var server = createServer('lame string')
      request(server)
      .get('/foo')
      .expect(500, /lame string/, done)
    })

    it('should send staus code name when production', function (done) {
      var err = new Error('boom!')
      err.status = 501
      var server = createServer(err, {env: 'production'})
      request(server)
      .get('/foo')
      .expect(501, /Not Implemented/, function (err, res) {
        if (err) return done(err)
        should(res.text).not.match(/boom!/)
        done()
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
        process.nextTick(done)
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
      var log = function (e) { error = e }
      var server = createServer(err, {onerror: log})

      request(server)
      .get('/')
      .end(function () {
        should(error).equal(err)
        done()
      })
    })
  })
})

function createServer(err, opts) {
  return http.createServer(function (req, res) {
    var done = finalhandler(req, res, opts)
    done(err)
  })
}
