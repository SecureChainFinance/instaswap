const request = require('request');
const c = require('./const.js');
const axios = require('axios');
const cryptoUtils = require('./crypto.js');
const base58check = require('base58check');
const bigDec = require('bigdecimal');
const bigRat = require('big-rational');
const cryptoRandomString = require('crypto-random-string');

exports.doRequestInt = function (options) {
    return new Promise(function(resolve, reject) {
        request(options, function(error, res, body) {
            if (!error) {
                resolve(body);
            } else {
                reject(error);
            }
        });
    });
}

exports.doRequestHTML = async function(options) {
    try {
        return await exports.doRequestInt(options);
    } catch (e) {
        console.log(e);
        return "error";
    }
}

exports.doRequest = async function(options) {
    try {
        let res = await exports.doRequestInt(options);
		console.log(res);
        if (!isJSON(res)) return {};
        return res;
    } catch (e) {
        console.log(e);
        return {};
    }
}

/**
 * @param Object
 * @returns boolean
 */
function isJSON (something) {
    if (typeof something != 'string')
        something = JSON.stringify(something);

    try {
        JSON.parse(something);
        return true;
    } catch (e) {
        return false;
    }
}

exports.postRequest = function postRPC (url, data) {
	console.log(url);
	console.log(data);
    let options = {};
    return new Promise(async function (resolve, reject) {
        axios.post(url, data, options)
            .then((res) => {
				console.log(res.data);
				if (!isJSON(res.data)) resolve({});
				resolve(res.data);
            }).catch((err) => {
                console.log(err.data);
				resolve({});
            })
    })
}

exports.encrypt = function(string, key) {
    return base58check.encode(cryptoUtils.encrypt(string, key)).padEnd(133,"0");
}

exports.decrypt = function(string, key) {
    let toDecode = string.replace(/0/g,'');
    let decoded = base58check.decode(toDecode)["data"];
    return cryptoUtils.decrypt(decoded, key).toString('utf8');
}

exports.randomString = function (wantedLength) {
    return cryptoRandomString({
        length: wantedLength,
        type: 'alphanumeric'
    });
}

function sum(arr) {return arr.reduce((a, b) => a + b, 0)}

// Too many requests
/*exports.fetchBanPrice = async function() {
    try {
        // Let's fetch the first price. This is minor but will be considered in our final valuation.
        const res = await exports.doRequest(c.MKT_API);
        let pairs = JSON.parse(res)["data"]["marketPairs"];
        pairs[0]["volumeUsd"] /= 4;
        pairs = pairs.filter(x => x["priceExcluded"] === 0);
        let pairLength = pairs.length;
        for (var i = pairs.length - 1; i >= 0; i--) {
            let without = [].concat(pairs);
            without.splice(i, 1);
            let avg = averageWithVolume(without);
            let diff = Math.abs((pairs[i]["price"] / avg) - 1);
            if (diff > 0.3 || (diff > 0.15 && pairs[i]["exchangeId"] === 562)) pairs.splice(i, 1);
        }
        return averageWithVolume(pairs);
    } catch (e) {
        console.log("mkt fail" + e.message);
        return false;
    }
}*/

exports.refineBanPrice = async function(previousPrice) {
    // Now fetch the second price, consisting of only the Mercatox BAN/BTC pair.
    let res2 = await exports.doRequest(c.MRBOOK_API);
    res2 = JSON.parse(res2);
    let ask = Number.parseFloat(res2["asks"][0][0]);
    let bid = Number.parseFloat(res2["bids"][0][0]);
    if (!ask || !bid) throw new Error("No ask or bid on mercatox");
    let banPriceBtc = (ask + bid) / 2;

    let res3 = await exports.doRequest(c.BTC_PRICE_API);
    res3 = JSON.parse(res3);
    let btcPrice = res3["bpi"]["USD"]["rate_float"];
    if (!btcPrice) throw new Error("No btc price");
    let banBtcPrice = btcPrice * banPriceBtc;
    return (previousPrice * 0.1) + (banBtcPrice * 0.9);
}

