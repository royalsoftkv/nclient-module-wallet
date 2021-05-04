const MnChecker = require("./MnChecker")
const NodeClient = require("nclient-lib")
const os = require("os")
global.local = os.hostname()==="spectre"
global.walletNode = "wallet"


let executed = false
NodeClient.onSocketEvent('client_connected',  async () => {
    if(executed) {
        process.exit()
    }
    executed = true

    let mnc = new MnChecker({name:'merge-wallet'})
    await mnc.check()

    process.exit()
})

NodeClient.init();
NodeClient.connect();
NodeClient.handle();
