"use strict";

// Обработка кнопки базы данных
let essenceCartBtn = document.querySelector("#db-button");

const mapManager = new MapManager('map');
const tableManager = new TableManager('table-body');


function windowIndexReadyFunc() {

    // if (typeof SlidePanel !== 'undefined') {
    //     window.slidePanel = new SlidePanel();
    // }

    // // Загрузка данных
    // fetch('/initTableMap')
    //     .then(response => response.json())
    //     .then(data => {
    //         console.log(data.table)
    //         mapManager.setPosition(data.map)

    //         tableManager.updateTable(data.table)
    //         data.table.forEach(item => {
    //             mapManager.addOrUpdateMarker(item)
    //         });
    //     });

    // essenceCartBtn.addEventListener("click", function () {
    //     window.location.href = "/database";
    // });

    initSessionList();
    initModalWindow();
}

// Обработчик кнопки - отправляем запрос на сервер
// document.getElementById('random-marker').addEventListener('click', function () {
//     eventBus.emit(EventTypes.APP.RANDOM_POINT);
// });

document.getElementById('add-data').addEventListener('click', function () {
    // Сбросить форму, если нужно
    document.getElementById('sessionForm').reset();

    // Показать модальное окно
    var modal = new bootstrap.Modal(document.getElementById('sessionModal'));
    modal.show();
});

window.onload = windowIndexReadyFunc;