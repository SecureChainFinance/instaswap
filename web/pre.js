"use strict";

window.addEventListener('load', function () {
  document.getElementById("subaddr").addEventListener("click", function() {
    location.href = "/" + (window.isBuy ? "buy" : "sell") + "/new/"
        + document.getElementById("addr").value.replace(/[^a-zA-Z0-9_]*/g, '');
    return false;
  });
});