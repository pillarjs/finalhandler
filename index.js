/*!
 * finalhandler
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 * @private
 */

var accepts = require('accepts')
var debug = require('debug')('finalhandler')
var escapeHtml = require('escape-html')
var http = require('http')
var onFinished = require('on-finished')
var unpipe = require('unpipe')

/**
 * Module variables.
 * @private
 */

/* istanbul ignore next */
var defer = typeof setImmediate === 'function'
  ? setImmediate
  : function (fn) { process.nextTick(fn.bind.apply(fn, arguments)) }
var isFinished = onFinished.isFinished

/**
 * Module exports.
 * @public
 */

module.exports = finalhandler

/**
 * Create a function to handle the final response.
 *
 * @param {Request} req
 * @param {Response} res
 * @param {Object} [options]
 * @return {Function}
 * @public
 */

function finalhandler (req, res, options) {
  var opts = options || {}

  // get message option
  var message = opts.message === true
    ? getDefaultErrorMessage
    : opts.message || false

  if (typeof message !== 'boolean' && typeof message !== 'function') {
    throw new TypeError('option message must be boolean or function')
  }

  // get error callback
  var onerror = opts.onerror

  // get stack trace option
  var stacktrace = opts.stacktrace || false

  return function (err) {
    var body
    var constructBody
    var msg
    var status = res.statusCode

    // ignore 404 on in-flight response
    if (!err && res._header) {
      debug('cannot 404 after headers sent')
      return
    }

    // unhandled error
    if (err) {
      // respect status code from error
      status = getErrorStatusCode(err) || status

      // default status code to 500
      if (!status || status < 400) {
        status = 500
      }

      // build a stack trace or normal message
      msg = stacktrace
        ? getErrorStack(err, status, message)
        : getErrorMessage(err, status, message)
    } else {
      status = 404
      msg = 'Cannot ' + req.method + ' ' + (req.originalUrl || req.url)
    }

    debug('default %s', status)

    // schedule onerror callback
    if (err && onerror) {
      defer(onerror, err, req, res)
    }

    // cannot actually respond
    if (res._header) {
      return req.socket.destroy()
    }

    // negotiate
    var accept = accepts(req)
    var type = accept.types('html', 'text')

    // construct body
    switch (type) {
      case 'html':
        constructBody = constructHtmlBody
        break
      default:
        // default to plain text
        constructBody = constructTextBody
        break
    }

    // construct body
    body = constructBody(status, msg)

    // send response
    send(req, res, status, body)
  }
}

/**
 * Get HTML body string
 *
 * @param {number} status
 * @param {string} message
 * @return {Buffer}
 * @private
 */

function constructHtmlBody (status, message) {
  var msg = escapeHtml(message)
    .replace(/\n/g, '<br>')
    .replace(/\x20{2}/g, ' &nbsp;')

  var html = '<!doctype html>\n' +
    '<html lang=en>\n' +
    '<head>\n' +
    '<meta charset=utf-8>\n' +
    '<title>' + escapeHtml(http.STATUS_CODES[status]) + '</title>\n' +
    '</head>\n' +
    '<body>\n' +
    msg + '\n' +
    '</body>\n'

  var body = new Buffer(html, 'utf8')

  body.type = 'text/html; charset=utf-8'

  return body
}

/**
 * Get plain text body string
 *
 * @param {number} status
 * @param {string} message
 * @return {Buffer}
 * @private
 */

function constructTextBody (status, message) {
  var msg = message + '\n'
  var body = new Buffer(msg, 'utf8')

  body.type = 'text/plain; charset=utf-8'

  return body
}

/**
 * Get message from error
 *
 * @param {object} err
 * @param {number} status
 * @param {function} message
 * @return {string}
 * @private
 */

function getErrorMessage (err, status, message) {
  var msg

  if (message) {
    msg = message(err, status)
  }

  return msg || http.STATUS_CODES[status]
}

/**
 * Get default message from error
 *
 * @param {object} err
 * @return {string}
 * @private
 */

function getDefaultErrorMessage (err) {
  return (err.status >= 400 && err.status < 600) || (err.statusCode >= 400 && err.statusCode < 600)
    ? err.message
    : undefined
}

/**
 * Get stack from error with custom message
 *
 * @param {object} err
 * @param {number} status
 * @param {function} message
 * @return {string}
 * @private
 */

function getErrorStack (err, status, message) {
  var stack = err.stack || ''

  if (message) {
    var index = stack.indexOf('\n')
    var msg = message(err, status) || err.message || String(err)
    var name = err.name

    // slice implicit message from top of stack
    if (index !== -1) {
      stack = stack.substr(index)
    }

    // prepend name and message to stack
    stack = name
      ? name + ': ' + msg + stack
      : msg + stack
  } else if (!stack) {
    // stringify error when no message generator and no stack
    stack = String(err)
  }

  return stack
}

/**
 * Get status code from an Error object.
 *
 * @param {object} err
 * @return {number}
 * @private
 */

function getErrorStatusCode (err) {
  // check err.status
  if (err.status >= 400 && err.status < 600) {
    return err.status
  }

  // check err.statusCode
  if (err.statusCode >= 400 && err.statusCode < 600) {
    return err.statusCode
  }

  return undefined
}

/**
 * Send response.
 *
 * @param {IncomingMessage} req
 * @param {OutgoingMessage} res
 * @param {number} status
 * @param {Buffer} body
 * @private
 */

function send (req, res, status, body) {
  function write () {
    res.statusCode = status

    // security header for content sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff')

    // standard headers
    res.setHeader('Content-Type', body.type)
    res.setHeader('Content-Length', body.length)

    if (req.method === 'HEAD') {
      res.end()
      return
    }

    res.end(body, 'utf8')
  }

  if (isFinished(req)) {
    write()
    return
  }

  // unpipe everything from the request
  unpipe(req)

  // flush the request
  onFinished(req, write)
  req.resume()
}
