/*!
 * finalhandler
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 * @private
 */

const Negotiator = require('negotiator')
var debug = require('debug')('finalhandler')
var encodeUrl = require('encodeurl')
var escapeHtml = require('escape-html')
var onFinished = require('on-finished')
var parseUrl = require('parseurl')
var statuses = require('statuses')

/**
 * Module variables.
 * @private
 */

var isFinished = onFinished.isFinished

const AVAILABLE_MEDIA_TYPES = ['text/plain', 'text/html']
const HTML_CONTENT_TYPE = 'text/html; charset=utf-8'
const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8'

/**
 * Create a minimal HTML document.
 *
 * @param {string} message
 * @private
 */

function createHtmlBody (message) {
  const msg = escapeHtml(message)
    .replaceAll('\n', '<br>')
    .replaceAll('  ', ' &nbsp;')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>${msg}</pre>
</body>
</html>
`

  return Buffer.from(html, 'utf8')
}

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

  // get environment
  var env = opts.env || process.env.NODE_ENV || 'development'

  // get error callback
  var onerror = opts.onerror

  // fallback response content type negotiation enabled
  const contentTypeNegotiation = opts.contentTypeNegotiation === true

  // default content type for responses
  const defaultContentType = opts.defaultContentType || 'text/html'
  if (!AVAILABLE_MEDIA_TYPES.includes(defaultContentType)) {
    throw new Error('defaultContentType must be one of: ' + AVAILABLE_MEDIA_TYPES.join(', '))
  }

  return function (err) {
    var headers
    var msg
    var status

    // ignore 404 on in-flight response
    if (!err && res.headersSent) {
      debug('cannot 404 after headers sent')
      return
    }

    // unhandled error
    if (err) {
      // respect status code from error
      status = getErrorStatusCode(err)

      if (status === undefined) {
        // fallback to status code on response
        status = getResponseStatusCode(res)
      } else {
        // respect headers from error
        headers = getErrorHeaders(err)
      }

      // get error message
      msg = getErrorMessage(err, status, env)
    } else {
      // not found
      status = 404
      msg = 'Cannot ' + req.method + ' ' + encodeUrl(getResourceName(req))
    }

    debug('default %s', status)

    // schedule onerror callback
    if (err && onerror) {
      setImmediate(onerror, err, req, res)
    }

    // cannot actually respond
    if (res.headersSent) {
      debug('cannot %d after headers sent', status)
      if (req.socket) {
        req.socket.destroy()
      }
      return
    }

    let preferredType
    // If text/plain fallback is enabled, negotiate content type
    if (contentTypeNegotiation) {
      // negotiate
      const negotiator = new Negotiator(req)
      preferredType = negotiator.mediaType(AVAILABLE_MEDIA_TYPES)
    }

    // construct body
    let body
    let contentType
    switch (preferredType || defaultContentType) {
      case 'text/html':
        body = createHtmlBody(msg)
        contentType = HTML_CONTENT_TYPE
        break
      case 'text/plain':
        // default to plain text
        body = Buffer.from(msg, 'utf8')
        contentType = TEXT_CONTENT_TYPE
        break
    }

    // send response
    send(req, res, status, headers, body, contentType)
  }
}

/**
 * Get headers from Error object.
 *
 * @param {Error} err
 * @return {object}
 * @private
 */

function getErrorHeaders (err) {
  if (!err.headers || typeof err.headers !== 'object') {
    return undefined
  }

  return { ...err.headers }
}

/**
 * Get message from Error object, fallback to status message.
 *
 * @param {Error} err
 * @param {number} status
 * @param {string} env
 * @return {string}
 * @private
 */

function getErrorMessage (err, status, env) {
  var msg

  if (env !== 'production') {
    // use err.stack, which typically includes err.message
    msg = err.stack

    // fallback to err.toString() when possible
    if (!msg && typeof err.toString === 'function') {
      msg = err.toString()
    }
  }

  return msg || statuses.message[status]
}

/**
 * Get status code from Error object.
 *
 * @param {Error} err
 * @return {number}
 * @private
 */

function getErrorStatusCode (err) {
  // check err.status
  if (typeof err.status === 'number' && err.status >= 400 && err.status < 600) {
    return err.status
  }

  // check err.statusCode
  if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600) {
    return err.statusCode
  }

  return undefined
}

/**
 * Get resource name for the request.
 *
 * This is typically just the original pathname of the request
 * but will fallback to "resource" is that cannot be determined.
 *
 * @param {IncomingMessage} req
 * @return {string}
 * @private
 */

function getResourceName (req) {
  try {
    return parseUrl.original(req).pathname
  } catch (e) {
    return 'resource'
  }
}

/**
 * Get status code from response.
 *
 * @param {OutgoingMessage} res
 * @return {number}
 * @private
 */

function getResponseStatusCode (res) {
  var status = res.statusCode

  // default status code to 500 if outside valid range
  if (typeof status !== 'number' || status < 400 || status > 599) {
    status = 500
  }

  return status
}

/**
 * Send response.
 *
 * @param {IncomingMessage} req
 * @param {OutgoingMessage} res
 * @param {number} status
 * @param {object} headers
 * @param {string} message
 * @private
 */

function send (req, res, status, headers, body, contentType) {
  function write () {
    // response status
    res.statusCode = status

    if (req.httpVersionMajor < 2) {
      res.statusMessage = statuses.message[status]
    }

    // remove any content headers
    res.removeHeader('Content-Encoding')
    res.removeHeader('Content-Language')
    res.removeHeader('Content-Range')

    // response headers
    for (const [key, value] of Object.entries(headers ?? {})) {
      res.setHeader(key, value)
    }

    // security headers
    res.setHeader('Content-Security-Policy', "default-src 'none'")
    res.setHeader('X-Content-Type-Options', 'nosniff')

    // standard headers
    res.setHeader('Content-Type', contentType)
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
  req.unpipe()

  // flush the request
  onFinished(req, write)
  req.resume()
}
