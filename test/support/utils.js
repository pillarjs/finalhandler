var assert = require('assert')
var finalhandler = require('../..')
var http = require('http')
var request = require('supertest')
var SlowWriteStream = require('./sws')

exports.assert = assert
exports.createError = createError
exports.createServer = createServer
exports.createSlowWriteStream = createSlowWriteStream
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