/*function calculateTruePrice(mercatoxData) {
    let mustWithstandBAN = 100000;
    let asks = mercatoxData["asks"];
    let totalBought = 0;
    for (var i = 0; i < asks.length; i++) {
        let ask = parseFloat(asks[i]);
        let vol = parseFloat(ask[1]);
        let toBuy = vol;
        let newTotal = totalBought + toBuy;
        if (newTotal > mustWithstandBAN) toBuy = (mustWithstandBAN - newTotal);
    }
}*/

function averageWithVolume(pairs) {
    let totalVolume = sum(pairs.map(x => x["volumeUsd"]));
    return sum(pairs.map(x => x["price"] * (x["volumeUsd"] / totalVolume)));
}

exports.adjustPricing = async function (prices) {
    let banPrice = prices["banano"]["usd"];
    let nanoPrice = prices["nano"]["usd"];
    if (!banPrice || !nanoPrice) return prices;
    await exports.sleep(Math.round(Math.random() * 2.5 * 1000));
    try {
        let tmp = await exports.doRequestHTML("https://banano.nano.trade");
        let regex = /\((\d+) Banano:1 NANO\)/g;
        let match = regex.exec(tmp)[1];
        match = Number.parseInt(match);
        if (!match) return prices;
        let sellPrice = (nanoPrice/banPrice) / 0.99;
        let diff = sellPrice - match;
        if (diff > -1 && diff < 7) {
            banPrice = banPrice * ((1.0101 * nanoPrice)/(banPrice * (sellPrice - 6)));
            let tempPrices = prices;
            tempPrices["banano"]["usd"] = banPrice;
            return tempPrices;
        }
        return prices;
    } catch (e) {
        return prices;
    }
}

exports.isAlphaNumeric = function (str) {
    let code, i, len;

    for (i = 0, len = str.length; i < len; i++) {
        code = str.charCodeAt(i);
        if (!(code > 47 && code < 58) &&
            !(code > 64 && code < 91) &&
            !(code > 96 && code < 123)) {
            return false;
        }
    }
    return true;
}

exports.toRaw = function(decimal, nano) {
    return bigRat(decimal).multiply(nano ? c.NANO_DECIMALS : c.BAN_DECIMALS).round(true)["value"];
}

exports.toDec = function(raw, nano) {
    return bigRat(raw).divide(nano ? c.NANO_DECIMALS : c.BAN_DECIMALS);
}

exports.formatError = function (str) {
    if (!str) return "NE";
    let inter = JSON.stringify(str).replace(/\W/g, '');
    if (inter.length > 100) inter = inter.substring(0,100);
    return inter;
}

exports.blockExists = async function (type, hash) {
    const res = await postRequest((type ? c.ninfoAPI : c.ballAPI),
        {
            "action": "block_account",
            "hash": hash
        }
    );
    if (res["error"]) {
        if (res["error"] === "Block not found") return false;
        return null;
    }
    return true;
}

exports.multiplier_from_difficulty = function(base_difficulty, difficulty) {
    let big64 = bigDec.BigDecimal(2).pow(64);
    let big_diff = bigDec.BigDecimal(bigDec.BigInteger(difficulty,16));
    let big_base = bigDec.BigDecimal(bigDec.BigInteger(base_difficulty,16));
    let mode = bigDec.RoundingMode.HALF_DOWN();
    return big64.subtract(big_base).divide(big64.subtract(big_diff),32,mode).doubleValue();
}

exports.sleep = function(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

exports.extractInfo = function(row, buy, key, txid) {
    const seed = exports.decrypt(row[buy ? "xnoseed" : "xbnseed"], key);
    const userAddress = exports.decrypt(row[buy ? "xnoaddr" : "xbnaddr"], key);
    const dest = exports.decrypt(row["destaddr"], key);
    const txstatus = row["status"];
    let hash = row["hash"];
    const amountDB = row["amount"];
    const sentAmount = row["sentamount"];
    if (hash) hash = exports.decrypt(hash, key);
    if (txid) {
        const txid = row["txid"];
        return [seed, userAddress, dest, txstatus, amountDB, sentAmount, hash, txid];
    } else {
        return [seed, userAddress, dest, txstatus, amountDB, sentAmount, hash, txid];
    }
}