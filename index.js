/*!
 * finalhandler
 * Copyright(c) 2014 Douglas Christopher Wilson
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var debug = require('debug')('finalhandler')
var escapeHtml = require('escape-html')
var http = require('http')

/**
 * Module exports.
 */

module.exports = finalhandler

/**
 * Final handler:
 *
 * @param {Request} req
 * @param {Response} res
 * @param {Object} [options]
 * @return {Function}
 * @api public
 */

function finalhandler(req, res, options) {
  options = options || {}

  // get environment
  var env = options.env || process.env.NODE_ENV || 'development'

  return function (err) {
    var msg

    // unhandled error
    if (err) {
      // default status code to 500
      if (res.statusCode < 400) {
        res.statusCode = 500
      }

      // respect err.status
      if (err.status) {
        res.statusCode = err.status
      }

      // production gets a basic error message
      var msg = env === 'production'
        ? http.STATUS_CODES[res.statusCode]
        : err.stack || err.toString()
      msg = escapeHtml(msg)
        .replace(/\n/g, '<br>')
        .replace(/  /g, ' &nbsp;') + '\n'

      // log to stderr in a non-test env
      if (env !== 'test') {
        console.error(err.stack || err.toString())
      }
    } else {
      res.statusCode = 404
      msg = 'Cannot ' + escapeHtml(req.method) + ' ' + escapeHtml(req.originalUrl || req.url) + '\n'
    }

    debug('default %s', res.statusCode)

    // cannot actually respond
    if (res._header) {
      return req.socket.destroy()
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Length', Buffer.byteLength(msg, 'utf8'))

    if (req.method === 'HEAD') {
      res.end()
      return
    }

    res.end(msg, 'utf8')
  }
}
