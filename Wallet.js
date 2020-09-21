const RpcClient  = require('./rpcClient');
const NodeClient  = require('nclient-lib');
const { exec, spawn } = require('child_process');
const { SSHConnection } = require('node-ssh-forward');
const ini = require('ini');
const config = require(process.cwd() + '/config.json');

class Wallet {
    constructor(config, autoConnect = true) {
        this.config = config;
        this.config.config_file = `${this.config.data_dir}/${this.config.coin}.conf`
        if(autoConnect) {
            this.connect();
        }
    }

    async connect() {
        this.rpcClient = new RpcClient();

        let content = await this.execShellCmd(`cat ${this.config.config_file}`);
        let iniData = ini.parse(content.stdout);
        let rpcHost = iniData.rpchost || 'localhost';
        let rpcPort = iniData.rpcport;
        if(global.local) {
            await this.localForwarPort(rpcPort);
        }

        await this.rpcClient.setup(rpcHost, rpcPort, iniData.rpcuser, iniData.rpcpassword);
    }

    async localForwarPort(rpcPort) {

        let res = await new Promise(resolve => {
            const net = require('net');
            let tester = net.createServer()
                .once('error', function (err) {
                    resolve(err.code === 'EADDRINUSE');
                })
                .once('listening', function () {
                    tester.once('close', function () {
                        resolve(false);
                    })
                        .close()
                })
                .listen(rpcPort)
        });

        if(res) {
            return;
        }

        const sshConnection = new SSHConnection({
            endHost: global.remote_ip,
            username: 'root',
        });
        try{
            await sshConnection.forward({
                fromPort: rpcPort,
                toPort: rpcPort,
                toHost: '127.0.0.1'
            }).catch((err)=>{
                console.log(`Error ${err}`);
            })
        } catch (e) {
            console.log(e);
        }
    }

    async execShellCmd(cmd) {
        if(global.local) {
            cmd = `ssh ${global.remote_server} ${cmd}`;
        }
        return await new Promise(function(resolve, reject) {
            exec(cmd, (err, stdout, stderr) => {
                if (err) {
                    reject(err);
                }
                resolve({
                    stdout:stdout,
                    stderr:stderr
                });
            });
        });
    }

    async rpcCommand(method, params) {
        let res = await this.rpcClient.rpcCommand(method, params);
        return res;
    }

    rpcCommandAsync(method, params, cb) {
        this.rpcClient.rpcCommandAsync(method, params, cb);
    }

    async help() {
        return await this.rpcCommand("help");
    }

    async getinfo() {
        return await this.rpcCommand("getblockchaininfo");
    }

    async getWalletInfo() {
        return await this.rpcCommand("getwalletinfo");
    }

    async getbalance() {
        return await this.rpcCommand("getbalance");
    }

    async getnetworkinfo() {
        return await this.rpcCommand("getnetworkinfo");
    }

    async getpeerinfo() {
        return await this.rpcCommand("getpeerinfo");
    }

    async listaccounts() {
        return await this.rpcCommand("listaccounts");
    }

    async getaddressesbyaccount(account) {
        return await this.rpcCommand("getaddressesbyaccount",[account]);
    }

    async masternodeListConf() {
        return await this.rpcCommand("masternode",["list-conf"]);
    }

    async stopNode() {
        return await this.rpcCommand("stop");
    }

    async getMnSyncStatus() {
        return await this.rpcCommand('mnsync', ['status']);
    }

    async getMnStatus() {
        return await this.rpcCommand('getmasternodestatus', []);
    }

    async startNode() {
        await this.execShellCmd(`${this.config.daemonPath} -daemon > /dev/null 2>&1 &`);
    }

    startNodeWithProgress(stream) {
        this.execShellCmd(`${this.config.daemonPath} -daemon > /dev/null 2>&1 &`);
        let cnt = 0;
        let limit = 100;
        let timer = setInterval(()=>{
            cnt ++;
            if(cnt > limit) {
                clearInterval(timer);
                stream.write("Node not started");
                stream.end();
            }
            this.rpcCommandAsync("getblockchaininfo",[],(err, res)=>{
                if(res && res.blocks) {
                    clearInterval(timer);
                    stream.write("Node started");
                    stream.end();
                } else {
                    stream.write("Wait for node to start");
                }
            })
        }, 3000);

    }

    stopNodeWithProgress(stream) {
        this.rpcCommandAsync("stop",[],(err, res) => {
            let cnt = 0;
            let limit = 10;
            let timer = setInterval(()=>{
                cnt ++;
                if(cnt > limit) {
                    clearInterval(timer);
                    stream.write("Node not stopped");
                    stream.end();
                }
                this.rpcCommandAsync("geblockchaininfo",[],(err, res)=>{
                    if(res && res.blocks) {
                        stream.write("Wait for node to stop");
                    } else {
                        new Promise(async resolve => {
                            let daemonPid = await this.getDeamonProcessId();
                            resolve(daemonPid)
                        }).then((daemonPid)=>{
                        clearInterval(timer);
                            if(daemonPid) {
                                stream.write("Node can not be stopped");
                            } else {
                        stream.write("Node stopped");
                            }
                        stream.end();
                        })
                    }
                })
            }, 3000);
        });

    }

    async waitForNodeStart(progress){
        let started = false;
        let _this = this;
        while(!started) {
            await new Promise( (resolve, reject) => {
                try {
                    setTimeout(async () => {
                        let nodeInfo = await this.getinfo();
                        progress(nodeInfo);
                        started = (nodeInfo !== null && typeof nodeInfo !== 'undefined' && typeof nodeInfo.blocks !== 'undefined');
                        resolve();
                    }, 5000);
                } catch (e) {
                }
            });
        }
    }

    async waitForNodeStop(progress){
        let stooped = false;
        let _this = this;
        while(!stooped) {
            await new Promise( (resolve, reject) => {
                setTimeout(async () => {
                    let nodeInfo = await this.getinfo();
                    progress(nodeInfo);
                    stooped = !((nodeInfo !== null && typeof nodeInfo !== 'undefined' && typeof nodeInfo.blocks !== 'undefined'));
                    resolve();
                }, 5000);
            });
        }
        // process.exit(0);
    }

    viewLog(stream) {
        let debugLogFile = `${this.config.data_dir}/debug.log`
        if(global.local) {
            let command = `tail -f ${debugLogFile}`;
            command = `ssh ${global.remote_server} '${command}'`;
            let cmd = spawn(command, [],{shell:true});
            cmd.stdout.pipe(stream);
        } else {
            let file = debugLogFile;
            // let cmd = `tail -n 10 ${file}`;
            // let res = this.execShellCmd(cmd);
            // stream.write(res.stdout);
            NodeClient.commonHandler.tailFile(stream, file);
        }
    }

    async isStarted() {
        let started;
        try {
            let nodeInfo = await this.rpcCommand("getblockchaininfo", []);
            started = ((nodeInfo !== null && typeof nodeInfo !== 'undefined' && typeof nodeInfo.blocks !== 'undefined'));
        } catch (e) {
            started = false
        }
        return started;
    }

    async getDeamonProcessId() {
        let cmd =  `ps aux | grep '${this.config.daemonPath}' | grep -v grep | awk '{print $2}'`;
        let res = await this.execShellCmd(cmd);
        let arr = res.stdout.split("\n");
        let pid = arr.shift();
        return pid;
    }

    async killDaemonProcess(force=false) {
        let pid = await this.getDeamonProcessId();
        let cmd = `kill ${force?'-9' : ''} ${pid}`;
        let res = await this.execShellCmd(cmd);
        return res;
    }

}

module.exports = Wallet;
