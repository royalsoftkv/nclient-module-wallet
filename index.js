const NodeClient = require('nclient-lib');
const Wallet = require('./Wallet');

const sleep = m => new Promise(r => setTimeout(r, m));

module.exports = {
    moduleInfo: NodeClient.readModuleInfo(require('./package.json'))
};

NodeClient.storeSocketData("test", 123)

let wallets = {};

global.extWallets = {};


global.getWallets = () => {
    let wlIds = [];
    let walletConfig = NodeClient.readConfig(module.exports.moduleInfo.id, 'wallets.json')
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
    return walletConfig;
};

function getWallet(name) {
    let config;
    let walletConfig = NodeClient.readConfig(module.exports.moduleInfo.id, 'wallets.json')
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
    return wallets[name];
}

async function getWalletAsync(name) {
    let config = findWalletConfig(name);
    if(config) {
        if(typeof wallets[name] === 'undefined') {
            let wallet = new Wallet(config, false);
            await wallet.connect();
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
    let res = await getWallet(sel_wallet).rpcCommand(method, params);
    return res;
};

global.startDaemon = (stream, params) => {
    let sel_wallet = params.wallet;
    getWallet(sel_wallet).startNodeWithProgress(stream);
};

global.stopDaemon = (stream, params) => {
    let sel_wallet = params.wallet;
    getWallet(sel_wallet).stopNodeWithProgress(stream);
};

global.viewLog = (stream, params) => {
    let sel_wallet = params.wallet;
    getWallet(sel_wallet).viewLog(stream);
};

global.getBalance = async (msg) => {
    let sel_wallet = msg.wallet;
    let info = await getWallet(sel_wallet).getinfo();
    let balance = info.balance;
    // let callback = msg.callback;
    // let to = msg.from;
    return balance;
    // NodeClient.sendRequest({to: to, method: callback, payload: balance});
};

global.getWalletStatus = async (msg) => {
    try{
        let info = await getWallet("merge-wallet").getinfo();
        let balance = info.balance;
        let masternodes = await getWallet("merge-wallet").rpcCommand("masternode",["list-conf"]);
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
        console.log(e);
        return 'Error retrieving wallet info';
    }
};

global.checkWallet = async (wallet) => {
    let config = findWalletConfig(wallet);
    let command = `ps uax | grep '${config.daemonPath}'`;
    let res = await (getWallet(wallet).execShellCmd(command));
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
    if(!started) {
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
    let daemonPid;
    let mnStatus
    if(started) {
        daemonPid = await walletObj.getDeamonProcessId();
        nodeInfo = await walletObj.getinfo();
        mnSyncStatus = await walletObj.getMnSyncStatus();
        mnStatus = await walletObj.getMnStatus();
    }
    let res = {
        started:started,
        blocks: nodeInfo && nodeInfo.blocks,
        mnSyncStatus:{
            IsBlockchainSynced: mnSyncStatus && mnSyncStatus.IsBlockchainSynced,
            RequestedMasternodeAssets: mnSyncStatus && mnSyncStatus.RequestedMasternodeAssets
        },
        daemonPid: daemonPid,
        mnStatus
    };
    return res;
};

global.storeWalletConfig = (walletData) => {
    NodeClient.storeConfig(module.exports.moduleInfo.id, 'wallets.json', walletData)
}



