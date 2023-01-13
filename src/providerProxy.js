const path = require("path");

const { nanoid } = require("nanoid");

const spawn = (_command, _parameters, _options) => {
  // simulate socket
  const child = {
    send: (data) => {
      // console.log("send", data);
      // return true;

      // if data type if fetch return the axios response
      if (data.type === "fetch") {
        console.log("fetch", data);
        
        // fetch data from the server
        const axios = require("axios");
        axios({
          method: data.method,
          url: data.url,
          headers: data.headers,
          data: data.body,
          responseType: "arraybuffer"
        }).then((response) => {
          console.log("fetch response", response);
          // send the response to the proxy
          child.onmessage({
            data: {
              id: data.id,
              type: "fetch",
              response: {
                ok: true,
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                body: Buffer.from(response.data).toString("base64")
              },
              error: null
            }
          });

          return response;
        }).catch((error) => {
          console.log("fetch error", error);
          child.onmessage({
            data: {
              id: data.id,
              type: "fetch",
              response: null,
              error: error
            }
          });
        });
      }

      return true;
    },
    on: (event, callback) => {
      console.log("on", event, callback);
      return true;
    },
    stdout: {
      on: (event, callback) => {
        console.log("stdout.on", event, callback);
        return true;
      }
    },
    stdin: {
      on: (event, callback) => {
        console.log("stdin.on", event, callback);
        return true;
      }
    },
    stderr: {
      on: (event, callback) => {
        console.log("stderr.on", event, callback);
        return true;
      }
    },
    kill: () => {
      console.log("kill");
      return false;
    },
    disconnect: () => {
      console.log("disconnect");
      return false;
    },

    onmessage: (e) => {
      console.log("onmessage", e);
    }
  };

  return child;

}


let child = null;
function spawnProxy() {

  const dir = __dirname.replace("asar", "asar.unpacked");
  const command = path.join(dir, getProxyFilePath());

  const parameters = [];

  child = spawn(command, parameters, {
    env: {},
    stdio: ["pipe", "pipe", "pipe", "ipc"]
  });

  child.stdout.on("data", function (data) {});

  child.on("message", (response) => {
    if (response.type === "fetch") {
      if (response.error) {
        pendingRequests[response.id].rej(response.error);
      } else {
        pendingRequests[response.id].res(response.response);
      }
      delete pendingRequests[response.id];
    } else if (response.type === "websocket" && openSockets[response.id]) {
      // console.log("Received websocket message", response);
      openSockets[response.id].onMessage(response.message);
    }
  });

  child.on("close", (code, signal) => {
    console.error("Proxy was closed with code: " + code);
  });

  child.on("error", (err) => {
    console.error(err);
  });

  child.on("exit", (code, signal) => {
    console.error("Proxy exited with code: " + code);
  });
}
spawnProxy();

let pendingRequests = [];
let openSockets = [];

exports.openWebSocket = function (url, certPem, keyPem, onMessage) {
  const requestId = nanoid();

  // console.log("openWebSocket: ", child);

  openSockets[requestId] = {
    onMessage: onMessage
  };

  child.send({
    id: requestId,
    type: "websocket",
    url: url,
    certPem: certPem,
    keyPem: keyPem
  });

  // console.log("Sending websocket request: " + url);

  return {
    close: () => {
      // console.log("sending websocket_close");
      // console.log(child);
      child.send({
        id: requestId,
        type: "websocket_close"
      });
      // console.log("sent websocket_close");
      delete openSockets[requestId];
    },
    // TODO send
    send: (command) => {
      child.send({
        id: requestId,
        type: "message",
        command
      });
    }
  };
};

async function makeRequest(url, method, body, certPem, keyPem) {
  const requestId = nanoid();

  return new Promise((res, rej) => {
    pendingRequests[requestId] = {
      res: res,
      rej: rej
    };

    child.send({
      id: requestId,
      type: "fetch",
      url: url,
      method: method,
      body: body,
      certPem: certPem,
      keyPem: keyPem
    });
  });
}

exports.queryProvider = async function (url, method, body, certPem, prvPem) {
  // console.log("Querying provider using proxy");

  try {
    const response = await makeRequest(url, method, body, certPem, prvPem);

    return response;
  } catch (err) {
    console.error(err);
    // console.log("Failed to query provider with proxy");
    throw err;
  }
};

function getProxyFilePath() {
  switch (process.platform) {
    case "win32":
      return "./tools/cloudmos-provider-proxy.exe";
    case "linux":
      return "./tools/cloudmos-provider-proxy-lin";
    case "darwin":
      return "./tools/cloudmos-provider-proxy";
    default:
      console.log("Unsupported platform: " + process.platform);
      return "";
  }
}
