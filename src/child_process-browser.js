(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var R = typeof Reflect === 'object' ? Reflect : null
var ReflectApply = R && typeof R.apply === 'function'
  ? R.apply
  : function ReflectApply(target, receiver, args) {
    return Function.prototype.apply.call(target, receiver, args);
  }

var ReflectOwnKeys
if (R && typeof R.ownKeys === 'function') {
  ReflectOwnKeys = R.ownKeys
} else if (Object.getOwnPropertySymbols) {
  ReflectOwnKeys = function ReflectOwnKeys(target) {
    return Object.getOwnPropertyNames(target)
      .concat(Object.getOwnPropertySymbols(target));
  };
} else {
  ReflectOwnKeys = function ReflectOwnKeys(target) {
    return Object.getOwnPropertyNames(target);
  };
}

function ProcessEmitWarning(warning) {
  if (console && console.warn) console.warn(warning);
}

var NumberIsNaN = Number.isNaN || function NumberIsNaN(value) {
  return value !== value;
}

function EventEmitter() {
  EventEmitter.init.call(this);
}
module.exports = EventEmitter;
module.exports.once = once;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._eventsCount = 0;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

function checkListener(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof listener);
  }
}

Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
  enumerable: true,
  get: function() {
    return defaultMaxListeners;
  },
  set: function(arg) {
    if (typeof arg !== 'number' || arg < 0 || NumberIsNaN(arg)) {
      throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + arg + '.');
    }
    defaultMaxListeners = arg;
  }
});

EventEmitter.init = function() {

  if (this._events === undefined ||
      this._events === Object.getPrototypeOf(this)._events) {
    this._events = Object.create(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || NumberIsNaN(n)) {
    throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + '.');
  }
  this._maxListeners = n;
  return this;
};

function _getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return _getMaxListeners(this);
};

EventEmitter.prototype.emit = function emit(type) {
  var args = [];
  for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
  var doError = (type === 'error');

  var events = this._events;
  if (events !== undefined)
    doError = (doError && events.error === undefined);
  else if (!doError)
    return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    var er;
    if (args.length > 0)
      er = args[0];
    if (er instanceof Error) {
      // Note: The comments on the `throw` lines are intentional, they show
      // up in Node's output if this results in an unhandled exception.
      throw er; // Unhandled 'error' event
    }
    // At least give some kind of context to the user
    var err = new Error('Unhandled error.' + (er ? ' (' + er.message + ')' : ''));
    err.context = er;
    throw err; // Unhandled 'error' event
  }

  var handler = events[type];

  if (handler === undefined)
    return false;

  if (typeof handler === 'function') {
    ReflectApply(handler, this, args);
  } else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      ReflectApply(listeners[i], this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  checkListener(listener);

  events = target._events;
  if (events === undefined) {
    events = target._events = Object.create(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener !== undefined) {
      target.emit('newListener', type,
                  listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (existing === undefined) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] =
        prepend ? [listener, existing] : [existing, listener];
      // If we've already got an array, just append.
    } else if (prepend) {
      existing.unshift(listener);
    } else {
      existing.push(listener);
    }

    // Check for listener leak
    m = _getMaxListeners(target);
    if (m > 0 && existing.length > m && !existing.warned) {
      existing.warned = true;
      // No error code for this since it is a Warning
      // eslint-disable-next-line no-restricted-syntax
      var w = new Error('Possible EventEmitter memory leak detected. ' +
                          existing.length + ' ' + String(type) + ' listeners ' +
                          'added. Use emitter.setMaxListeners() to ' +
                          'increase limit');
      w.name = 'MaxListenersExceededWarning';
      w.emitter = target;
      w.type = type;
      w.count = existing.length;
      ProcessEmitWarning(w);
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    if (arguments.length === 0)
      return this.listener.call(this.target);
    return this.listener.apply(this.target, arguments);
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = onceWrapper.bind(state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  checkListener(listener);
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      checkListener(listener);
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      checkListener(listener);

      events = this._events;
      if (events === undefined)
        return this;

      list = events[type];
      if (list === undefined)
        return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = Object.create(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (position === 0)
          list.shift();
        else {
          spliceOne(list, position);
        }

        if (list.length === 1)
          events[type] = list[0];

        if (events.removeListener !== undefined)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events, i;

      events = this._events;
      if (events === undefined)
        return this;

      // not listening for removeListener, no need to emit
      if (events.removeListener === undefined) {
        if (arguments.length === 0) {
          this._events = Object.create(null);
          this._eventsCount = 0;
        } else if (events[type] !== undefined) {
          if (--this._eventsCount === 0)
            this._events = Object.create(null);
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = Object.create(null);
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners !== undefined) {
        // LIFO order
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }

      return this;
    };

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (events === undefined)
    return [];

  var evlistener = events[type];
  if (evlistener === undefined)
    return [];

  if (typeof evlistener === 'function')
    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ?
    unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events !== undefined) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener !== undefined) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
};

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i)
    copy[i] = arr[i];
  return copy;
}

