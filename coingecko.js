const u = require('./util.js');
const c = require('./const.js');
const cr = require('./cached-request.js');

exports.coinGeckoAPI = class extends cr.cachedRequest {
    constructor() {
        super(120, async function() {
            // Try coinmarketcap
            try {
                let tmp = await u.doRequestHTML(c.CMC_API());
                let json = JSON.parse(tmp);
                let data = json["data"];
                let nanoPrice = data["1567"]["quotes"][0]["quote"]["USD"]["price"];
                let banPrice = data["4704"]["quotes"][0]["quote"]["USD"]["price"];
                let refinedBanPrice = await u.refineBanPrice(banPrice);
                if (refinedBanPrice) {
                    banPrice = refinedBanPrice;
                } else throw new Error(refinedBanPrice);
                if (!nanoPrice || !banPrice) throw new Error(tmp);
                return await u.adjustPricing({"banano":{"usd":banPrice},"nano":{"usd":nanoPrice}});
            }
            // CoinGecko fallback
            catch (e) {
                // Let's not fallback
                console.log("price error ret", e.message);
                return false;
                /*console.log("cg fallback " + e.message);
                let tmp = await u.doRequest(c.coingeckoAPI);
                try {
                    let json = JSON.parse(tmp);
                    return await u.adjustPricing(json);
                } catch (e) {
                    return {};
                }*/
            }
        });
    }
}