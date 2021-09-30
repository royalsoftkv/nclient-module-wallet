const Client = require("./Client");
const { exec } = require('child_process');
const util = require('util');
const ini = require('ini')
const fs = require('fs')
const http = require('http')

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

function cb_handleRequestResponse (res, callOptions, cb) {
    var data = ''
    res.setEncoding('utf8')
    res.on('data', function (chunk) {
        data += chunk
    })
    res.on('end', function () {
        if (res.statusCode === 401) {
            cb(res.statusCode)
        } else {
            try {
				if(!callOptions.raw){
                data = JSON.parse(data)
				} else {
					console.log("cb_handleRequestResponse", data);
				}
                cb(null, data)
            } catch(err){
                cb(err, null)
            }
        }
    })
}

class RpcClient {
    constructor(config) {
        this.config = config
        this.timeout = config.rpc_timeout || 3000
        if(cacheEnabled) {
            this.cache = new cache.Cache()
        }
        let config_file = config.config_file
        //console.log(`Reading config file ${config_file}`)
        let content = fs.readFileSync(config_file, 'utf8')
        //console.log('File content', content)
        let data = ini.parse(content)
        //console.log('INI data:', data)
        this.rpchost = data.rpchost || '127.0.0.1'
        this.rpcport = data.rpcport
        this.rpcuser = data.rpcuser || null
        this.rpcpassword = data.rpcpassword || null
        console.log(`Connecting RPC ${this.rpchost}:${this.rpcport} ${this.rpcuser}:${this.rpcpassword}`)
        // bitcoin_rpc.init(rpchost, rpcport, rpcuser, rpcpassword)
        // bitcoin_rpc.setTimeout(this.timeout)
    }

    async rpcCommand(method, params) {
        return await new Promise((resolve, reject) => {
            this.rpcCommandAsync(method, params, resolve)
        })
    }

    rpcCommandAsync(method, params, cb) {

        let options = {}
        if(params && params.length > 0 && typeof params[params.length-1] === "object") {
            options = params.pop()
        }


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
            // cmd = `ssh 3 ${global.remote_server} ${cmd}`;
            let buff = new Buffer(cmd);
            let base64data = buff.toString('base64');
            cmd = `ssh ${global.remote_server} "echo ${base64data} | base64 -d | bash"`
            exec(cmd, {timeout: this.timeout,maxBuffer: 1024 * 1024*2}, (err, stdout, stderr) => {
                if(counter[key]) {
                    counter[key].cnt--
                }
                let res;
                if(err) {
                    res = {error: {message: err}, result: stderr};
                } else {
                    try {
                        if(options.raw) {
                            res = stdout
                        } else {
                            res = JSON.parse(stdout);
                        }
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
        } else {
            console.log(`${this.config.name}: Call RPC client method=${method} params=${JSON.stringify(params)} options=${JSON.stringify(options)}`)

            this.rpcCall(method, params, options, (err, res) => {
                //console.log('RPC response', err, res)
                let response
                if (err !== null) {
                    response = {error: {message: err}};
                    console.log(`${this.config.name}: RPC error method=${method} params=${JSON.stringify(params)}`, err)
                } else {
                    if(!res.result && res.error) {
                        response = {error: res.error};
                        console.log(`${this.config.name}: RPC error method=${method} params=${JSON.stringify(params)}`, response)
                    } else {
                        try {
							if(options.raw) {
								response = res
							} else {
                            response = res.result
							}
                        } catch (e) {
                            response = {error: {message: e.message}};
                            console.log(`${this.config.name}: RPC error method=${method} params=${JSON.stringify(params)}`, response)
                        }
                    }
                }
                //console.log("Return response",response)
                cb(response)
            })

        }
    }

    rpcCall(method, params, callOptions, cb) {

        //console.log('CALL rpcCall', method, params)

        if(JSON.stringify(params) === "{}") {
            params = []
        }

        let postData = JSON.stringify({
            method: method,
            params: params,
            id: '1'
        })

        let options = {
            hostname: this.rpchost,
            port: this.rpcport,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': postData.length
            },
            auth: this.rpcuser + ':' + this.rpcpassword
        }

        //console.log('Calking http request', postData, options)

        let req = http.request(options, (res) => {
            cb_handleRequestResponse(res, callOptions, cb)
        })

        req.on('error', function response (e) {
            cb(e.message)
        })

        req.setTimeout(this.timeout, function cb_onTimeout (e) {
            cb('Timed out')
            req.abort()
        })

        //console.log('Sending request',postData,options)

        // write data to request body
        req.write(postData)
        req.end()
    }
}

module.exports = RpcClient;
