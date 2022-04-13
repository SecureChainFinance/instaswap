"use strict";

getRates(function (response) {
	if (!response) throw new Error(response);
	var banPerNano = response[0];
	var buyText = getId("buyratio");
	var sellText = getId("sellratio");
	buyText.textContent = buyText.textContent.replace("???", Math.floor(banPerNano * 0.99));
	sellText.textContent = sellText.textContent.replace("???", Math.ceil(banPerNano / 0.99));
	var ba = getId("buyAllowance");
	var sa = getId("sellAllowance");
	getAllowed(true, response, function(response) {
		ba.textContent = ba.textContent.replace("???", response);
	});
	getAllowed(false, response, function(response) {
		sa.textContent = sa.textContent.replace("###", response);
	});
});