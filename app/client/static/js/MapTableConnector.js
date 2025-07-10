class MapTableConnector {
    constructor(mapManager, tableManager) {
        this.map = mapManager;
        this.table = tableManager;
        // this.setupEvents();
    }

    // setupEvents() {
    //     // При клике на строку таблицы - выделяем на карте
    //     this.table.rows.forEach(row => {
    //         row.element.addEventListener('click', () => {
    //             this.map.focusOnLayer(row.id);
    //         });
    //     });

    //     // При клике на объект карты - выделяем строку
    //     this.map.on('featureClick', (layerId) => {
    //         this.highlightTableRow(layerId);
    //     });
    // }

    // highlightTableRow(layerId) {
    //     // Логика выделения строки
    // }
}