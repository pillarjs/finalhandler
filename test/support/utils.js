const finalhandler = require('../..')
const SlowWriteStream = require('./sws')

const assert = require('node:assert')
const http = require('node:http')
const http2 = require('node:http2')
const supertest = require('supertest')

exports.createError = createError
exports.getTestHelpers = getTestHelpers
exports.SlowWriteStream = SlowWriteStream
exports.shouldHaveStatusMessage = shouldHaveStatusMessage
exports.shouldNotHaveBody = shouldNotHaveBody
exports.shouldNotHaveHeader = shouldNotHaveHeader

function createError (message, props) {
  const err = new Error(message)

  if (props) {
    for (const prop in props) {
      err[prop] = props[prop]
    }
  }

  return err
}

function getTestHelpers (type) {
  const { createServer } = type === 'http2' ? http2 : http

  return {
    createServer: (err, opts) =>
      createServer((req, res) => {
        const done = finalhandler(req, res, opts)

        if (typeof err === 'function') {
          err(req, res, done)
          return
        }

        done(err)
      }),
    request: (server, options) => supertest(server, { ...options, http2: type === 'http2' }),
    rawrequest: type === 'http2' ? rawrequestHTTP2 : rawrequest
  }
}

function rawrequest (server) {
  const _headers = {}
  let _path

  function expect (status, body, callback) {
    if (arguments.length === 2) {
      _headers[status.toLowerCase()] = body
      return this
    }

    server.listen(function onlisten () {
      const addr = this.address()
      const port = addr.port

      const req = http.get({
        host: '127.0.0.1',
        path: _path,
        port: port
      })
      req.on('error', callback)
      req.on('response', function onresponse (res) {
        let buf = ''

        res.setEncoding('utf8')
        res.on('data', (s) => { buf += s })
        res.on('end', () => {
          let err = null

          try {
            for (const key in _headers) {
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

  return {
    get: (path) => {
      _path = path

      return { expect }
    }
  }
}

function rawrequestHTTP2 (server) {
  const _headers = {}
  let _path

  function expect (status, body, callback) {
    if (arguments.length === 2) {
      _headers[status.toLowerCase()] = body
      return this
    }

    server.listen(function onlisten () {
      let buf = ''
      let resHeaders
      const addr = this.address()
      const port = addr.port

      const client = http2.connect('http://127.0.0.1:' + port)
      const req = client.request({
        ':method': 'GET',
        ':path': _path.replace(/http:\/\/localhost/, '')
      })
      req.on('error', callback)
      req.on('response', (responseHeaders) => { resHeaders = responseHeaders })
      req.on('data', (s) => { buf += s })
      req.on('end', () => {
        let err = null

        try {
          for (const key in _headers) {
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

  return {
    get: (path) => {
      _path = path

      return { expect }
    }
  }
}

function shouldHaveStatusMessage (statusMessage) {
  return (test) => {
    assert.strictEqual(test.res.statusMessage, statusMessage, 'should have statusMessage "' + statusMessage + '"')
  }
}

function shouldNotHaveBody () {
  return (res) => {
    assert.ok(res.text === '' || res.text === undefined)
  }
}

function shouldNotHaveHeader (header) {
  return (test) => {
    assert.ok(test.res.headers[header] === undefined, 'response does not have header "' + header + '"')
  }
}
