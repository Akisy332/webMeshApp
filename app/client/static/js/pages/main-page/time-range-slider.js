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
    const routeTimePlay = document.getElementById('route-time-play'); // Новая кнопка запуска

    // Переменные для анимации
    let animationInterval = null;
    let isAnimating = false;
    let animationSpeed = 50; // мс между шагами

    eventBus.on(EventTypes.ROUTE_SLIDER.TIME_RANGE_CHANGED, (timeRange) => {
        setTimeBounds(timeRange.min, timeRange.max);

        // Автоматически останавливаем анимацию если интервал стал 0-0
        if (timeRange.min === 0 && timeRange.max === 0 && isAnimating) {
            stopAnimation();
        }

        eventBus.emit(EventTypes.ROUTE_SLIDER.TIME_SLIDER_CHANGED, currentUnixTime);
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

            // Автоматически останавливаем анимацию если интервал стал 0-0
            if (isAnimating) {
                stopAnimation();
            }

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

            // Автоматически останавливаем анимацию если достигли конца
            if (isAnimating) {
                stopAnimation();
            }
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
        routeTimePlay.disabled = true;
        currentUnixTime = 0;
        updateTimeDisplays();
    }

    // Включение ползунка
    function enableSlider() {
        routeTimeSlider.disabled = false;
        routeTimePrev.disabled = false;
        routeTimeNext.disabled = false;
        routeTimePlay.disabled = false;
    }

    // Функция для запуска/остановки анимации
    function toggleAnimation() {
        if (isAnimating) {
            stopAnimation();
        } else {
            startAnimation();
        }
    }

    // Запуск анимации
    function startAnimation() {
        // Проверяем, что ползунок активен и интервал не нулевой
        if (routeTimeSlider.disabled || (minUnixTime === 0 && maxUnixTime === 0)) {
            return;
        }

        isAnimating = true;
        routeTimePlay.textContent = '⏸';
        routeTimePlay.classList.add('btn-warning');
        routeTimePlay.classList.remove('btn-success');

        animationInterval = setInterval(() => {
            const currentValue = parseInt(routeTimeSlider.value);

            // Проверяем, не стал ли интервал нулевым во время анимации
            if (minUnixTime === 0 && maxUnixTime === 0) {
                stopAnimation();
                return;
            }

            if (currentValue < totalSteps) {
                routeTimeSlider.value = currentValue + 1;
                routeTimeSlider.dispatchEvent(new Event('input'));
            } else {
                stopAnimation(); // Достигли конца - останавливаемся
            }
        }, animationSpeed);

        addRouteTimeLog('Анимация запущена');
    }

    // Остановка анимации
    function stopAnimation() {
        if (animationInterval) {
            clearInterval(animationInterval);
            animationInterval = null;
        }

        isAnimating = false;
        routeTimePlay.textContent = '▶';
        routeTimePlay.classList.remove('btn-warning');
        routeTimePlay.classList.add('btn-success');

        addRouteTimeLog('Анимация остановлена');
    }

    // Функция для получения позиции слайдера из Unix времени
    function getSliderPositionFromUnixTime(unixTime) {
        if (minUnixTime === maxUnixTime) return 0;
        const percentage = (unixTime - minUnixTime) / (maxUnixTime - minUnixTime);
        return Math.floor(percentage * totalSteps);
    }

    // Функция для получения Unix времени из позиции слайдера
    function getUnixTimeFromSliderPosition(position) {
        if (minUnixTime === 0 && maxUnixTime === 0) return 0;
        const percentage = position / totalSteps;
        return Math.floor(minUnixTime + (maxUnixTime - minUnixTime) * percentage);
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
            eventBus.emit(EventTypes.ROUTE_SLIDER.TIME_SLIDER_CHANGED, currentUnixTime);
            addRouteTimeLog(`Текущее время: ${formatUnixTime(currentUnixTime)} (Unix: ${currentUnixTime})`);

            // Если достигли конца во время анимации - останавливаем
            if (isAnimating && parseInt(this.value) >= totalSteps) {
                stopAnimation();
            }
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

    // Обработчик кнопки запуска/паузы
    if (routeTimePlay) {
        routeTimePlay.addEventListener('click', function () {
            if (routeTimeSlider.disabled) return;
            toggleAnimation();
        });
    }

    // Обработчик переключателя ползунка времени
    if (routeTimeSliderToggle && routeTimeSliderContainer) {
        routeTimeSliderToggle.addEventListener('change', function () {
            eventBus.emit(EventTypes.ROUTE_SLIDER.TIME_SLIDER_TOGGLE, this.checked);
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
                stopAnimation(); // Останавливаем анимацию при скрытии
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
                eventBus.emit(EventTypes.ROUTE_SLIDER.TIME_SLIDER_TOGGLE, true);
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

    // Остановка анимации при размонтировании
    window.addEventListener('beforeunload', function () {
        stopAnimation();
        // Принудительно сохраняем состояние перед закрытием
        saveSliderState();
    });



    addRouteTimeLog('Модуль временного ползунка загружен');
});