var globalResizeTimer = null;
var address = null;
window.addEventListener('load', function () {
	var cpBtn = document.getElementById("cpBtn");
	var addr = document.getElementById("addr");
	cpBtn.addEventListener("click", function () {
		copyToClipboard(addr.value);
		addr.click();
	});
	document.getElementById("txid").textContent = document.getElementById("txid").textContent.replace("############", window.location.pathname.split("/")[3].substring(0, 16));
	window.getId("addr").addEventListener('click', function () {
		this.select();
		this.setSelectionRange(0, this.value.length);
	});
	var reqUrl = "/api" + window.location.pathname;
	var type = window.isBuy ? "NANO" : "BAN";
	var typeInv = window.isBuy ? "BAN" : "NANO";
	window.httpGet(reqUrl, function (response) {
		var res = JSON.parse(response);

		if (!res["success"]) {
			window.getId("reload").style.display = "inline-block";
			window.hideElement("load");
			parseErr(res["i"]);
			showElement("err");
		} else {
			hideElement("load");

			if (res["p"]) {
				showElement("process");
				return;
			}

			if (res["n"]) {
				showElement("successnoinfo");
				return;
			}

			var transfer = res["transfer"];

			if (!transfer) {
				showElement("sendallowed");
				getId("reload").style.display = "inline-block";
				showElement("nosend");
				address = res["address"];
				document.getElementById("addr").value = address;
				qr();
				var sendallowed = getId("sendallowed");
				getRates(function (rates) {
					if (!rates) throw new Error(rates);
					getAllowed(window.isBuy, rates, function (completed) {
						sendallowed.textContent = sendallowed.textContent.replace("???", window.isBuy ? "0.01" : "5").replace("###", completed);
					});
				});
			} else {
				showElement("sent");
				var amount = roundSig(transfer[0]);
				var given = roundSig(transfer[1]);
				var ratio = roundSig(transfer[2]);
				var hash = transfer[3];
				var ratioText = ["1 NANO", ratio + " BAN"];
				if (!window.isBuy) ratioText.reverse();
				getId("sent").innerHTML = "<p class=\"white\"><strong>Success</strong></p><p>Converted ".concat(amount, " ").concat(type, " to ").concat(given, " ").concat(typeInv, "</p><p>Rate: ").concat(ratioText[0], " : ").concat(ratioText[1], "</p>");

				if (hash != 0 && hash) {
					getId("sent").innerHTML = getId("sent").innerHTML + "\n<p><a class=\"inlink\" href=\"https://".concat(isBuy ? "creeper.banano.cc/explorer/block/" : "www.nanolooker.com/block/","").concat(hash, "\">Hash</a></p>");
				}
			}
		}
	});
	window.addEventListener('resize', function () {
		if (globalResizeTimer != null) window.clearTimeout(globalResizeTimer);
		globalResizeTimer = window.setTimeout(qr, 200);
	});
});

function qr() {
	var size = document.getElementById("qrcode").clientWidth;
	document.getElementById("qrcode").textContent = "";
	new QRCode("qrcode", {
		text: address,
		width: size,
		height: size
	});
}