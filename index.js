const NodeClient = require('nclient-lib');
const Stream = require('stream');
const Wallet = require('./Wallet');
const MnChecker = require('./MnChecker')

const sleep = m => new Promise(r => setTimeout(r, m));

module.exports = {
    moduleInfo: NodeClient.readModuleInfo(require('./package.json'))
};

let wallets = {};

global.extWallets = {};

setTimeout(()=>{
    let walletConfigCheck = NodeClient.readConfig(module.exports.moduleInfo.id, 'config.json', true)
    for (let i in walletConfigCheck) {
        let wallet = walletConfigCheck[i]
        if(wallet.mn_checker) {
            new MnChecker(wallet).start()
        }
    }
}, 10000)


global.getWallets = (params, cb) => {
    let wlIds = [];
    let walletConfig = NodeClient.readConfig(module.exports.moduleInfo.id, 'config.json')
    for(let i in walletConfig) {
        wlIds.push(walletConfig[i].name);
    }
    for(let i in global.extWallets) {
        if(wlIds.includes(i)) {
            continue;
        }
        wlIds.push(i);
        walletConfig.push(global.extWallets[i]);
    }
    if(typeof cb === "function") {
    cb(walletConfig)
	} else {
		return walletConfig
	}
};

global.getWallet = (name, cb) => {
    let config;
    let walletConfig = NodeClient.readConfig(module.exports.moduleInfo.id, 'config.json')
    for(let i in walletConfig) {
        if(walletConfig[i].name===name) {
            config = walletConfig[i];
            break;
        }
    }

    if(typeof wallets[name] === 'undefined') {
        let wallet = new Wallet(config);
        wallets[name]=wallet;
    }
    if(typeof cb === "function") {
    cb( wallets[name])
	} else {
		return wallets[name]
	}

}

async function getWalletAsync(name) {
    let config = findWalletConfig(name);
    if(config) {
        if(typeof wallets[name] === 'undefined') {
            let wallet = new Wallet(config);
            wallets[name]=wallet;
        }
        return wallets[name];
    }
}

function findWalletConfig(name) {
    let walletConfig = global.getWallets();
    let config;
    for(let i in walletConfig) {
        if(walletConfig[i].name===name) {
            config = walletConfig[i];
            return config;
        }
    }
}

global.rpcCommand = async (msg) => {
    let method = msg.method;
    let params = msg.params;
    let sel_wallet = msg.wallet;
    let res = await global.getWallet(sel_wallet).rpcCommand(method, params);
    return res;
};

global.startDaemon = (stream, params) => {
    let sel_wallet = params.wallet;
    global.getWallet(sel_wallet).startNodeWithProgress(stream);
};

global.stopDaemon = (stream, params) => {
    let sel_wallet = params.wallet;
    global.getWallet(sel_wallet).stopNodeWithProgress(stream);
};

global.viewLog = (stream, params) => {
    let sel_wallet = params.wallet;
    global.getWallet(sel_wallet).viewLog(stream);
};

global.getBalance = async (msg) => {
    let sel_wallet = msg.wallet;
    let info = await global.getWallet(sel_wallet).getinfo();
    let balance = info.balance;
    // let callback = msg.callback;
    // let to = msg.from;
    return balance;
};

global.getWalletStatus = async (params) => {
    try{
        let wallet = params.wallet
        let balance = await global.getWallet(wallet).getbalance();
        let masternodes = await global.getWallet(wallet).rpcCommand("masternode",["list-conf"]);
        let count = Object.keys(masternodes).length;
        let enabled = 0;
        for(let i in masternodes) {
            if(masternodes[i].status==='ENABLED') {
                enabled++;
            }
        }
        let msg = `MERGE: ${Number(balance).toFixed(2)} mn: ${enabled}/${count}`;
        return msg;
    } catch (e) {
        return 'Error retrieving wallet info';
    }
};

global.checkWallet = async (wallet) => {
    let config = findWalletConfig(wallet);
    let command = `ps uax | grep '${config.daemonPath}'`;
    let res = await (global.getWallet(wallet).execShellCmd(command));
    res = res.stdout;
    let lines = res.split("\n");
    for(let i in lines) {
        let line = lines[i];
        if(line.indexOf(config.daemonPath)>=0 && line.indexOf("grep")===-1) {
            return config;
        }
    }
    return false;
};

global.stopDaemonAndWait = async(wallet) => {
    let started;
    let walletObj;
    let nodeInfo;
    try {
        walletObj = await getWalletAsync(wallet);
        nodeInfo = await walletObj.rpcCommand("getinfo", []);
        started = (nodeInfo !== null && typeof nodeInfo !== 'undefined' && typeof nodeInfo.blocks !== 'undefined');
    } catch (e) {
        started  = false;
    }
    if(started) {
        let stopped = false;
        let res = await walletObj.rpcCommand("stop", []);
        let scnt = 0;
        let slimit = 10;
        while (!stopped) {
            scnt++;
            if (scnt > slimit) {
                return false;
            }
            try {
                nodeInfo = await walletObj.rpcCommand("getinfo", []);
                stopped = !((nodeInfo !== null && typeof nodeInfo !== 'undefined' && typeof nodeInfo.blocks !== 'undefined'));
                // updateDaemonStatusStreams(wallet)
            } catch (e) {
                stopped = true;
            }
            await sleep(5000);
        }
        return true;
    } else {
        return false;
    }
};

