// const WalletCli = require('./WalletCli')
const Wallet = require('./Wallet');
const NodeClient = require("nclient-lib")

class MnChecker {

    constructor(wallet) {
        this.wallet_name = wallet.name
        //console.log("MnChecker",  this.wallet_name)
        // this.walletObj = this.getWallet()
        //console.log("MnChecker config",  config)
        //this.walletObj = new Wallet(config);
        // this.walletCli = new WalletCli(this.wallet)
    }

    async getWallet() {
        if(global.local) {
            let res = await NodeClient.asyncExecNodeMethod(global.walletNode, "getWallet", this.wallet_name)
            return res
        } else {
            let res  = global.getWallet(this.wallet_name)
            return res
        }
    }

    start() {
        this.log(`Starting mnChecker for wallet ${this.wallet_name}`)
        setInterval(async ()=>{
            await this.check()
        }, 1000*60)

    }

    async sendWalletCmdGroups(cmdGroups) {
        for(let i in cmdGroups) {
            let cmdGroup = cmdGroups[i]
            let res = await this.sendWalletCmd(cmdGroup[0],cmdGroup[1]);
            if(!(res.error && res.result.indexOf('Method not found')>=0)) {
                return res
            }
        }
    }


    async sendWalletCmd(cmd, params) {
        let res = await NodeClient.asyncExecNodeMethod(global.walletNode, 'rpcCommand',
            {method: cmd, params: params, wallet: this.wallet_name})
        return res
    }

    async masternodeListConf() {
        if(global.local) {
            let res = await this.sendWalletCmdGroups([
                ["masternode",["list-conf"]],
                ['listmasternodeconf', []]
            ])
            return res
        }
        let res = await this.walletObj.masternodeListConf()
        return res
    }

    async check() {

        this.walletObj = await this.getWallet()

        this.log(`Reading mastenodes for ${this.wallet_name}`)
        let masternodeListConf = await this.masternodeListConf()
        if(masternodeListConf.error) {
            console.log(`Error reading masternodes`)
            return
        }
        let walletConfig = this.walletObj.config
        for(let i in masternodeListConf) {
            let startMn = false
            let masternodeConf = masternodeListConf[i]
            let log = `Check masternode ${this.wallet_name}-${masternodeConf.alias} status=${masternodeConf.status}`
            //console.log(`masternode ${masternodeConf.alias} status=${masternodeConf.status} masternodeConf=${JSON.stringify(masternodeConf)}`)

            if(masternodeConf.status === 'ACTIVE' || masternodeConf.status === 'EXPIRED'
                || masternodeConf.status === 'MISSING') {
                let mn = walletConfig.masternodes[masternodeConf.alias]
                let res = await NodeClient.asyncExecNodeMethod(mn.server, "rpcCommand", {
                    method: "getmasternodestatus",
                    params: [],
                    wallet: mn.wallet
                })
                if((res.error && res.result === 'error: couldn\'t connect to server\n')
					|| (res.error && res.error.message.includes("ECONNREFUSED"))
				) {
                    log += ` - not running`
                    if(masternodeConf.status === 'EXPIRED' || masternodeConf.status === 'MISSING') {
						let res = await this.startMasternodeAlias(masternodeConf.alias)
						if ((res.detail && res.detail[0].result === 'successful') || (res.result && res.result === 'success')) {
							log += ' - started successful'
						} else {
							log += ' - NOT STARTED'
						}
					}
                } else if (res.status === 4) {
                    log += ` - already started`
                } else if (res.error && (res.result === 'error: {"code":-1,"message":"Active Masternode not initialized."}\n' ||
					res.result === 'error: {"code":-1,"message":"Masternode not found in the list of available masternodes. Current status: Not capable masternode: Hot node, waiting for remote activation."}\n'
					||
					res.error.message === "Masternode not found in the list of available masternodes. Current status: Not capable masternode: Hot node, waiting for remote activation."
					||
					res.error.message === "Active Masternode not initialized."
				)) {
                    let res = await this.startMasternodeAlias(masternodeConf.alias)
                    if ((res.detail && res.detail[0].result === 'successful') || (res.result && res.result === 'success')) {
                        log += ' - started successful'
                    } else {
						log += " res=" + JSON.stringify(res)
                        log += ' - NOT STARTED'
                    }
                } else {
                    log += " UNKNOWN reponse " + JSON.stringify(res)
                }
            } else if(masternodeConf.status === 'ENABLED') {
                log += ` - OK`
            // } else if(masternodeConf.status === 'EXPIRED') {
            //     let res = await this.startMasternodeAlias(masternodeConf.alias)
            //     if ((res.detail && res.detail[0].result === 'successful') || (res.result && res.result === 'success')) {
            //         log += ' - started successful'
            //     } else {
            //         log += ' - NOT STARTED'
            //     }
            // } else if(masternodeConf.status === 'MISSING') {
            //     let res = await this.startMasternodeAlias(masternodeConf.alias)
            //     if ((res.detail && res.detail[0].result === 'successful') || (res.result && res.result === 'success')) {
            //         log += ' - started successful'
            //     } else {
            //         log += ' - NOT STARTED'
            //     }
            } else {
                console.log(masternodeConf)
            }
            this.log(log)

            /*continue
            if(masternodeConf.status === 'ENABLED' || masternodeConf.status === 'ACTIVE') {
                // let mnStatus = await this.walletCli.getMasternodeStatus(masternodeConf.txHash)
                let mnStatus = await this.getMasternodeStatus(masternodeConf.txHash)
                let activeTime = mnStatus[0].activetime
                log += ' activetime=' + activeTime
                if(activeTime <= 0) {
                    startMn = true
                }
            } else {
                startMn = true
            }
            if (startMn) {
                let mn = walletConfig.masternodes[masternodeConf.alias]
                let res = await NodeClient.asyncExecNodeMethod(mn.server, "rpcCommand", {
                    method: "getmasternodestatus",
                    params: [],
                    wallet: mn.wallet
                })
                // console.log("masternode status", res)
                if ((res.status && res.status != 4)
                    || (res.result && res.result === 'error: {"code":-1,"message":"Active Masternode not initialized."}\n')
                    || (res.result && res.result === 'error: {"code":-1,"message":"Masternode not found in the list of available masternodes. Current status: Not capable masternode: Hot node, waiting for remote activation."}\n') || true) {
                    log += ' - need to be started'
                    let res = await this.startMasternodeAlias(masternodeConf.alias)
                    console.log("res", res)
                    if ((res.detail && res.detail[0].result === 'successful') || (res.result && res.result === 'success')) {
                        log += ' - started successful'
                    } else {
                        log += ' - NOT STARTED'
                    }
                } else {
                    log += ' - is already started or not running'
                }
            } else {
                log += ' - ok'
            }
            this.log(log)*/
        }
    }

    async getMasternodeStatus(txHash) {
        if(global.local) {
            let res = await this.sendWalletCmd('listmasternodes', [txHash])
            return res
        }
        return await this.walletObj.getMasternodeStatus(txHash)
    }

    async startMasternodeAlias(alias) {
        if(global.local) {
            let res = await this.sendWalletCmd('startmasternode', ['alias', false, alias])
            return res
        }
        // return await this.walletCli.startMasternodeAlias(alias)
        return await this.walletObj.startMasternodeAlias(alias)
    }

    log(str) {
        console.log(`MnChecker: ${str}`)
    }
}

module.exports = MnChecker
