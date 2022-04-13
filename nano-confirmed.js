const cr = require('./cached-request.js');
const u = require('./util.js');
const c = require('./const.js');

exports.nanoWalletConfirmed = class extends cr.cachedRequest {
    constructor(mainWalletAddress) {
        super(60, async function() {
            let res = await u.postRequest(c.nverifyAPI, {
               "action": "account_info",
               "account": mainWalletAddress
            });
            let accConfirmed = isAccConfirmed(res);
            // If we are unconfirmed
            if (accConfirmed.hasOwnProperty("confirmed") &&
                !accConfirmed["confirmed"] &&
                accConfirmed["conf_height"]) {
                // Do basic
                const lastConfirmation = this.conf_store;
                this.conf_store = accConfirmed["conf_height"];
                delete accConfirmed["conf_height"];
                // We have been at this last block confirmation before in an unconfirmed setting.
                // Return unconfirmed.
                if (this.conf_store === lastConfirmation) {
                    return accConfirmed;
                }
                // We're OK, it's not the same
                else {
                    return {
                        "confirmed": true
                    }
                }
            }
            return accConfirmed;
        });
        this.conf_store = null;
    }
}

function isAccConfirmed(res) {
    if (!res) return false;

    if (!res.hasOwnProperty("block_count") ||
        !res.hasOwnProperty("confirmation_height")) return false;

    let block_count = parseInt(res["block_count"]),
        conf_height = parseInt(res["confirmation_height"]);
    if (block_count === conf_height) {
        return {
            "confirmed": true
        };
    } else {
        return {
            "confirmed": false,
            "conf_height": conf_height
        };
    }
}