global.startDaemonAndWait = async(wallet) => {
    let started;
    let walletObj;
    let nodeInfo;
    try {
        walletObj = await getWalletAsync(wallet);
        nodeInfo = await walletObj.rpcCommand("getinfo", []);
        started = (nodeInfo !== null && typeof nodeInfo !== 'undefined' && typeof nodeInfo.blocks !== 'undefined');
    } catch (e) {
        started  = false;
    }
    if(!started && walletObj) {
        let res = await walletObj.execShellCmd(`${walletObj.config.daemonPath} -daemon > /dev/null 2>&1 &`);
        await sleep(5000);
        let scnt = 0;
        let slimit = 10;
        while (!started) {
            scnt++;
            if (scnt > slimit) {
                return false;
            }
            try {
                nodeInfo = await walletObj.rpcCommand("getinfo", []);
                started = ((nodeInfo !== null && typeof nodeInfo !== 'undefined' && typeof nodeInfo.blocks !== 'undefined'));
                updateDaemonStatusStreams(wallet)
            } catch (e) {
                started = false
            }
            await sleep(5000);
        }
        return true;
    }
};

global.getDaemonStatus = async (wallet) => {
    let walletObj = await getWalletAsync(wallet);
    let started = false;
    if(walletObj) {
        started = await walletObj.isStarted();
    }
    let nodeInfo;
    let mnSyncStatus;
    let mnStatus
    let walletInfo
    let daemonPid = await walletObj.getDeamonProcessId();
    if(started) {
        nodeInfo = await walletObj.getinfo();
        walletInfo = await walletObj.getWalletInfo();
        mnSyncStatus = await walletObj.getMnSyncStatus();
        mnStatus = await walletObj.getMnStatus();
    }
    let res = {}
    res.started = started
    res.blocks = nodeInfo && nodeInfo.blocks
    res.walletInfo = walletInfo
    if(mnSyncStatus && !mnSyncStatus.error) {
        res.mnSyncStatus = {
            IsBlockchainSynced: mnSyncStatus && mnSyncStatus.IsBlockchainSynced,
        }
        if(mnSyncStatus.RequestedMasternodeAssets) {
            res.mnSyncStatus.RequestedMasternodeAssets = mnSyncStatus.RequestedMasternodeAssets
        } else if (mnSyncStatus.AssetID) {
            res.mnSyncStatus.RequestedMasternodeAssets = mnSyncStatus.AssetID
        }
        if(typeof mnSyncStatus.RequestedMasternodeAttempt !== 'undefined' && String(mnSyncStatus.RequestedMasternodeAttempt).length > 0) {
            res.mnSyncStatus.RequestedMasternodeAttempt = mnSyncStatus.RequestedMasternodeAttempt
        } else if (typeof mnSyncStatus.Attempt !== 'undefined' && String(mnSyncStatus.Attempt).length > 0) {
            res.mnSyncStatus.RequestedMasternodeAttempt = mnSyncStatus.Attempt
        }
    }
    res.daemonPid = daemonPid
    res.mnStatus = mnStatus

    return res;
};

global.storeWalletConfig = (walletData, cb) => {
    NodeClient.storeConfig(module.exports.moduleInfo.id, 'config.json', walletData)
}

global.killProcess = async (params) => {
    let name = params.wallet
    let force = params.force
    let config = findWalletConfig(name);
    let walletObj = await getWalletAsync(name);
    let res = await walletObj.killDaemonProcess(force)
    let daemonPid = await walletObj.getDeamonProcessId()
    updateDaemonStatusStreams(name)
    return !daemonPid
}

function updateDaemonStatusStream(wallet, stream) {
        new Promise(async resolve => {
            let daemonStatus = await global.getDaemonStatus(wallet)
            resolve(daemonStatus)
        }).then(daemonStatus=>{
            stream && stream.write(daemonStatus)
        })
}

function updateDaemonStatusStreams(wallet) {
    // NodeClient.updateNodeStream('getDaemonStatusStream', (stream)=>{
    //     updateDaemonStatusStream(wallet, stream)
    // })
}

NodeClient.registerNodeStream('getDaemonStatusStream', (stream, wallet, ack)=>{
    this.streamInterval = setInterval(()=>{
        //console.log('getDaemonStatusStream interval')
        updateDaemonStatusStream(wallet, stream)
    }, 5000)
    updateDaemonStatusStream(wallet, stream)
    ack("START getDaemonStatusStream")
}, stream=>{
	console.log("STOP getDaemonStatusStream")
    clearInterval(this.streamInterval)
})


