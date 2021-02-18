const NodeClient = require('nclient-lib')

class WalletCli {

    constructor(wallet) {
        this.wallet = wallet
        this.walletCliPath = wallet.cliPath
    }


    async getMasternodeListConf() {
        return await this.execCli('masternode', ['list-conf'])
    }

    async getMasternodeStatus(txHash) {
        return await this.execCli('listmasternodes', [txHash])
    }

    async startMasternodeAlias(alias) {
        return await this.execCli('startmasternode', ['alias', false, alias])
    }

    async execCli(method, params, json=true) {
        params = params.join(" ")
        let cmd = `${this.walletCliPath} ${method} ${params}`
        let timeout = 30
        cmd = `timeout ${timeout} ${cmd}`
        let res = await NodeClient.commonHandler.execCmd(cmd)
        if(json) {
            try {
                return JSON.parse(res.stdout)
            } catch (e) {
                return null
            }
        }
        return res.stdout
    }

}


module.exports = WalletCli
