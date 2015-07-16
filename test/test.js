
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

    it('should use err.status', function (done) {
      var err = new Error()
      err.status = 400
      var server = createServer(err)
      request(server)
      .get('/')
      .expect(400, done)
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
  })

  describe('error response', function () {
    it('should include error stack', function (done) {
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
      .expect(500, 'lame string\n', done)
    })

    it('should send staus code name when production', function (done) {
      var err = new Error('boom!')
      err.status = 501
      var server = createServer(err, {env: 'production'})
      request(server)
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
  
  describe('render', function(){
    it('should render a custom view when option is set', function(done){
      var err = new Error('boom!')
      
      var server = createServer(err, {render: function(msg, req, res, serverDone){
        serverDone('<!DOCTYPE html><html><body><p>' + msg + '<p></body></html>')
      }})
      request(server)
      .get('/')
      .expect(new RegExp("^<!DOCTYPE html>", "i"))
      .expect(500, done)
    })
  })
})

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
