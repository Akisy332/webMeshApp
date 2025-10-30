"use strict";

// Обработка кнопки базы данных
let essenceCartBtn = document.querySelector("#db-button");

const mapManager = new MapManager('map');
const tableManager = new TableManager('table-body');


function windowIndexReadyFunc() {


    initSessionList();
    initModalWindow();
}


document.getElementById('add-data').addEventListener('click', function () {
    // Сбросить форму, если нужно
    document.getElementById('sessionForm').reset();

    // Показать модальное окно
    var modal = new bootstrap.Modal(document.getElementById('sessionModal'));
    modal.show();
});

window.onload = windowIndexReadyFunc;