const Client = require("./Client");
const { exec } = require('child_process');
const util = require('util');

class RpcClient {
    constructor() {

    }

    async setup(rpcHost, rpcPort, rpcUser, rpcPass) {

        //console.log(`Connecting RPC client host = ${rpcHost} port=${rpcPort}`);
        try{
            this.client = new Client({
                host: rpcHost, port: rpcPort, protocol: 'http', onResponse: function (buffer) {
                    let cnt = 0;
                    buffer = buffer.replace(/("masternode":)/g, function (match, contents, offset, input_string) {
                        cnt++;
                        return `"masternode_${cnt}":`;
                    });
                    return buffer;
                }
            });
            this.client.setBasicAuth(rpcUser, rpcPass);
        } catch (e) {
            console.log(e);
        }
    }

    async rpcCommand(method, params) {
        //console.log(`\tExexuting RPC command ${method} ${params}`);
        //     if(typeof params === 'undefined') {
        //         params = [];
        //     }
        // try {
        //     let res = await util.promisify(this.client.call).bind(this.client)(method, params);
        //     return res;
        // } catch (e) {
        //     let message;
        //     if(typeof e === 'string') {
        //         message = e;
        //     } else {
        //         message = e.message;
        //     }
        //     let res = {error: {message: message}};
        //     return res;
        // }

        return new Promise((resolve, reject) => {
        if(typeof params === 'undefined') {
            params = [];
        }
            this.client.call(method, params, function(err, result){
                let res;
                if(err) {
                    res = {error: {message: err}, result: result};
                } else {
                    res = result;
        }
                resolve(res);
            })
        });
    }

    rpcCommandAsync(method, params, cb) {
        this.client.call(method, params, cb);
    }
}

module.exports = RpcClient;
