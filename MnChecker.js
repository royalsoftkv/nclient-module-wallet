// const WalletCli = require('./WalletCli')
const Wallet = require('./Wallet');

class MnChecker {

    constructor(wallet) {
        this.wallet_name = wallet.name
        //console.log("MnChecker",  this.wallet_name)
        this.walletObj = global.getWallet(this.wallet_name)
        //console.log("MnChecker config",  config)
        //this.walletObj = new Wallet(config);
        // this.walletCli = new WalletCli(this.wallet)
    }


    start() {
        this.log(`Starting mnChecker for wallet ${this.wallet_name}`)
        setInterval(async ()=>{
            await this.check()
        }, 1000*30)

    }

    async check() {
        this.log(`Reading mastenodes for ${this.wallet_name}`)
        let masternodeListConf = await this.walletObj.masternodeListConf()
        if(masternodeListConf.error) {
            console.log(`Error reading masternodes`)
            return
        }
        for(let i in masternodeListConf) {
            let startMn = false
            let masternodeConf = masternodeListConf[i]
            let log = `Check masternode ${this.wallet_name}-${masternodeConf.alias} status=${masternodeConf.status}`
            //console.log(`masternode ${masternodeConf.alias} status=${masternodeConf.status} masternodeConf=${JSON.stringify(masternodeConf)}`)
            if(masternodeConf.status === 'ENABLED') {
                // let mnStatus = await this.walletCli.getMasternodeStatus(masternodeConf.txHash)
                let mnStatus = await this.walletObj.getMasternodeStatus(masternodeConf.txHash)
                let activeTime = mnStatus[0].activetime
                log += ' activetime=' + activeTime
                if(activeTime === 0) {
                    startMn = true
                }
            } else {
                startMn = true
            }
            if(startMn) {
                log += ' - need to be started'
                let res = await this.startMasternodeAlias(masternodeConf.alias)
                if(res.detail && res.detail[0].result === 'successful') {
                    log += ' - started successful'
                } else {
                    log += ' - NOT STARTED'
                }
            } else {
                log += ' - ok'
            }
            this.log(log)
        }
    }

    async startMasternodeAlias(alias) {
        // return await this.walletCli.startMasternodeAlias(alias)
        return await this.walletObj.startMasternodeAlias(alias)
    }

    log(str) {
        console.log(`MnChecker: ${str}`)
    }
}

module.exports = MnChecker
