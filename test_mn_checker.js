const MnChecker = require("./MnChecker")
const NodeClient = require("nclient-lib")
const os = require("os")
const sleep = m => new Promise(r => setTimeout(r, m));
global.local = os.hostname()==="spectre"
global.walletNode = "wallet"


let executed = false
NodeClient.onSocketEvent('client_connected',  async () => {
    if(executed) {
        process.exit()
    }
    executed = true

    let mnc = new MnChecker({name:'allforonebusiness'})
    while(true) {
        await mnc.check()
        await sleep(30000)
    }

    process.exit()
})

NodeClient.init();
NodeClient.connect();
NodeClient.handle();
