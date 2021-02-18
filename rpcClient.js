const Client = require("./Client");
const { exec } = require('child_process');
const util = require('util');

class RpcClient {
    constructor(config) {
        this.config = config
        this.timeout = config.rpc_timeout || 3000
    }

    async rpcCommand(method, params) {
        return await new Promise((resolve, reject) => {
            this.rpcCommandAsync(method, params, resolve)
        })
    }

    rpcCommandAsync(method, params, cb) {
        let coinCli = this.config.cliPath
        let paramsList = ""
        if(params && params.length > 0) {
            paramsList = params.join(" ")
        }
        let cmd = `${coinCli} ${method} ${paramsList}`
        console.log("Execute cli command ",cmd)
        if(global.local) {
            cmd = `ssh 3 ${global.remote_server} ${cmd}`;
        }
        exec(cmd, {timeout: this.timeout}, (err, stdout, stderr) => {
            let res;
            if(err) {
                res = {error: {message: err}, result: stderr};
            } else {
                try {
                    res = JSON.parse(stdout);
                } catch (e) {
                    res = stdout
                }
            }
            cb(res);
        });
    }
}

module.exports = RpcClient;
