"use strict";

window.addEventListener('load', function () {
	var reqUrl = "/api" + window.location.pathname;
	window.httpGet(reqUrl, function (response) {
		var res = JSON.parse(response);

		if (!res["success"]) {
			window.hideElement("load");
			parseErr(res["i"]);
			window.showElement("err");
		} else {
			window.hideElement("load");
			window.showElement("success");
			window.location.pathname = (isBuy ? "/buy" : "/sell") + "/check/" + res["id"];
		}
	});
});