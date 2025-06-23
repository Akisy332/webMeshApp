"use strict";

// Обработка кнопки базы данных
let essenceCartBtn = document.querySelector("#db-button");


function windowIndexReadyFunc() {

    essenceCartBtn.addEventListener("click", function () {
        window.location.href = "/database";
    });
}


window.onload = windowIndexReadyFunc;