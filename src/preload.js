// const { ipcRenderer, shell, contextBridge } = require("electron");
// const { fork } = require("child_process");
// const { fork } = require("./child_process-browser.js");

const fork = (path, args, options) => {
  const child = new Worker(path);
  
  child.postMessage({ args, options });

  child.onmessage = (e) => {
    console.log("onmessage", e);
  }
  child.onmessageerror = (e) => {
    console.log("onmessageerror", e);
  }
  child.onerror = (e) => {
    console.log("onerror", e);
  }
  child.onclose = (e) => {
    console.log("onclose", e);
  }
  child.onexit = (e) => {
    console.log("onexit", e);
  }
  child.on = (event, callback) => {
    console.log("on", event, callback);
    return true;
  }
  child.send = (data) => {
    console.log("send", data);
    return data;
  }
  child.kill = () => {
    console.log("kill");
    return false;
  }
  child.disconnect = () => {
    console.log("disconnect");
    return false;
  }
  child.stdout = {
    on: (event, callback) => {
      console.log("stdout.on", event, callback);
      return true;
    }
  }
  child.stdin = {
    on: (event, callback) => {
      console.log("stdin.on", event, callback);
      return true;
    }
  }
  child.stderr = {
    on: (event, callback) => {
      console.log("stderr.on", event, callback);
      return true;
    }
  }


  return child;
}

const { executeKdf } = require("@cosmjs/proto-signing");


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
          url: 'https://proxy-cors-006.herokuapp.com/'+data.url,
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

  // const dir = __dirname.replace("asar", "asar.unpacked");
  // const command = path.join(dir, getProxyFilePath());

  const parameters = [];

  child = spawn("" /*command*/, parameters, {
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

const openWebSocket = function (url, certPem, keyPem, onMessage) {
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

const queryProvider = async function (url, method, body, certPem, prvPem) {
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


const path = require("path");
const fs = require("browserify-fs");
const helpers = require("./helpers");

const appVersion = "1.0.0";//window.process.argv[window.process.argv.length - 2];
const appEnvironment = "production";//window.process.argv[window.process.argv.length - 1];

// whitelist channels
const validChannels = ["update_available", "update_downloaded", "download_update", "restart_app", "show_notification", "check_update", "relaunch"];
const defaultSaveDialogOptions = {
  dialogTitle: "Save",
  buttonLabel: "Save",
  filters: [{ name: "txt", extensions: ["txt"] }],
  properties: []
};

let logsWorker;
let downloadWorker;

// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
// window.addEventListener("DOMContentLoaded", () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const type of ["chrome", "node", "electron"]) {
    replaceText(`${type}-version`, process.versions[type]);
  }
// });

// contextBridge.exposeInMainWorld("electron", {
window.electron = {
  queryProvider: (url, method, body, certPem, prvPem) => queryProvider(url, method, body, certPem, prvPem),
  openWebSocket: (url, certPem, prvPem, onMessage) => openWebSocket(url, certPem, prvPem, onMessage),
  openUrl: (url) => {
    // console.log("Opening in browser: " + url);
    // shell.openExternal(url);
    window.open(url, "_blank");
  },
  getAppVersion: () => appVersion,
  getAppEnvironment: () => appEnvironment,
  isDev: () => "",//ipcRenderer.invoke("isDev"),
  appPath: (name) => "",//ipcRenderer.invoke("app_path", name),
  openTemplateFromFile: async () => {
    const response = "";
    // await ipcRenderer.invoke("dialog", "showOpenDialog", {
    //   title: "Select a deployment template",
    //   filters: [{ name: "Deployment template", extensions: ["yml", "yaml", "txt"] }],
    //   properties: ["openFile"]
    // });
    if (response.canceled) {
      return null;
    } else {
      const path = response.filePaths[0];
      const buffer = await fs.readFile(path);
      const content = buffer.toString();

      return { path, content };
    }
  },
  downloadLogs: async (appPath, url, certPem, prvPem, fileName) => {
    return new Promise((res, rej) => {
      logsWorker = fork(path.join(__dirname, "/workers/log.worker-bundle.js"), ["args"], {
        stdio: ["pipe", "pipe", "pipe", "ipc"]
      });

      function cleanup() {
        logsWorker.kill();
        logsWorker = null;
      }

      logsWorker.on("error", (err) => {
        rej("Spawn failed! (" + err + ")");
        cleanup();
      });
      logsWorker.stderr.on("data", function (data) {
        rej(data);
        cleanup();
      });
      logsWorker.on("message", (data) => {
        res(data);
        cleanup();
      });

      logsWorker.send({ appPath, url, certPem, prvPem, fileName });
    });
  },
  cancelSaveLogs: async () => {
    logsWorker?.send("cleanup");

    await helpers.sleep(500);

    logsWorker?.kill();
    logsWorker = null;

    // Throw error to interupt the flow of execution
    throw new Error("Cancelled export logs");
  },
  saveFileFromTemp: async (oldPath, defaultPath, options = defaultSaveDialogOptions) => {
    const response = "";
    // await ipcRenderer.invoke("dialog", "showSaveDialog", {
    //   defaultPath,
    //   ...defaultSaveDialogOptions,
    //   ...options
    // });
    if (response.canceled) {
      return null;
    } else {
      const path = response.filePath;

      await fs.rename(oldPath, path);

      return path;
    }
  },
  downloadFile: async (appPath, url, certPem, prvPem, fileName) => {
    return new Promise((res, rej) => {
      downloadWorker = fork(path.join(__dirname, "/workers/download.worker-bundle.js"), ["args"], {
        stdio: ["pipe", "pipe", "pipe", "ipc"]
      });

      function cleanup() {
        downloadWorker.kill();
        downloadWorker = null;
      }

      downloadWorker.on("error", (err) => {
        rej("Spawn failed! (" + err + ")");
        cleanup();
      });
      downloadWorker.stderr.on("data", function (data) {
        rej(data);
        cleanup();
      });
      downloadWorker.on("message", (data) => {
        res(data);
        cleanup();
      });

      downloadWorker.send({ appPath, url, certPem, prvPem, fileName });
    });
  },
  cancelDownloadFile: async () => {
    downloadWorker?.send("cleanup");

    await helpers.sleep(500);

    downloadWorker?.kill();
    downloadWorker = null;

    // Throw error to interupt the flow of execution
    throw new Error("Cancelled download file");
  },
  executeKdf: async (password, kdfConf) => {
    const key = await executeKdf(password, kdfConf);
    return (key);

    // return new Promise((res, rej) => {
    //   const myWorker = fork(path.join(__dirname, "/workers/wallet.worker-bundle.js"), ["args"], {
    //     stdio: ["pipe", "pipe", "pipe", "ipc"]
    //   });

    //   myWorker.on("error", (err) => {
    //     rej("Spawn failed! (" + err + ")");
    //     myWorker.kill();
    //   });
    //   myWorker.stderr.on("data", function (data) {
    //     rej(data);
    //     myWorker.kill();
    //   });
    //   myWorker.on("message", (data) => {
    //     res(data);
    //     myWorker.kill();
    //   });

    //   myWorker.send({ password, kdfConf });
    // });
  },
  api: {
    send: (channel, data) => {
      if (validChannels.includes(channel)) {
        // ipcRenderer.send(channel, data);
      }
    },
    receive: (channel, func) => {
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender`
        // ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    removeAllListeners: (channel) => {
      if (validChannels.includes(channel)) {
        // ipcRenderer.removeAllListeners(channel);
      }
    }
  }
};  
