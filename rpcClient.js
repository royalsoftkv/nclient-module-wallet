const Client = require("./Client");
const { exec } = require('child_process');
const util = require('util');

const cache = require('memory-cache');
const md5 = require('md5')

let counter = {}
let cacheEnabled = false

setInterval(()=>{
	for(let key in counter) {
		if(counter[key].cnt>0) {
			console.log("Stuck method" , counter[key])
		}
	}
}, 30000)

class RpcClient {
    constructor(config) {
        this.config = config
        this.timeout = config.rpc_timeout || 3000
        if(cacheEnabled) {
			this.cache = new cache.Cache()
		}
    }

    async rpcCommand(method, params) {
        return await new Promise((resolve, reject) => {
            this.rpcCommandAsync(method, params, resolve)
        })
    }

    rpcCommandAsync(method, params, cb) {

		let key = md5( this.config.name + method + JSON.stringify(params))

		if(!counter[key]) {
			counter[key]={
				name: this.config.name,
				method,
				params,
				cnt:0
			}
		}
		counter[key].cnt++

		if(counter[key].cnt>0) {
			if(cacheEnabled) {
				let data = this.cache.get(key)
				if(data) {
					console.log(`Read data from cache - method ${method}`)
					console.log(data)
					cb(data)
					return
				}
			}
		}

        let coinCli = this.config.cliPath
        let paramsList = ""
        if(params && params.length > 0) {
            paramsList = params.join(" ")
        }
        let cmd = `timeout ${Math.round(this.timeout/1000)}s ${coinCli} ${method} ${paramsList}`
        //console.log("Execute cli command ",cmd)
        if(global.local) {
            cmd = `ssh 3 ${global.remote_server} ${cmd}`;
        }
        exec(cmd, {timeout: this.timeout,maxBuffer: 1024 * 1024*2}, (err, stdout, stderr) => {
			if(counter[key]) {
					counter[key].cnt--
			}
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
            if(cacheEnabled){
				console.log(`Store data to cache - method ${method}`)
				this.cache.put(key, res, 10000)
			}
            cb(res);
        });
    }
}

module.exports = RpcClient;
