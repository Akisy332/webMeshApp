// Объект с типами событий
window.EventTypes = {
    ERROR: 'error',
    SOCKET: {
        // CONNECT: 'socketConnect',
        // DISCONNECT: 'socketDisconnect',
        NEW_DATA_MODULE: 'moduleUpdate'
    },
    APP: {
        // INIT: 'appInit',
        // READY: 'appReady'
        RANDOM_POINT: 'addRandomPoint'
    },
    TABLE: {
        CHECKBOX_MARKER: 'changeVisibleMarker',
        CHECKBOX_TRACE: 'changeVisibleTrace',
        CLEAR: 'clearTable'
        // ROW_SELECTED: 'tableRowSelected',
        // ROW_UPDATED: 'tableRowUpdated'
    },
    MAP: {

    },
    SESSION: {
        LOAD: 'loadSession'
    }
};