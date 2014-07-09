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
 * Variables.
 */

/* istanbul ignore next */
var defer = typeof setImmediate === 'function'
  ? setImmediate
  : function(fn){ process.nextTick(fn.bind.apply(fn, arguments)) }

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

  // get error callback
  var onerror = options.onerror

  return function (err) {
    var body
    var msg

    // unhandled error
    if (err) {
      // default status code to 500
      if (!res.statusCode || res.statusCode < 400) {
        res.statusCode = 500
      }

      // respect err.status
      if (err.status) {
        res.statusCode = err.status
      }

      // production gets a basic error message
      msg = env === 'production'
        ? http.STATUS_CODES[res.statusCode]
        : err.stack || err.toString()
    } else {
      res.statusCode = 404
      msg = 'Cannot ' + req.method + ' ' + (req.originalUrl || req.url)
    }

    debug('default %s', res.statusCode)

    // schedule onerror callback
    if (err && onerror) {
      defer(onerror, err, req, res)
    }

    // cannot actually respond
    if (res._header) {
      return req.socket.destroy()
    }

    // construct body
    body = constructHtmlBody(res.statusCode, msg)

    // security header for content sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff')

    // standard headers
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'))

    if (req.method === 'HEAD') {
      res.end()
      return
    }

    res.end(body, 'utf8')
  }
}

/**
 * Get HTML body string
 *
 * @param {number} status
 * @param {string} message
 * @return {string}
 * @api private
 */

function constructHtmlBody(status, message) {
  var msg = escapeHtml(message)
    .replace(/\n/g, '<br>')
    .replace(/  /g, ' &nbsp;')

  return '<!doctype html>\n'
    + '<html lang=en>\n'
    + '<head>\n'
    + '<meta charset=utf-8>\n'
    + '<title>' + escapeHtml(http.STATUS_CODES[status]) + '</title>\n'
    + '</head>\n'
    + '<body>\n'
    + msg + '\n'
    + '</body>\n'
}
