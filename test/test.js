
var finalhandler = require('..')
var http = require('http')
var request = require('supertest')

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
    it('include method and path', function (done) {
      var server = createServer()
      request(server)
      .get('/foo')
      .expect(404, 'Cannot GET /foo\n', done)
    })

    it('should handle HEAD', function (done) {
      var server = createServer()
      request(server)
      .head('/foo')
      .expect(404, '', done)
    })
  })

  describe('error response', function () {
    it('include error stack', function (done) {
      var server = createServer(new Error('boom!'))
      request(server)
      .get('/foo')
      .expect(500, /^Error: boom!<br> &nbsp; &nbsp;at/, done)
    })

    it('should handle HEAD', function (done) {
      var server = createServer()
      request(server)
      .head('/foo')
      .expect(404, '', done)
    })

    it('should handle non-error-objects', function (done) {
      var server = createServer('lame string')
      request(server)
      .get('/foo')
      .expect(500, 'lame string\n', done)
    })

    describe('when res.statusCode set', function () {
      it('should keep when > 400', function (done) {
        var server = http.createServer(function (req, res) {
          var done = finalhandler(req, res, {env: 'test'})
          res.statusCode = 503
          done(new Error('oops'))
        })

        request(server)
        .get('/foo')
        .expect(503, done)
      })

      it('should override with err.status', function (done) {
        var server = http.createServer(function (req, res) {
          var done = finalhandler(req, res, {env: 'test'})
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
  })

  describe('request started', function () {
    it('should not respond', function (done) {
      var server = http.createServer(function (req, res) {
        var done = finalhandler(req, res, {env: 'test'})
        res.statusCode = 301
        res.write('0')
        process.nextTick(done)
      })

      request(server)
      .get('/foo')
      .expect(301, '0', done)
    })
  })
})

function createServer(err) {
  return http.createServer(function (req, res) {
    var done = finalhandler(req, res, {env: 'test'})
    done(err)
  })
}
