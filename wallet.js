const c = require('./const.js');
const u = require('./util.js');
const xno = require('nanocurrency');
const xbn = require('@bananocoin/bananojs');

exports.writeWallet = class {
    constructor(type, seed) {
        this.type = type;
        this.seed = seed;
        this.secretKey = xno.deriveSecretKey(this.seed, 0);
        this.publickey = xno.derivePublicKey(this.secretKey);
        this.address = xno.deriveAddress(this.publickey);
        if (!type) this.address = "ban" + this.address.substring(3);
    }

    async send(amount, wallet) {
        let rawAmount = u.toRaw(amount, this.type);
        return await this.sendRaw(rawAmount, wallet);
    }

    async sendRaw(amount, wallet, sweeping) {
		console.log("amount",amount);
		console.log("wallet",wallet);
		console.log("sweeping",sweeping);
        let walletParsed = parseWallet(wallet);
        let diffPre = await getDifficulty(this.type);
        let diff = diffPre["network_current"];
        if (!diff) return {
            "success": false,
            "dump": diffPre
        }
        let accountInfo = await accInfoHandle(this.type, this.address);
		console.log("accinfosendraw");
        if (accountInfo["error"]) return accountInfo["error"];
        let [frontier, balance, representative] = accountInfo["result"];
        let endBalance;
        // Check if sweeping
        if (sweeping) {
            endBalance = "0";
        } else {
            endBalance = (BigInt(balance) - amount).toString();
        }
		console.log(endBalance);
		console.log(balance);
        // Sending nothing??
        if (endBalance == balance) {
            return {
                "success": false,
                "dump": "sending nothing"
            }
        }
		console.log(accountInfo);
        // Generate work
        let pKeyAddress = xno.derivePublicKey(walletParsed);
		console.log('generate the work');
        let workP = await generateWork(frontier, diff, this.type);
        let work = workP["work"];
        if (!work) return {
            "success": false,
            "dump": workP
        };
		console.log("done");
        let block = {
            "type": "state",
            "account": this.address,
            "previous": frontier,
            "representative": representative,
            "balance": endBalance,
            "link": pKeyAddress,
            "work": work,
            "subtype": "send"
        };
        return await sendBlock(this.type, block, "send", this.secretKey);
    }

    async receivePending(pendingList) {
        let work;
        let workP;
        const accHistPre = await getAccHistory(this.type, this.address);
        const accountHistory = accHistPre["history"];
        if (accountHistory === undefined) return {
            "success": false,
            "dump": accHistPre
        };
        let newAccount = true;
        if (accountHistory.length > 0) newAccount = false;

        for (const pendingHash in pendingList) {
            if (!pendingList.hasOwnProperty(pendingHash)) continue;
            const pendingAmount = pendingList[pendingHash];
            let block;
            const diffPre = await getDifficulty(this.type);
            let diff = undefined;
            if (!this.type) diff = diffPre["network_current"];
            if (this.type) diff = diffPre["network_receive_current"];
            if (!diff) return {
                "success": false,
                "dump": diffPre
            };

            if (newAccount) {
				console.log("generating work");
                workP = await generateWork(this.publickey, diff, this.type);
                work = workP["work"];
				console.log(work);
                if (!work) return {
                    "success": false,
                    "dump": workP
                };
				console.log("generated work");
                block = {
                    "type": "state",
                    "account": this.address,
                    "previous": "0000000000000000000000000000000000000000000000000000000000000000",
                    "representative": this.type ? c.defaultNanoRep : c.defaultBanRep,
                    "balance": pendingAmount,
                    "link": pendingHash,
                    "work": work,
                    "subtype": "open"
                };
                await sendBlock(this.type, block, "open", this.secretKey);
            } else {
                const accountInfo = await accInfoHandle(this.type, this.address);
                if (accountInfo["error"]) return accountInfo["error"];
                const [frontier, balance, representative] = accountInfo["result"];
				console.log(accountInfo);
                const endBalance = (BigInt(balance) + BigInt(pendingAmount)).toString();
                let workP = await generateWork(frontier, diff, this.type);
                let work = workP["work"];
                if (!work) return {
                    "success": false,
                    "dump": workP
                };
                block = {
                    "type": "state",
                    "account": this.address,
                    "previous": frontier,
                    "representative": representative,
                    "balance": endBalance,
                    "link": pendingHash,
                    "work": work,
                    "subtype": "receive"
                };
                await sendBlock(this.type, block, "receive", this.secretKey);
            }

            newAccount = false;
        }

        return {
            "success": true
        };
    }
    async getBalance() {
        const balanceResult = await getBalanceHandle(this.type, this.address, true);
        if (balanceResult["error"]) return balanceResult["error"];
        const balance = BigInt(balanceResult["result"]);
        return {
            "success": true,
            "result": balance
        };
    }

    async unconfirmedPending() {
        const pending = await getPending(this.type, this.address, true);
        if ("blocks" in pending && Object.keys(pending["blocks"]).length > 0) {
            return pending["blocks"];
        }
        return false;
    }

    // Evaluation
    // async function getPending(type, addr, allBlocks, npend)
    async arePending() {
        // Get pending blocks: exodus confirmed
        const pending = await getPending(this.type, this.address);
        // If the "blocks" field does not exist, we failed.
        if (!("blocks" in pending)) return {
            "success": false,
            "dump": pending
        };
        // No pending blocks in exodus
        if (Object.keys(pending["blocks"]).length === 0) {
            // If we are buying, we can do some further checking.
            if (this.type) {
                // Get pending blocks: exodus unconfirmed
                const pendingAll = await getPending(this.type, this.address, true);
                // If exodus unconfirmed has blocks
                if ("blocks" in pendingAll) {
                    // If exodus unconfirmed blocks is greater than 0
                    if (Object.keys(pendingAll["blocks"]).length > 0) {
                        // Get pending blocks: nanolooker confirmed
                        const realPending = await getPending(this.type, this.address, false, true);
                        // If nanolooker confirmed has blocks
                        if ("blocks" in realPending) {
                            // If nanolooker confirmed blocks greater than 0
                            if (Object.keys(realPending["blocks"]).length > 0) {
                                // Return success
                                return {
                                    "success": true,
                                    "pending": true,
                                    "list": realPending["blocks"]
                                };
                            }
                        }
                    }
                }
            }
            return {
                "success": true,
                "pending": false
            };
        } else if (Object.keys(pending["blocks"]).length > 0) {
            return {
                "success": true,
                "pending": true,
                "list": pending["blocks"]
            };
        }
        return {
            "success":false,
            "dump":pending
        }
    }
}

