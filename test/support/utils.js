var assert = require('assert')
var finalhandler = require('../..')
var http = require('http')
var request = require('supertest')
var SlowWriteStream = require('./sws')

exports.assert = assert
exports.createError = createError
exports.createServer = createServer
exports.createSlowWriteStream = createSlowWriteStream
exports.rawrequest = rawrequest
exports.request = request
exports.shouldHaveStatusMessage = shouldHaveStatusMessage
exports.shouldNotHaveHeader = shouldNotHaveHeader

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

function rawrequest (server) {
  var _headers = {}
  var _path

  function expect (status, body, callback) {
    if (arguments.length === 2) {
      _headers[status.toLowerCase()] = body
      return this
    }

    server.listen(function onlisten () {
      var addr = this.address()
      var hostname = 'localhost'
      var port = addr.port

      var req = http.get({
        host: hostname,
        path: _path,
        port: port
      })
      req.on('response', function onresponse (res) {
        var buf = ''

        res.setEncoding('utf8')
        res.on('data', function ondata (s) { buf += s })
        res.on('end', function onend () {
          var err = null

          try {
            for (var key in _headers) {
              assert.equal(res.headers[key], _headers[key])
            }

            assert.equal(res.statusCode, status)

            if (body instanceof RegExp) {
              assert.ok(body.test(buf), 'expected body ' + buf + ' to match ' + body)
            } else {
              assert.equal(buf, body, 'expected ' + body + ' response body, got ' + buf)
            }
          } catch (e) {
            err = e
          }

          server.close()
          callback(err)
        })
      })
    })
  }

  function get (path) {
    _path = path

    return {
      expect: expect
    }
  }

  return {
    get: get
  }
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
