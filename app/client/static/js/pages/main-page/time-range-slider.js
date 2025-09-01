// Скрипт для временного ползунка маршрута
document.addEventListener('DOMContentLoaded', function () {
    // Элементы временного ползунка маршрута
    const routeTimeSliderToggle = document.getElementById('route-time-slider-toggle');
    const routeTimeSliderContainer = document.getElementById('route-time-slider-container');
    const routeTimeSlider = document.getElementById('route-time-slider');
    const routeTimeDisplay = document.getElementById('route-time-display');
    const routeTimeStart = document.getElementById('route-time-start');
    const routeTimeCurrent = document.getElementById('route-time-current');
    const routeTimeEnd = document.getElementById('route-time-end');
    const routeTimePrev = document.getElementById('route-time-prev');
    const routeTimeNext = document.getElementById('route-time-next');

    eventBus.on(EventTypes.ROUTE_SLIDER.TIME_RANGE_CHANGED, (timeRange) => {
        setTimeBounds(timeRange.min, timeRange.max)
        eventBus.emit(EventTypes.ROUTE_SLIDER.TIME_SLIDER_CHANGED, currentUnixTime)
    });

    // Переменные для хранения границ времени
    let minUnixTime = 0;
    let maxUnixTime = 0;
    let totalSteps = 1000;
    let currentUnixTime = 0; // Сохраняем текущее время отдельно

    // Функция для добавления логов (если доступна)
    function addRouteTimeLog(message) {
        if (typeof addLog === 'function') {
            addLog(message);
        } else {
            console.log('Route Time:', message);
        }
    }

    // Функция для форматирования Unix времени в HH:MM:SS
    function formatUnixTime(unixTime) {
        if (unixTime === 0) return "00:00:00";
        const date = new Date(unixTime * 1000); // Умножаем на 1000 для миллисекунд
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    // Функция для установки границ времени
    function setTimeBounds(minTime, maxTime) {
        const oldMinUnixTime = minUnixTime;
        const oldMaxUnixTime = maxUnixTime;

        minUnixTime = minTime;
        maxUnixTime = maxTime;

        // Проверяем, если границы 0-0, делаем ползунок неактивным
        if (minUnixTime === 0 && maxUnixTime === 0) {
            disableSlider();
            return;
        }

        // Включаем ползунок если был выключен
        enableSlider();

        // Сохраняем текущее время перед обновлением
        const savedCurrentTime = currentUnixTime;

        // Проверяем, выходит ли текущее время за новые границы
        let newPosition;
        if (savedCurrentTime < minUnixTime) {
            newPosition = 0; // Встаем на нижнюю границу
            currentUnixTime = minUnixTime;
        } else if (savedCurrentTime > maxUnixTime) {
            newPosition = totalSteps; // Встаем на верхнюю границу
            currentUnixTime = maxUnixTime;
        } else {
            // Сохраняем текущую позицию
            newPosition = getSliderPositionFromUnixTime(savedCurrentTime);
            currentUnixTime = savedCurrentTime;
        }

        // Устанавливаем позицию слайдера
        routeTimeSlider.value = newPosition;

        // Обновляем отображение времени
        updateTimeDisplays();
        addRouteTimeLog(`Границы времени установлены: ${minUnixTime} - ${maxUnixTime}`);
    }

    // Отключение ползунка
    function disableSlider() {
        routeTimeSlider.disabled = true;
        routeTimePrev.disabled = true;
        routeTimeNext.disabled = true;
        currentUnixTime = 0;
        updateTimeDisplays();
    }

    // Включение ползунка
    function enableSlider() {
        routeTimeSlider.disabled = false;
        routeTimePrev.disabled = false;
        routeTimeNext.disabled = false;
    }

    // Функция для получения Unix времени из позиции слайдера
    function getUnixTimeFromSliderPosition(position) {
        if (minUnixTime === 0 && maxUnixTime === 0) return 0;
        const percentage = position / totalSteps;
        return Math.floor(minUnixTime + (maxUnixTime - minUnixTime) * percentage);
    }

    // Функция для получения позиции слайдера из Unix времени
    function getSliderPositionFromUnixTime(unixTime) {
        if (minUnixTime === maxUnixTime) return 0;
        const percentage = (unixTime - minUnixTime) / (maxUnixTime - minUnixTime);
        return Math.floor(percentage * totalSteps);
    }

    // Обновление отображения времени
    function updateTimeDisplays() {
        if (routeTimeStart && routeTimeCurrent && routeTimeEnd) {
            if (minUnixTime === 0 && maxUnixTime === 0) {
                // Режим неактивного ползунка
                routeTimeStart.textContent = "00:00:00";
                routeTimeCurrent.textContent = "00:00:00";
                routeTimeEnd.textContent = "00:00:00";
            } else {
                // Нормальный режим
                routeTimeStart.textContent = formatUnixTime(minUnixTime);
                routeTimeCurrent.textContent = formatUnixTime(currentUnixTime);
                routeTimeEnd.textContent = formatUnixTime(maxUnixTime);
            }
        }
    }

    // Обработчики для элементов управления временем
    if (routeTimeSlider) {
        routeTimeSlider.addEventListener('input', function () {
            currentUnixTime = getUnixTimeFromSliderPosition(this.value);
            updateTimeDisplays();
            eventBus.emit(EventTypes.ROUTE_SLIDER.TIME_SLIDER_CHANGED, currentUnixTime)
            addRouteTimeLog(`Текущее время: ${formatUnixTime(currentUnixTime)} (Unix: ${currentUnixTime})`);
        });
    }

    if (routeTimePrev) {
        routeTimePrev.addEventListener('click', function () {
            if (routeTimeSlider.disabled) return;

            const currentValue = parseInt(routeTimeSlider.value);
            if (currentValue > 0) {
                routeTimeSlider.value = currentValue - 1;
                routeTimeSlider.dispatchEvent(new Event('input'));
            }
        });
    }

    if (routeTimeNext) {
        routeTimeNext.addEventListener('click', function () {
            if (routeTimeSlider.disabled) return;

            const currentValue = parseInt(routeTimeSlider.value);
            if (currentValue < totalSteps) {
                routeTimeSlider.value = currentValue + 1;
                routeTimeSlider.dispatchEvent(new Event('input'));
            }
        });
    }

    // Обработчик переключателя ползунка времени
    if (routeTimeSliderToggle && routeTimeSliderContainer) {
        routeTimeSliderToggle.addEventListener('change', function () {
            if (this.checked) {
                routeTimeSliderContainer.classList.remove('d-none');
                addRouteTimeLog('Временной ползунок показан');

                // Если границы 0-0, оставляем неактивным
                if (minUnixTime === 0 && maxUnixTime === 0) {
                    disableSlider();
                } else {
                    enableSlider();
                }
            } else {
                routeTimeSliderContainer.classList.add('d-none');
                addRouteTimeLog('Временной ползунок скрыт');
            }
            saveSliderState();
        });
    }

    // Сохранение и загрузка состояния
    function saveSliderState() {
        if (routeTimeSliderToggle && routeTimeSlider) {
            localStorage.setItem('routeTimeSliderVisible', routeTimeSliderToggle.checked);
            localStorage.setItem('routeTimeSliderValue', routeTimeSlider.value);
            localStorage.setItem('routeTimeMinUnix', minUnixTime);
            localStorage.setItem('routeTimeMaxUnix', maxUnixTime);
            localStorage.setItem('routeTimeCurrentUnix', currentUnixTime);
        }
    }

    function loadSliderState() {
        if (routeTimeSliderToggle && routeTimeSliderContainer && routeTimeSlider) {
            const savedVisible = localStorage.getItem('routeTimeSliderVisible');
            const savedValue = localStorage.getItem('routeTimeSliderValue');
            const savedMinUnix = localStorage.getItem('routeTimeMinUnix');
            const savedMaxUnix = localStorage.getItem('routeTimeMaxUnix');
            const savedCurrentUnix = localStorage.getItem('routeTimeCurrentUnix');

            if (savedVisible === 'true') {
                routeTimeSliderToggle.checked = true;
                routeTimeSliderContainer.classList.remove('d-none');

                if (savedMinUnix && savedMaxUnix) {
                    minUnixTime = parseInt(savedMinUnix);
                    maxUnixTime = parseInt(savedMaxUnix);
                }

                if (savedCurrentUnix) {
                    currentUnixTime = parseInt(savedCurrentUnix);
                }

                // Проверяем границы и активируем/деактивируем ползунок
                if (minUnixTime === 0 && maxUnixTime === 0) {
                    disableSlider();
                } else {
                    enableSlider();
                    if (savedValue) {
                        routeTimeSlider.value = savedValue;
                    }
                }

                updateTimeDisplays();
            }
        }
    }

    // Инициализация при загрузке
    loadSliderState();

    // Устанавливаем начальное текущее время
    if (minUnixTime !== 0 && maxUnixTime !== 0) {
        currentUnixTime = getUnixTimeFromSliderPosition(routeTimeSlider.value);
    }

    addRouteTimeLog('Модуль временного ползунка загружен');
});