function getPending(type, addr, allBlocks, npend) {
    return u.postRequest(type ? (npend ? c.npendAPI : (allBlocks ? c.nunconfirmedblocksAPI : c.ninfoAPI)) : c.ballAPI, {
        "action": "pending",
        "account": addr,
        "count": 1000,
        "threshold": (type ? c.NANO_THRESHOLD : c.BAN_THRESHOLD),
        "include_only_confirmed": allBlocks ? "false" : "true"
    });
}

async function getBalanceHandle(type, addr, pending) {
    const res = await u.postRequest(type ? c.ninfoAPI : c.ballAPI, {
        "action": "accounts_balances",
        "accounts": [addr]
    });
    const balancesPre = res["balances"];
    const errMsg = {
        "error": {
            "success": false,
            "dump": res
        }
    };
    if (balancesPre === undefined) return errMsg;
    const balancePre = balancesPre[Object.keys(balancesPre)[0]];
    if (balancePre === undefined) return errMsg;
    const balance = balancePre["balance"];
    return {
        "error": false,
        "result": balance
    };
}

async function getAccHistory(type, addr) {
    return await u.postRequest(type ? c.ninfoAPI : c.ballAPI, {
        "action": "account_history",
        "account": addr,
        "count": 1
    });
}

async function sendBlock(type, blockP, subtype, secretKey) {
    let satisfactoryResult = false;
    let block = blockP;
    let hash = type ? xno.hashBlock(block) : xbn.getBlockHash(block);
    block["signature"] = xno.signBlock({
        "hash": hash,
        "secretKey": secretKey
    });
    let finishedBlock = JSON.stringify(block);
    let completedRequest = {
        "block": finishedBlock,
        "subtype": subtype,
        "action": "process"
    };
    while (!satisfactoryResult) {
        var res = await u.postRequest(type ? c.nsendAPI : c.ballAPI, completedRequest);

        if (res["error"]) {
            if (res["error"].includes("Invalid block balance")) {
                await u.sleep(2000);
            } else {
                satisfactoryResult = true;
            }
        } else {
            var finishedHash = res["hash"];
            satisfactoryResult = true;
        }
    }
    if (!hash) return {
        "success": false,
        "dump": res,
        "hash": hash
    };
    return {
        "success": true,
        "hash": finishedHash
    };
}

async function generateWork(hash, diff, type) {
    const wantedMultiplier = u.multiplier_from_difficulty(c.NANO_BASE_DIFFICULTY, diff);
    let realMultiplier = wantedMultiplier;
    // If we are dealing with the NANO network, make some changes.
    if (type) {
        if (realMultiplier > 59) realMultiplier = 59;
        else if (realMultiplier < 32) realMultiplier = 32;
    }
    let result;
    while (true) {
        // Make work request
        result = await u.postRequest(c.nworkAPI, {
            "hash": hash,
            "multiplier": realMultiplier,
            "action": "work_generate"
        });
        // If we are not dealing with the NANO network, break and return.
        if (!type) break;
        // If we have a multiplier larger than the one we want, we are done.
        if (parseFloat(result["multiplier"]) > wantedMultiplier) break;
        // Otherwise, sleep and retry.
        await u.sleep(10000);
    }
    return result;
}

async function accInfoHandle(type, addr) {
    const accountInfo = await getAccInfo(type, addr);
    const frontier = accountInfo["frontier"];
    const balance = accountInfo["balance"];
    const representative = accountInfo["representative"];
	console.log(accountInfo);
    if (!(frontier && representative && balance)) return {
        "error": {
            "success": false,
            "dump": accountInfo
        }
    };
	console.log("suhccessaccinfohandle");
    return {
        "error": false,
        "result": [frontier, balance, representative]
    };
}

async function getAccInfo(type, addr) {
    return await u.postRequest(type ? c.ninfoAPI : c.ballAPI, {
        "action": "account_info",
        "account": addr,
        "pending": true,
        "representative": true
    });
}

async function getDifficulty(type) {
    if (!type) {
        return {
            "network_minimum": "fffffe0000000000",
            "network_current": "fffffe0000000000",
            "multiplier": "1.000000000000000"
        }
    }
    return await u.postRequest(type ? c.ndiffAPI : c.bdiffAPI, {
        "action": "active_difficulty"
    });
}

function parseWallet(wallet) {
    return wallet.startsWith("ban") ? "xrb" + wallet.substring(3) : wallet;
}