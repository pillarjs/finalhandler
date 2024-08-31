var assert = require('assert')
var finalhandler = require('../..')
var http = require('http')

var http2

try {
  http2 = require('http2')
} catch (_err) {
  // Nothing
}

var request = require('supertest')
var SlowWriteStream = require('./sws')

exports.assert = assert
exports.createError = createError
exports.createHTTPServer = createHTTPServer
exports.createHTTP2Server = createHTTP2Server
exports.createSlowWriteStream = createSlowWriteStream
exports.rawrequest = rawrequest
exports.rawrequestHTTP2 = rawrequestHTTP2
exports.request = request
exports.shouldHaveStatusMessage = shouldHaveStatusMessage
exports.shouldNotHaveBody = shouldNotHaveBody
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

function createHTTPServer (err, opts) {
  return http.createServer(function (req, res) {
    var done = finalhandler(req, res, opts)

    if (typeof err === 'function') {
      err(req, res, done)
      return
    }

    done(err)
  })
}

function createHTTP2Server (err, opts) {
  return http2.createServer(function (req, res) {
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
      var port = addr.port

      var req = http.get({
        host: '127.0.0.1',
        path: _path,
        port: port
      })
      req.on('error', callback)
      req.on('response', function onresponse (res) {
        var buf = ''

        res.setEncoding('utf8')
        res.on('data', function ondata (s) { buf += s })
        res.on('end', function onend () {
          var err = null

          try {
            for (var key in _headers) {
              assert.strictEqual(res.headers[key], _headers[key])
            }

            assert.strictEqual(res.statusCode, status)

            if (body instanceof RegExp) {
              assert.ok(body.test(buf), 'expected body ' + buf + ' to match ' + body)
            } else {
              assert.strictEqual(buf, body, 'expected ' + body + ' response body, got ' + buf)
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

function rawrequestHTTP2 (server) {
  var _headers = {}
  var _path

  function expect (status, body, callback) {
    if (arguments.length === 2) {
      _headers[status.toLowerCase()] = body
      return this
    }

    server.listen(function onlisten () {
      var buf = ''
      var resHeaders
      var addr = this.address()
      var port = addr.port

      var client = http2.connect('http://127.0.0.1:' + port)
      var req = client.request({
        ':method': 'GET',
        ':path': _path.replace(/http:\/\/localhost/, '')
      })
      req.on('error', callback)
      req.on('response', function onresponse (responseHeaders) {
        resHeaders = responseHeaders
      })
      req.on('data', function ondata (s) { buf += s })
      req.on('end', function onend () {
        var err = null

        try {
          for (var key in _headers) {
            assert.strictEqual(resHeaders[key], _headers[key])
          }

          assert.strictEqual(resHeaders[':status'], status)

          if (body instanceof RegExp) {
            assert.ok(body.test(buf), 'expected body ' + buf + ' to match ' + body)
          } else {
            assert.strictEqual(buf, body, 'expected ' + body + ' response body, got ' + buf)
          }
        } catch (e) {
          err = e
        }

        req.close()
        client.close()
        server.close()
        callback(err)
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
    assert.strictEqual(test.res.statusMessage, statusMessage, 'should have statusMessage "' + statusMessage + '"')
  }
}

function shouldNotHaveBody () {
  return function (res) {
    assert.ok(res.text === '' || res.text === undefined)
  }
}

function shouldNotHaveHeader (header) {
  return function (test) {
    assert.ok(test.res.headers[header] === undefined, 'response does not have header "' + header + '"')
  }
}
