const bigRat = require('big-rational');
const jn = "http://204.13.114.87:7076";
exports.coingeckoAPI = "https://api.coingecko.com/api/v3/simple/price?ids=banano%2Cnano&vs_currencies=USD";
exports.nsendAPI = "https://rainstorm.city/api";
exports.npendAPI = "https://www.nanolooker.com/api/rpc";
exports.nverifyAPI = "https://www.nanolooker.com/api/rpc";
exports.ninfoAPI = "https://nano.a.exodus.io/";
exports.nunconfirmedblocksAPI = "https://www.nanolooker.com/api/rpc";

// Override with other node
//exports.npendAPI = jn;
exports.nsendAPI = jn;
exports.ninfoAPI = jn;

/*exports.ballAPI = global.process.env.NODE_ENV === "production" ?
    "http://localhost:7072/" :
    "https://kaliumapi.appditto.com/api";
exports.bdiffAPI = global.process.env.NODE_ENV === "production" ?
    "http://localhost:7072" :
    "http://api-beta.banano.cc:7070/";*/
exports.ballAPI = "https://kaliumapi.appditto.com/api";
exports.bdiffAPI = "http://api-beta.banano.cc:7070/";

exports.nworkAPI = "https://nano.a.exodus.io/";
exports.ndiffAPI = "https://mynano.ninja/api/node";

// Override
//exports.ndiffAPI = jn;

exports.defaultNanoRep = "nano_1isgusmnf1xe45iyjtfxw4qiai36zxdituu7gpni1trtj5ojyujobq13bjah";
exports.defaultBanRep = "ban_3p3sp1ynb5i3qxmqoha3pt79hyk8gxhtr58tk51qctwyyik6hy4dbbqbanan";
exports.NANO = true;
exports.BANANO = false;
exports.port = 8075;
exports.fee = 0.01;
exports.DATABASE_ERROR = {
    success: false,
    i: 0
};
exports.NETWORK_ERROR = {
    success: false,
    i: 1
};
exports.INSUFFICIENT_BALANCE = {
    success: false,
    i: 2
};
exports.UNRECOVERABLE_ERROR = {
    success: false,
    i: 3
};
exports.INVALID_ID = {
    success: false,
    i: 4
};
exports.SUCCESS_NOINFO = {
    success: true,
    n: true
};
exports.INVALID_ADDRESS = {
    success: false,
    i: 5
};
exports.MAIN_UNCONFIRMED = {
    success: false,
    i: 6
};
exports.API_RATE_LIMITED = {
    success: false,
    i: 7
};
exports.GUI_RATE_LIMITED = "Too many requests, please try again later";
exports.DB_BUY_CREATE = `
    CREATE TABLE IF NOT EXISTS buys(
        txid char(16) NOT NULL UNIQUE,
        xnoaddr char(133) NOT NULL,
        xnoseed char(133) NOT NULL,
        destaddr char(133) NOT NULL,
        hash varchar(133),
        amount decimal(16,7),
        sentamount decimal(16,7),
        status tinyint NOT NULL,
        error varchar(100)
    );`;
exports.DB_SELL_CREATE = exports.DB_BUY_CREATE.replace("buys", "sells")
    .replace("xnoaddr","xbnaddr")
    .replace("xnoseed","xbnseed");
exports.dynamicRoutes = {
    "/buy": ["pages/pre",true],
    "/sell": ["pages/pre",false],
    "/buy/new/*":["pages/new",true],
    "/sell/new/*":["pages/new",false],
    "/buy/check/*":["pages/check",true],
    "/sell/check/*":["pages/check",false]
}
exports.staticRoutes = {
    "/": "pages/index",
    "/unconfirmed": "pages/unconfirmed"
}
exports.BASIC_FAILURE = {
    "success": false
}
exports.TX_PROCESSING = {
    "success": true,
    "p": true
}
exports.UNRECEIVED = 0;
exports.RECEIVED_INTERMEDIATE = 1;
exports.SENT_MAIN = 2;
exports.TRADE_COMPLETE = 3;
exports.FAILED_RECEIVING = 4;
exports.FAILED_SENDING = 5;
exports.FAILED_SENDING_TARGET = 6;
exports.FAILED_UNRECOVERABLE = 7;
exports.SENT_TOO_MUCH = 8;
exports.COINGECKO_ERROR = 9;
exports.NANO_THRESHOLD = "9900000000000000000000000000"; // 0.01 nano
exports.BAN_THRESHOLD = "499000000000000000000000000000"; // 5 banano
exports.NANO_DECIMALS = bigRat(10n ** 30n);
exports.BAN_DECIMALS = bigRat(10n ** 29n);
exports.NANO_BASE_DIFFICULTY = "fffffff800000000";
exports.CMC_API = function() {
    let unixTimestamp = Math.floor(Date.now() /1000);
    return "https://web-api.coinmarketcap.com/v1.1/cryptocurrency/quotes/historical?convert=USD&format=chart_crypto_details&id=1567,4704&interval=5m" +
        "&time_end=" + unixTimestamp +
        "&time_start=" + (unixTimestamp-1);
};
exports.MKT_API = "https://api.coinmarketcap.com/data-api/v3/cryptocurrency/market-pairs/latest?slug=banano";
exports.MRBOOK_API = "https://mercatox.com/api/public/v1/orderbook?market_pair=BAN_BTC";
exports.BTC_PRICE_API = "https://api.coindesk.com/v1/bpi/currentprice/USD.json";