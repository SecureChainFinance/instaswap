function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }

function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }

function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) { arr2[i] = arr[i]; } return arr2; }

function _iterableToArrayLimit(arr, i) { if (typeof Symbol === "undefined" || !(Symbol.iterator in Object(arr))) return; var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

window.isBuy = window.location.pathname.split("/")[1] == "buy";
var nanoWalletURL = "https://rainstorm.city/api";
var nanoWalletBody = {
    "action": "accounts_balances",
    "accounts": ["nano_3htoq7firg6b1oeekyeujqsnksftkg45mzqsmhn99ucp1787c8oior6qq8ck"]
};
var banWalletURL = "https://api.creeper.banano.cc/v2/accounts/ban_3a1dokzzuc334kpsedakxz5hw4cauexjori8spcf7pninujry43dxkbam4o6";
var rates = null;

window.httpGet = function (url, callback) {
    var httpRequest = new XMLHttpRequest();

    httpRequest.onreadystatechange = function () {
        if (httpRequest.readyState == 4) callback(httpRequest.responseText);
    };

    httpRequest.open("GET", url, true);
    httpRequest.send(null);
};

window.httpPost = function(url, body, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(body));
    xhr.onload = function() {
        var data = JSON.parse(this.responseText);
        callback(data);
    }
}

window.getRates = function (callback) {
    window.httpGet("/api/rates", function (response) {
        var jr = JSON.parse(response);
        if (!jr["success"]) return false;
        var banPerNano = jr["nanoPrice"] / jr["banPrice"];
        var nanoPerBan = jr["banPrice"] / jr["nanoPrice"];
        callback([banPerNano, nanoPerBan]);
    });
};

window.getId = function (id) {
    return document.getElementById(id);
};

window.hideElement = function (id) {
    window.getId(id).style.display = "none";
};

window.showElement = function (id) {
    window.getId(id).style.display = "block";
};

window.roundSig = function (x) {
    return +x.toFixed(Math.max(-Math.log10(x) + 2, 2));
};

window.forceSlash = function (path) {
    return path + (path.endsWith("/") ? "" : "/");
};

window.getAllowed = function (buy, rates, callback) {
    if (buy) {
        window.httpGet(banWalletURL, function (resp2) {
            var res2 = JSON.parse(resp2);
            callback(processBalanceInfo(rates, res2["account"]["balance"], buy));
        });
    } else {
        window.httpPost(nanoWalletURL, nanoWalletBody, function(response) {
            var bals = response["balances"];
            var balance = bals[Object.keys(bals)[0]]["balance"];
            callback(processBalanceInfo(rates, balance, buy));
        });
    }

};

function processBalanceInfo(rates, bal, buy) {
    var _rates = _slicedToArray(rates, 2),
        banPerNano = _rates[0],
        nanoPerBan = _rates[1];

    var decimals = bigRat(10).pow(buy ? 29 : 30);
    var balance = bigRat(bal).divide(decimals);
    var completed = balance.multiply(bigRat(buy ? nanoPerBan : banPerNano));

    if (completed.lesser(10)) {
        completed = completed.toDecimal(2);
    } else {
        completed = completed.floor(true).toString();
    }
    return completed;
}

window.parseErr = function (id) {
    var msg;

    switch (id) {
        case 0:
            msg = "Database error\nPlease inform support\n";
            break;

        case 1:
            msg = "Network error\nPlease try reloading\nIf not contact support\n";
            break;

        case 2:
            msg = "Insufficient balance\n\nPlease contact support for refund\n\nOr reload if there is enough balance\n";
            break;

        case 3:
            msg = "Unrecoverable error\nPlease contact support";
            break;

        case 4:
            msg = "Invalid transaction ID";
            break;

        case 5:
            msg = "Invalid address";
            break;

        case 6:
            msg = "Main wallet unconfirmed";
            break;

        case 7:
            msg = "Too many requests\n\nPlease try again later";
            break;

        default:
            msg = "Unknown error";
    }
    var lines = msg.split("\n");
    for (var i = 0; i < lines.length; i++) {
        var elem = document.createElement("p");
        elem.textContent = lines[i];
        document.getElementById("errtext").appendChild(elem);
    }
};

// https://stackoverflow.com/a/33928558/6917530
function copyToClipboard(text) {
    if (window.clipboardData && window.clipboardData.setData) {
        // Internet Explorer-specific code path to prevent textarea being shown while dialog is visible.
        return window.clipboardData.setData("Text", text);
    } else if (document.queryCommandSupported && document.queryCommandSupported("copy")) {
        var textarea = document.createElement("textarea");
        textarea.textContent = text;
        textarea.style.position = "fixed"; // Prevent scrolling to bottom of page in Microsoft Edge.

        document.body.appendChild(textarea);
        textarea.select();

        try {
            return document.execCommand("copy"); // Security exception may be thrown by some browsers.
        } catch (ex) {
            return false;
        } finally {
            document.body.removeChild(textarea);
        }
    }
}