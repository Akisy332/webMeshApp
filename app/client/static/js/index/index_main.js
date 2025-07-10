"use strict";

// Обработка кнопки базы данных
let essenceCartBtn = document.querySelector("#db-button");

const mapManager = new MapManager('map');
const tableManager = new TableManager('table-body');


function windowIndexReadyFunc() {


    // Загрузка данных
    fetch('/initTableMap')
        .then(response => response.json())
        .then(data => {
            console.log(data.table)
            mapManager.setPosition(data.map)

            tableManager.updateTable(data.table)
            data.table.forEach(item => {
                mapManager.addOrUpdateMarker(item)
            });

            // Связываем только после загрузки данных
            new MapTableConnector(mapManager, tableManager);
        });

    essenceCartBtn.addEventListener("click", function () {
        window.location.href = "/database";
    });
}


window.onload = windowIndexReadyFunc;