function spliceOne(list, index) {
  for (; index + 1 < list.length; index++)
    list[index] = list[index + 1];
  list.pop();
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function once(emitter, name) {
  return new Promise(function (resolve, reject) {
    function errorListener(err) {
      emitter.removeListener(name, resolver);
      reject(err);
    }

    function resolver() {
      if (typeof emitter.removeListener === 'function') {
        emitter.removeListener('error', errorListener);
      }
      resolve([].slice.call(arguments));
    };

    eventTargetAgnosticAddListener(emitter, name, resolver, { once: true });
    if (name !== 'error') {
      addErrorHandlerIfEventEmitter(emitter, errorListener, { once: true });
    }
  });
}

function addErrorHandlerIfEventEmitter(emitter, handler, flags) {
  if (typeof emitter.on === 'function') {
    eventTargetAgnosticAddListener(emitter, 'error', handler, flags);
  }
}

function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
  if (typeof emitter.on === 'function') {
    if (flags.once) {
      emitter.once(name, listener);
    } else {
      emitter.on(name, listener);
    }
  } else if (typeof emitter.addEventListener === 'function') {
    // EventTarget does not have `error` event semantics like Node
    // EventEmitters, we do not listen for `error` events here.
    emitter.addEventListener(name, function wrapListener(arg) {
      // IE does not have builtin `{ once: true }` support so we
      // have to do it manually.
      if (flags.once) {
        emitter.removeEventListener(name, wrapListener);
      }
      listener(arg);
    });
  } else {
    throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof emitter);
  }
}

},{}],2:[function(require,module,exports){
"use strict";
// A browser version of the child_process module.
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
exports.__esModule = true;
exports.execSync = exports.spawnSync = void 0;
var events_1 = require("events");
// export module child_process {
var ChildProcess = /** @class */ (function (_super) {
    __extends(ChildProcess, _super);
    function ChildProcess() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    /**
     * The `subprocess.kill()` method sends a signal to the child process. If no
     * argument is given, the process will be sent the `'SIGTERM'` signal. See [`signal(7)`](http://man7.org/linux/man-pages/man7/signal.7.html) for a list of available signals. This function
     * returns `true` if [`kill(2)`](http://man7.org/linux/man-pages/man2/kill.2.html) succeeds, and `false` otherwise.
     *
     * ```js
     * const { spawn } = require('child_process');
     * const grep = spawn('grep', ['ssh']);
     *
     * grep.on('close', (code, signal) => {
     *   console.log(
     *     `child process terminated due to receipt of signal ${signal}`);
     * });
     *
     * // Send SIGHUP to process.
     * grep.kill('SIGHUP');
     * ```
     *
     * The `ChildProcess` object may emit an `'error'` event if the signal
     * cannot be delivered. Sending a signal to a child process that has already exited
     * is not an error but may have unforeseen consequences. Specifically, if the
     * process identifier (PID) has been reassigned to another process, the signal will
     * be delivered to that process instead which can have unexpected results.
     *
     * While the function is called `kill`, the signal delivered to the child process
     * may not actually terminate the process.
     *
     * See [`kill(2)`](http://man7.org/linux/man-pages/man2/kill.2.html) for reference.
     *
     * On Windows, where POSIX signals do not exist, the `signal` argument will be
     * ignored, and the process will be killed forcefully and abruptly (similar to`'SIGKILL'`).
     * See `Signal Events` for more details.
     *
     * On Linux, child processes of child processes will not be terminated
     * when attempting to kill their parent. This is likely to happen when running a
     * new process in a shell or with the use of the `shell` option of `ChildProcess`:
     *
     * ```js
     * 'use strict';
     * const { spawn } = require('child_process');
     *
     * const subprocess = spawn(
     *   'sh',
     *   [
     *     '-c',
     *     `node -e "setInterval(() => {
     *       console.log(process.pid, 'is alive')
     *     }, 500);"`,
     *   ], {
     *     stdio: ['inherit', 'inherit', 'inherit']
     *   }
     * );
     *
     * setTimeout(() => {
     *   subprocess.kill(); // Does not terminate the Node.js process in the shell.
     * }, 2000);
     * ```
     * @since v0.1.90
     */
    ChildProcess.prototype.kill = function (signal) {
        if (this._handle) {
            return this._handle.kill(signal);
        }
        return false;
    };
    /**
     * When an IPC channel has been established between the parent and child (
     * i.e. when using {@link fork}), the `subprocess.send()` method can
     * be used to send messages to the child process. When the child process is a
     * Node.js instance, these messages can be received via the `'message'` event.
     *
     * The message goes through serialization and parsing. The resulting
     * message might not be the same as what is originally sent.
     *
     * For example, in the parent script:
     *
     * ```js
     * const cp = require('child_process');
     * const n = cp.fork(`${__dirname}/sub.js`);
     *
     * n.on('message', (m) => {
     *   console.log('PARENT got message:', m);
     * });
     *
     * // Causes the child to print: CHILD got message: { hello: 'world' }
     * n.send({ hello: 'world' });
     * ```
     *
     * And then the child script, `'sub.js'` might look like this:
     *
     * ```js
     * process.on('message', (m) => {
     *   console.log('CHILD got message:', m);
     * });
     *
     * // Causes the parent to print: PARENT got message: { foo: 'bar', baz: null }
     * process.send({ foo: 'bar', baz: NaN });
     * ```
     *
     * Child Node.js processes will have a `process.send()` method of their own
     * that allows the child to send messages back to the parent.
     *
     * There is a special case when sending a `{cmd: 'NODE_foo'}` message. Messages
     * containing a `NODE_` prefix in the `cmd` property are reserved for use within
     * Node.js core and will not be emitted in the child's `'message'` event. Rather, such messages are emitted using the`'internalMessage'` event and are consumed internally by Node.js.
     * Applications should avoid using such messages or listening for`'internalMessage'` events as it is subject to change without notice.
     *
     * The optional `sendHandle` argument that may be passed to `subprocess.send()` is
     * for passing a TCP server or socket object to the child process. The child will
     * receive the object as the second argument passed to the callback function
     * registered on the `'message'` event. Any data that is received
     * and buffered in the socket will not be sent to the child.
     *
     * The optional `callback` is a function that is invoked after the message is
     * sent but before the child may have received it. The function is called with a
     * single argument: `null` on success, or an `Error` object on failure.
     *
     * If no `callback` function is provided and the message cannot be sent, an`'error'` event will be emitted by the `ChildProcess` object. This can
     * happen, for instance, when the child process has already exited.
     *
     * `subprocess.send()` will return `false` if the channel has closed or when the
     * backlog of unsent messages exceeds a threshold that makes it unwise to send
     * more. Otherwise, the method returns `true`. The `callback` function can be
     * used to implement flow control.
     *
     * #### Example: sending a server object
     *
     * The `sendHandle` argument can be used, for instance, to pass the handle of
     * a TCP server object to the child process as illustrated in the example below:
     *
     * ```js
     * const subprocess = require('child_process').fork('subprocess.js');
     *
     * // Open up the server object and send the handle.
     * const server = require('net').createServer();
     * server.on('connection', (socket) => {
     *   socket.end('handled by parent');
     * });
     * server.listen(1337, () => {
     *   subprocess.send('server', server);
     * });
     * ```
     *
     * The child would then receive the server object as:
     *
     * ```js
     * process.on('message', (m, server) => {
     *   if (m === 'server') {
     *     server.on('connection', (socket) => {
     *       socket.end('handled by child');
     *     });
     *   }
     * });
     * ```
     *
     * Once the server is now shared between the parent and child, some connections
     * can be handled by the parent and some by the child.
     *
     * While the example above uses a server created using the `net` module, `dgram`module servers use exactly the same workflow with the exceptions of listening on
     * a `'message'` event instead of `'connection'` and using `server.bind()` instead
     * of `server.listen()`. This is, however, currently only supported on Unix
     * platforms.
     *
     * #### Example: sending a socket object
     *
     * Similarly, the `sendHandler` argument can be used to pass the handle of a
     * socket to the child process. The example below spawns two children that each
     * handle connections with "normal" or "special" priority:
     *
     * ```js
     * const { fork } = require('child_process');
     * const normal = fork('subprocess.js', ['normal']);
     * const special = fork('subprocess.js', ['special']);
     *
     * // Open up the server and send sockets to child. Use pauseOnConnect to prevent
     * // the sockets from being read before they are sent to the child process.
     * const server = require('net').createServer({ pauseOnConnect: true });
     * server.on('connection', (socket) => {
     *
     *   // If this is special priority...
     *   if (socket.remoteAddress === '74.125.127.100') {
     *     special.send('socket', socket);
     *     return;
     *   }
     *   // This is normal priority.
     *   normal.send('socket', socket);
     * });
     * server.listen(1337);
     * ```
     *
     * The `subprocess.js` would receive the socket handle as the second argument
     * passed to the event callback function:
     *
     * ```js
     * process.on('message', (m, socket) => {
     *   if (m === 'socket') {
     *     if (socket) {
     *       // Check that the client socket exists.
     *       // It is possible for the socket to be closed between the time it is
     *       // sent and the time it is received in the child process.
     *       socket.end(`Request handled with ${process.argv[2]} priority`);
     *     }
     *   }
     * });
     * ```
     *
     * Do not use `.maxConnections` on a socket that has been passed to a subprocess.
     * The parent cannot track when the socket is destroyed.
     *
     * Any `'message'` handlers in the subprocess should verify that `socket` exists,
     * as the connection may have been closed during the time it takes to send the
     * connection to the child.
     * @since v0.5.9
     * @param options The `options` argument, if present, is an object used to parameterize the sending of certain types of handles. `options` supports the following properties:
     */
    // send(message: Serializable, callback?: (error: Error | null) => void): boolean;
    // send(message: Serializable, sendHandle?: SendHandle, callback?: (error: Error | null) => void): boolean;
    ChildProcess.prototype.send = function (message, sendHandle, options, callback) {
        var _options;
        if (typeof options === 'function') {
            callback = options;
            _options = undefined;
        }
        if (typeof sendHandle === 'function') {
            callback = sendHandle;
            sendHandle = undefined;
        }
        if (typeof sendHandle === 'object' && sendHandle !== null && !Array.isArray(sendHandle)) {
            _options = sendHandle;
            sendHandle = undefined;
        }
        if (typeof options === 'object' && options !== null && !Array.isArray(options)) {
            _options = __assign({}, options);
        }
        else {
            _options = {};
        }
        if (typeof callback === 'function') {
            _options.callback = callback;
        }
        if (typeof sendHandle === 'object' && sendHandle !== null && !Array.isArray(sendHandle)) {
            _options.sendHandle = sendHandle;
        }
        return this.send(message, _options);
    };
    /**
     * Closes the IPC channel between parent and child, allowing the child to exit
     * gracefully once there are no other connections keeping it alive. After calling
     * this method the `subprocess.connected` and `process.connected` properties in
     * both the parent and child (respectively) will be set to `false`, and it will be
     * no longer possible to pass messages between the processes.
     *
     * The `'disconnect'` event will be emitted when there are no messages in the
     * process of being received. This will most often be triggered immediately after
     * calling `subprocess.disconnect()`.
     *
     * When the child process is a Node.js instance (e.g. spawned using {@link fork}), the `process.disconnect()` method can be invoked
     * within the child process to close the IPC channel as well.
     * @since v0.7.2
     */
    ChildProcess.prototype.disconnect = function () {
        this.disconnect();
    };
    /**
     * By default, the parent will wait for the detached child to exit. To prevent the
     * parent from waiting for a given `subprocess` to exit, use the`subprocess.unref()` method. Doing so will cause the parent's event loop to not
     * include the child in its reference count, allowing the parent to exit
     * independently of the child, unless there is an established IPC channel between
     * the child and the parent.
     *
     * ```js
     * const { spawn } = require('child_process');
     *
     * const subprocess = spawn(process.argv[0], ['child_program.js'], {
     *   detached: true,
     *   stdio: 'ignore'
     * });
     *
     * subprocess.unref();
     * ```
     * @since v0.7.10
     */
    ChildProcess.prototype.unref = function () {
        this.unref();
    };
    /**
     * Calling `subprocess.ref()` after making a call to `subprocess.unref()` will
     * restore the removed reference count for the child process, forcing the parent
     * to wait for the child to exit before exiting itself.
     *
     * ```js
     * const { spawn } = require('child_process');
     *
     * const subprocess = spawn(process.argv[0], ['child_program.js'], {
     *   detached: true,
     *   stdio: 'ignore'
     * });
     *
     * subprocess.unref();
     * subprocess.ref();
     * ```
     * @since v0.7.10
     */
    ChildProcess.prototype.ref = function () {
        this.ref();
    };
    ChildProcess.prototype.addListener = function (event, listener) {
        return _super.prototype.addListener.call(this, event, listener);
    };
    ChildProcess.prototype.emit = function (event) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        return _super.prototype.emit.apply(this, __spreadArray([event], args, false));
    };
    ChildProcess.prototype.on = function (event, listener) {
        return _super.prototype.on.call(this, event, listener);
    };
    ChildProcess.prototype.once = function (event, listener) {
        return _super.prototype.once.call(this, event, listener);
    };
    ChildProcess.prototype.prependListener = function (event, listener) {
        return _super.prototype.prependListener.call(this, event, listener);
    };
    ChildProcess.prototype.prependOnceListener = function (event, listener) {
        return _super.prototype.prependOnceListener.call(this, event, listener);
    };
    ChildProcess.prototype.execFileSync = function (file, args, options) {
        return this.execFileSync(file, args, options);
    };
    ChildProcess.prototype.spawn = function (command, argsOrOptions, options) {
        if (typeof argsOrOptions === 'undefined') {
            return this.spawn_(command, [], options);
        }
        else if (Array.isArray(argsOrOptions)) {
            return this.spawn_(command, argsOrOptions, options);
        }
        else {
            return this.spawn_(command);
        }
    };
    ChildProcess.prototype.spawn_ = function (command, args, options) {
        if (args === undefined) {
            args = [];
        }
        if (options === undefined) {
            options = {};
        }
        var stdio = options.stdio || 'pipe';
        var shell = !!options.shell || false;
        var spawnargs = shell ? [command].concat(args) : args;
        var spawnopts = __assign(__assign({}, options), { stdio: stdio, shell: shell });
        var child = this.spawn(command, spawnargs, spawnopts);
        return child;
    };
    ChildProcess.prototype.fork = function (modulePath, args, options) {
        return this.fork(modulePath, args, options);
    };
    return ChildProcess;
}(events_1.EventEmitter));
exports["default"] = ChildProcess;
/**
 * Spawns a shell then executes the `command` within that shell, buffering any
 * generated output. The `command` string passed to the exec function is processed
 * directly by the shell and special characters (vary based on [shell](https://en.wikipedia.org/wiki/List_of_command-line_interpreters))
 * need to be dealt with accordingly:
 *
 * ```js
 * const { exec } = require('child_process');
 *
 * exec('"/path/to/test file/test.sh" arg1 arg2');
 * // Double quotes are used so that the space in the path is not interpreted as
 * // a delimiter of multiple arguments.
 *
 * exec('echo "The \\$HOME variable is $HOME"');
 * // The $HOME variable is escaped in the first instance, but not in the second.
 * ```
 *
 * **Never pass unsanitized user input to this function. Any input containing shell**
 * **metacharacters may be used to trigger arbitrary command execution.**
 *
 * If a `callback` function is provided, it is called with the arguments`(error, stdout, stderr)`. On success, `error` will be `null`. On error,`error` will be an instance of `Error`. The
 * `error.code` property will be
 * the exit code of the process. By convention, any exit code other than `0`indicates an error. `error.signal` will be the signal that terminated the
 * process.
 *
 * The `stdout` and `stderr` arguments passed to the callback will contain the
 * stdout and stderr output of the child process. By default, Node.js will decode
 * the output as UTF-8 and pass strings to the callback. The `encoding` option
 * can be used to specify the character encoding used to decode the stdout and
 * stderr output. If `encoding` is `'buffer'`, or an unrecognized character
 * encoding, `Buffer` objects will be passed to the callback instead.
 *
 * ```js
 * const { exec } = require('child_process');
 * exec('cat *.js missing_file | wc -l', (error, stdout, stderr) => {
 *   if (error) {
 *     console.error(`exec error: ${error}`);
 *     return;
 *   }
 *   console.log(`stdout: ${stdout}`);
 *   console.error(`stderr: ${stderr}`);
 * });
 * ```
 *
 * If `timeout` is greater than `0`, the parent will send the signal
 * identified by the `killSignal` property (the default is `'SIGTERM'`) if the
 * child runs longer than `timeout` milliseconds.
 *
 * Unlike the [`exec(3)`](http://man7.org/linux/man-pages/man3/exec.3.html) POSIX system call, `child_process.exec()` does not replace
 * the existing process and uses a shell to execute the command.
 *
 * If this method is invoked as its `util.promisify()` ed version, it returns
 * a `Promise` for an `Object` with `stdout` and `stderr` properties. The returned`ChildProcess` instance is attached to the `Promise` as a `child` property. In
 * case of an error (including any error resulting in an exit code other than 0), a
 * rejected promise is returned, with the same `error` object given in the
 * callback, but with two additional properties `stdout` and `stderr`.
 *
 * ```js
 * const util = require('util');
 * const exec = util.promisify(require('child_process').exec);
 *
 * async function lsExample() {
 *   const { stdout, stderr } = await exec('ls');
 *   console.log('stdout:', stdout);
 *   console.error('stderr:', stderr);
 * }
 * lsExample();
 * ```
 *
 * If the `signal` option is enabled, calling `.abort()` on the corresponding`AbortController` is similar to calling `.kill()` on the child process except
 * the error passed to the callback will be an `AbortError`:
 *
 * ```js
 * const { exec } = require('child_process');
 * const controller = new AbortController();
 * const { signal } = controller;
 * const child = exec('grep ssh', { signal }, (error) => {
 *   console.log(error); // an AbortError
 * });
 * controller.abort();
 * ```
 * @since v0.1.90
 * @param command The command to run, with space-separated arguments.
 * @param callback called with the output when process terminates.
 */
// function exec(command: string, callback?: (error: ExecException | null, stdout: string, stderr: string) => void): ChildProcess;
// // `options` with `"buffer"` or `null` for `encoding` means stdout/stderr are definitely `Buffer`.
// function exec(
//     command: string,
//     options: {
//         encoding: 'buffer' | null;
//     } & ExecOptions,
//     callback?: (error: ExecException | null, stdout: Buffer, stderr: Buffer) => void
// ): ChildProcess;
// // `options` with well known `encoding` means stdout/stderr are definitely `string`.
// function exec(
//     command: string,
//     options: {
//         encoding: BufferEncoding;
//     } & ExecOptions,
//     callback?: (error: ExecException | null, stdout: string, stderr: string) => void
// ): ChildProcess;
// // `options` with an `encoding` whose type is `string` means stdout/stderr could either be `Buffer` or `string`.
// // There is no guarantee the `encoding` is unknown as `string` is a superset of `BufferEncoding`.
// function exec(
//     command: string,
//     options: {
//         encoding: BufferEncoding;
//     } & ExecOptions,
//     callback?: (error: ExecException | null, stdout: string | Buffer, stderr: string | Buffer) => void
// ): ChildProcess;
// `options` without an `encoding` means stdout/stderr are definitely `string`.
// function exec(command: string, options: ExecOptions, callback?: (error: ExecException | null, stdout: string, stderr: string) => void): ChildProcess;
// fallback if nothing else matches. Worst case is always `string | Buffer`.
function exec(command, options, callback) {
    return exec(command, options, callback);
}
(function (exec) {
    // function __promisify__(command: string): PromiseWithChild<{
    //     stdout: string;
    //     stderr: string;
    // }>;
    // function __promisify__(
    //     command: string,
    //     options: {
    //         encoding: 'buffer' | null;
    //     } & ExecOptions
    // ): PromiseWithChild<{
    //     stdout: Buffer;
    //     stderr: Buffer;
    // }>;
    // function __promisify__(
    //     command: string,
    //     options: {
    //         encoding: BufferEncoding;
    //     } & ExecOptions
    // ): PromiseWithChild<{
    //     stdout: string;
    //     stderr: string;
    // }>;
    // function __promisify__(
    //     command: string,
    //     options: ExecOptions
    // ): PromiseWithChild<{
    //     stdout: string;
    //     stderr: string;
    // }>;
    function __promisify__(command, options) {
        return __promisify__(command, options);
    }
})(exec || (exec = {}));
/**
 * The `child_process.execFile()` function is similar to {@link exec} except that it does not spawn a shell by default. Rather, the specified
 * executable `file` is spawned directly as a new process making it slightly more
 * efficient than {@link exec}.
 *
 * The same options as {@link exec} are supported. Since a shell is
 * not spawned, behaviors such as I/O redirection and file globbing are not
 * supported.
 *
 * ```js
 * const { execFile } = require('child_process');
 * const child = execFile('node', ['--version'], (error, stdout, stderr) => {
 *   if (error) {
 *     throw error;
 *   }
 *   console.log(stdout);
 * });
 * ```
 *
 * The `stdout` and `stderr` arguments passed to the callback will contain the
 * stdout and stderr output of the child process. By default, Node.js will decode
 * the output as UTF-8 and pass strings to the callback. The `encoding` option
 * can be used to specify the character encoding used to decode the stdout and
 * stderr output. If `encoding` is `'buffer'`, or an unrecognized character
 * encoding, `Buffer` objects will be passed to the callback instead.
 *
 * If this method is invoked as its `util.promisify()` ed version, it returns
 * a `Promise` for an `Object` with `stdout` and `stderr` properties. The returned`ChildProcess` instance is attached to the `Promise` as a `child` property. In
 * case of an error (including any error resulting in an exit code other than 0), a
 * rejected promise is returned, with the same `error` object given in the
 * callback, but with two additional properties `stdout` and `stderr`.
 *
 * ```js
 * const util = require('util');
 * const execFile = util.promisify(require('child_process').execFile);
 * async function getVersion() {
 *   const { stdout } = await execFile('node', ['--version']);
 *   console.log(stdout);
 * }
 * getVersion();
 * ```
 *
 * **If the `shell` option is enabled, do not pass unsanitized user input to this**
 * **function. Any input containing shell metacharacters may be used to trigger**
 * **arbitrary command execution.**
 *
 * If the `signal` option is enabled, calling `.abort()` on the corresponding`AbortController` is similar to calling `.kill()` on the child process except
 * the error passed to the callback will be an `AbortError`:
 *
 * ```js
 * const { execFile } = require('child_process');
 * const controller = new AbortController();
 * const { signal } = controller;
 * const child = execFile('node', ['--version'], { signal }, (error) => {
 *   console.log(error); // an AbortError
 * });
 * controller.abort();
 * ```
 * @since v0.1.91
 * @param file The name or path of the executable file to run.
 * @param args List of string arguments.
 * @param callback Called with the output when process terminates.
 */
// function execFile(file: string): ChildProcess;
// function execFile(file: string, options: (ObjectEncodingOptions & ExecFileOptions) | undefined | null): ChildProcess;
// function execFile(file: string, args?: ReadonlyArray<string> | null): ChildProcess;
// function execFile(file: string, args: ReadonlyArray<string> | undefined | null, options: (ObjectEncodingOptions & ExecFileOptions) | undefined | null): ChildProcess;
// // no `options` definitely means stdout/stderr are `string`.
// function execFile(file: string, callback: (error: ExecFileException | null, stdout: string, stderr: string) => void): ChildProcess;
// function execFile(file: string, args: ReadonlyArray<string> | undefined | null, callback: (error: ExecFileException | null, stdout: string, stderr: string) => void): ChildProcess;
// // `options` with `"buffer"` or `null` for `encoding` means stdout/stderr are definitely `Buffer`.
// function execFile(file: string, options: ExecFileOptionsWithBufferEncoding, callback: (error: ExecFileException | null, stdout: Buffer, stderr: Buffer) => void): ChildProcess;
// function execFile(
//     file: string,
//     args: ReadonlyArray<string> | undefined | null,
//     options: ExecFileOptionsWithBufferEncoding,
//     callback: (error: ExecFileException | null, stdout: Buffer, stderr: Buffer) => void
// ): ChildProcess;
// // `options` with well known `encoding` means stdout/stderr are definitely `string`.
// function execFile(file: string, options: ExecFileOptionsWithStringEncoding, callback: (error: ExecFileException | null, stdout: string, stderr: string) => void): ChildProcess;
// function execFile(
//     file: string,
//     args: ReadonlyArray<string> | undefined | null,
//     options: ExecFileOptionsWithStringEncoding,
//     callback: (error: ExecFileException | null, stdout: string, stderr: string) => void
// ): ChildProcess;
// // `options` with an `encoding` whose type is `string` means stdout/stderr could either be `Buffer` or `string`.
// // There is no guarantee the `encoding` is unknown as `string` is a superset of `BufferEncoding`.
// function execFile(file: string, options: ExecFileOptionsWithOtherEncoding, callback: (error: ExecFileException | null, stdout: string | Buffer, stderr: string | Buffer) => void): ChildProcess;
// function execFile(
//     file: string,
//     args: ReadonlyArray<string> | undefined | null,
//     options: ExecFileOptionsWithOtherEncoding,
//     callback: (error: ExecFileException | null, stdout: string | Buffer, stderr: string | Buffer) => void
// ): ChildProcess;
// // `options` without an `encoding` means stdout/stderr are definitely `string`.
// function execFile(file: string, options: ExecFileOptions, callback: (error: ExecFileException | null, stdout: string, stderr: string) => void): ChildProcess;
// function execFile(
//     file: string,
//     args: ReadonlyArray<string> | undefined | null,
//     options: ExecFileOptions,
//     callback: (error: ExecFileException | null, stdout: string, stderr: string) => void
// ): ChildProcess;
// // fallback if nothing else matches. Worst case is always `string | Buffer`.
// function execFile(
//     file: string,
//     options: (ObjectEncodingOptions & ExecFileOptions) | undefined | null,
//     callback: ((error: ExecFileException | null, stdout: string | Buffer, stderr: string | Buffer) => void) | undefined | null
// ): ChildProcess;
function execFile(file, args, options, callback) {
    return execFile(file, args, options, callback);
}
(function (execFile) {
    // function __promisify__(file: string): PromiseWithChild<{
    //     stdout: string;
    //     stderr: string;
    // }>;
    // function __promisify__(
    //     file: string,
    //     args: ReadonlyArray<string> | undefined | null
    // ): PromiseWithChild<{
    //     stdout: string;
    //     stderr: string;
    // }>;
    // function __promisify__(
    //     file: string,
    //     options: ExecFileOptionsWithBufferEncoding
    // ): PromiseWithChild<{
    //     stdout: Buffer;
    //     stderr: Buffer;
    // }>;
    // function __promisify__(
    //     file: string,
    //     args: ReadonlyArray<string> | undefined | null,
    //     options: ExecFileOptionsWithBufferEncoding
    // ): PromiseWithChild<{
    //     stdout: Buffer;
    //     stderr: Buffer;
    // }>;
    // function __promisify__(
    //     file: string,
    //     options: ExecFileOptionsWithStringEncoding
    // ): PromiseWithChild<{
    //     stdout: string;
    //     stderr: string;
    // }>;
    // function __promisify__(
    //     file: string,
    //     args: ReadonlyArray<string> | undefined | null,
    //     options: ExecFileOptionsWithStringEncoding
    // ): PromiseWithChild<{
    //     stdout: string;
    //     stderr: string;
    // }>;
    // function __promisify__(
    //     file: string,
    //     options: ExecFileOptionsWithOtherEncoding
    // ): PromiseWithChild<{
    //     stdout: string | Buffer;
    //     stderr: string | Buffer;
    // }>;
    // function __promisify__(
    //     file: string,
    //     args: ReadonlyArray<string> | undefined | null,
    //     options: ExecFileOptionsWithOtherEncoding
    // ): PromiseWithChild<{
    //     stdout: string | Buffer;
    //     stderr: string | Buffer;
    // }>;
    // function __promisify__(
    //     file: string,
    //     options: ExecFileOptions
    // ): PromiseWithChild<{
    //     stdout: string;
    //     stderr: string;
    // }>;
    // function __promisify__(
    //     file: string,
    //     args: ReadonlyArray<string> | undefined | null,
    //     options: ExecFileOptions
    // ): PromiseWithChild<{
    //     stdout: string;
    //     stderr: string;
    // }>;
    // function __promisify__(
    //     file: string,
    //     options: (ObjectEncodingOptions & ExecFileOptions) | undefined | null
    // ): PromiseWithChild<{
    //     stdout: string | Buffer;
    //     stderr: string | Buffer;
    // }>;
    function __promisify__(file, args, options) {
        return __promisify__(file, args, options);
    }
})(execFile || (execFile = {}));
/**
 * The `child_process.spawnSync()` method is generally identical to {@link spawn} with the exception that the function will not return
 * until the child process has fully closed. When a timeout has been encountered
 * and `killSignal` is sent, the method won't return until the process has
 * completely exited. If the process intercepts and handles the `SIGTERM` signal
 * and doesn't exit, the parent process will wait until the child process has
 * exited.
 *
 * **If the `shell` option is enabled, do not pass unsanitized user input to this**
 * **function. Any input containing shell metacharacters may be used to trigger**
 * **arbitrary command execution.**
 * @since v0.11.12
 * @param command The command to run.
 * @param args List of string arguments.
 */
// function spawnSync(command: string): SpawnSyncReturns<Buffer>;
// function spawnSync(command: string, options: SpawnSyncOptionsWithStringEncoding): SpawnSyncReturns<string>;
// function spawnSync(command: string, options: SpawnSyncOptionsWithBufferEncoding): SpawnSyncReturns<Buffer>;
// function spawnSync(command: string, options?: SpawnSyncOptions): SpawnSyncReturns<string | Buffer>;
// function spawnSync(command: string, args: ReadonlyArray<string>): SpawnSyncReturns<Buffer>;
// function spawnSync(command: string, args: ReadonlyArray<string>, options: SpawnSyncOptionsWithStringEncoding): SpawnSyncReturns<string>;
// function spawnSync(command: string, args: ReadonlyArray<string>, options: SpawnSyncOptionsWithBufferEncoding): SpawnSyncReturns<Buffer>;
function spawnSync(command, args, options) {
    return spawnSync(command, args, options);
}
exports.spawnSync = spawnSync;
/**
 * The `child_process.execSync()` method is generally identical to {@link exec} with the exception that the method will not return
 * until the child process has fully closed. When a timeout has been encountered
 * and `killSignal` is sent, the method won't return until the process has
 * completely exited. If the child process intercepts and handles the `SIGTERM`signal and doesn't exit, the parent process will wait until the child process
 * has exited.
 *
 * If the process times out or has a non-zero exit code, this method will throw.
 * The `Error` object will contain the entire result from {@link spawnSync}.
 *
 * **Never pass unsanitized user input to this function. Any input containing shell**
 * **metacharacters may be used to trigger arbitrary command execution.**
 * @since v0.11.12
 * @param command The command to run.
 * @return The stdout from the command.
 */
// function execSync(command: string): Buffer;
// function execSync(command: string, options: ExecSyncOptionsWithStringEncoding): string;
// function execSync(command: string, options: ExecSyncOptionsWithBufferEncoding): Buffer;
function execSync(command, options) {
    return execSync(command, options);
}
exports.execSync = execSync;
/**
 * The `child_process.execFileSync()` method is generally identical to {@link execFile} with the exception that the method will not
 * return until the child process has fully closed. When a timeout has been
 * encountered and `killSignal` is sent, the method won't return until the process
 * has completely exited.
 *
 * If the child process intercepts and handles the `SIGTERM` signal and
 * does not exit, the parent process will still wait until the child process has
 * exited.
 *
 * If the process times out or has a non-zero exit code, this method will throw an `Error` that will include the full result of the underlying {@link spawnSync}.
 *
 * **If the `shell` option is enabled, do not pass unsanitized user input to this**
 * **function. Any input containing shell metacharacters may be used to trigger**
 * **arbitrary command execution.**
 * @since v0.11.12
 * @param file The name or path of the executable file to run.
 * @param args List of string arguments.
 * @return The stdout from the command.
 */
// function execFileSync(file: string): Buffer;
// function execFileSync(file: string, options: ExecFileSyncOptionsWithStringEncoding): string;
// function execFileSync(file: string, options: ExecFileSyncOptionsWithBufferEncoding): Buffer;
// function execFileSync(file: string, options?: ExecFileSyncOptions): string | Buffer;
// function execFileSync(file: string, args: ReadonlyArray<string>): Buffer;
// function execFileSync(file: string, args: ReadonlyArray<string>, options: ExecFileSyncOptionsWithStringEncoding): string;
// function execFileSync(file: string, args: ReadonlyArray<string>, options: ExecFileSyncOptionsWithBufferEncoding): Buffer;
// function spawn(command: string, options?: SpawnOptionsWithoutStdio): ChildProcessWithoutNullStreams;
// function spawn(command: string, options: SpawnOptionsWithStdioTuple<StdioPipe, StdioPipe, StdioPipe>): ChildProcessByStdio<Writable, Readable, Readable>;
// function spawn(command: string, options: SpawnOptionsWithStdioTuple<StdioPipe, StdioPipe, StdioNull>): ChildProcessByStdio<Writable, Readable, null>;
// function spawn(command: string, options: SpawnOptionsWithStdioTuple<StdioPipe, StdioNull, StdioPipe>): ChildProcessByStdio<Writable, null, Readable>;
// function spawn(command: string, options: SpawnOptionsWithStdioTuple<StdioNull, StdioPipe, StdioPipe>): ChildProcessByStdio<null, Readable, Readable>;
// function spawn(command: string, options: SpawnOptionsWithStdioTuple<StdioPipe, StdioNull, StdioNull>): ChildProcessByStdio<Writable, null, null>;
// function spawn(command: string, options: SpawnOptionsWithStdioTuple<StdioNull, StdioPipe, StdioNull>): ChildProcessByStdio<null, Readable, null>;
// function spawn(command: string, options: SpawnOptionsWithStdioTuple<StdioNull, StdioNull, StdioPipe>): ChildProcessByStdio<null, null, Readable>;
// function spawn(command: string, options: SpawnOptionsWithStdioTuple<StdioNull, StdioNull, StdioNull>): ChildProcessByStdio<null, null, null>;
// function spawn(command: string, options: SpawnOptions): ChildProcess;
// // overloads of spawn with 'args'
// function spawn(command: string, args?: ReadonlyArray<string>, options?: SpawnOptionsWithoutStdio): ChildProcessWithoutNullStreams;
// function spawn(command: string, args: ReadonlyArray<string>, options: SpawnOptionsWithStdioTuple<StdioPipe, StdioPipe, StdioPipe>): ChildProcessByStdio<Writable, Readable, Readable>;
// function spawn(command: string, args: ReadonlyArray<string>, options: SpawnOptionsWithStdioTuple<StdioPipe, StdioPipe, StdioNull>): ChildProcessByStdio<Writable, Readable, null>;
// function spawn(command: string, args: ReadonlyArray<string>, options: SpawnOptionsWithStdioTuple<StdioPipe, StdioNull, StdioPipe>): ChildProcessByStdio<Writable, null, Readable>;
// function spawn(command: string, args: ReadonlyArray<string>, options: SpawnOptionsWithStdioTuple<StdioNull, StdioPipe, StdioPipe>): ChildProcessByStdio<null, Readable, Readable>;
// function spawn(command: string, args: ReadonlyArray<string>, options: SpawnOptionsWithStdioTuple<StdioPipe, StdioNull, StdioNull>): ChildProcessByStdio<Writable, null, null>;
// function spawn(command: string, args: ReadonlyArray<string>, options: SpawnOptionsWithStdioTuple<StdioNull, StdioPipe, StdioNull>): ChildProcessByStdio<null, Readable, null>;
// function spawn(command: string, args: ReadonlyArray<string>, options: SpawnOptionsWithStdioTuple<StdioNull, StdioNull, StdioPipe>): ChildProcessByStdio<null, null, Readable>;
// function spawn(command: string, args: ReadonlyArray<string>, options: SpawnOptionsWithStdioTuple<StdioNull, StdioNull, StdioNull>): ChildProcessByStdio<null, null, null>;
// function spawn(command: string, args: ReadonlyArray<string>, options: SpawnOptions): ChildProcess;
// }
// export * from 'child_process';
// export default { ChildProcess, exec, execFile, fork, spawn, execFileSync };
// declare module 'node:child_process' {
//     export * from 'child_process';
// }
// Path: src/child_process.js

},{"events":1}]},{},[2]);
