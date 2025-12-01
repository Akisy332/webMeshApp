import * as L from 'leaflet';
import { eventBus } from '../../../core/event-bus.js';
import { EventTypes } from '../../../core/constants.js';

export class TimeSliderPlugin {
    private map: L.Map | null = null;

    private container: HTMLElement | null = null;
    private slider: HTMLInputElement | null = null;
    private playButton: HTMLButtonElement | null = null;
    private timeDisplay: HTMLSpanElement | null = null;
    private timeStart: HTMLSpanElement | null = null;
    private timeEnd: HTMLSpanElement | null = null;

    private isPlaying: boolean = false;
    private animationFrameId: number | null = null;
    private minTime: number = 0;
    private maxTime: number = 1000;

    constructor(map: L.Map) {
        this.map = map;
        this.initialize();
    }

    private initialize(): void {
        this.createControl();
        this.setupEventListeners();
    }

    private createControl(): void {
        if (!this.map) return;

        this.container = L.DomUtil.create('div', 'leaflet-control leaflet-control-time-slider time-slider-fullwidth');

        this.container.innerHTML = `
        <div class="time-slider-wrapper">
            <div class="time-slider-body">
                <!-- Временные метки и слайдер в компактном виде -->
                <div class="slider-compact-group">
                    <span class="time-label time-start">00:00:00</span>
                    <div class="slider-main">
                        <input type="range" class="time-slider" min="0" max="1000" value="0" step="1">
                        <div class="current-time-container">
                            <span class="time-current">00:00:00</span>
                        </div>
                    </div>
                    <span class="time-label time-end">00:00:00</span>
                </div>
                
                <!-- Кнопки управления СНИЗУ -->
                <div class="time-controls-group">
                    <button class="time-control-btn time-prev" title="Назад">◀</button>
                    <button class="time-control-btn time-play" title="Воспроизведение">▶</button>
                    <button class="time-control-btn time-next" title="Вперед">▶</button>
                    <button class="time-control-btn time-reset" title="Сброс">↺</button>
                </div>
            </div>
        </div>
    `;

        this.container.style.display = 'none';

        // Получаем элементы
        this.slider = this.container.querySelector('.time-slider') as HTMLInputElement;
        this.playButton = this.container.querySelector('.time-play') as HTMLButtonElement;
        this.timeDisplay = this.container.querySelector('.time-current') as HTMLSpanElement;
        this.timeStart = this.container.querySelector('.time-start') as HTMLSpanElement;
        this.timeEnd = this.container.querySelector('.time-end') as HTMLSpanElement;
        const prevButton = this.container.querySelector('.time-prev') as HTMLButtonElement;
        const nextButton = this.container.querySelector('.time-next') as HTMLButtonElement;
        const resetButton = this.container.querySelector('.time-reset') as HTMLButtonElement;

        // Обработчики событий
        this.slider.addEventListener('input', this.handleSliderInput.bind(this));
        this.slider.addEventListener('change', this.handleSliderChange.bind(this));
        this.playButton.addEventListener('click', this.togglePlayback.bind(this));
        prevButton.addEventListener('click', () => this.step(-10));
        nextButton.addEventListener('click', () => this.step(10));
        resetButton.addEventListener('click', this.reset.bind(this));

        // Добавляем на карту
        const mapContainer = this.map.getContainer();
        mapContainer.appendChild(this.container);

        // Предотвращаем закрытие карты при клике на контрол
        L.DomEvent.disableClickPropagation(this.container);
    }

    private setupEventListeners(): void {
        // Подписка на события изменения временного диапазона
        eventBus.on(EventTypes.ROUTE_SLIDER.TIME_RANGE_CHANGED, (data: any) => {
            this.setTimeRange(data.min, data.max);
        });

        // Подписка на события установки времени
        eventBus.on(EventTypes.ROUTE_SLIDER.TIME_SLIDER_SET, (time: number) => {
            this.setCurrentTime(time);
        });

        eventBus.on(EventTypes.MAP.TIME_SLIDER_TOGGLE, (data: any) => {
            if (data.enabled) {
                this.show();
            } else {
                this.hide();
            }
        });
    }

    private handleSliderInput(): void {
        if (!this.slider || !this.timeDisplay) return;

        const time = parseInt(this.slider.value);
        this.updateTimeDisplay(time);
    }

    private handleSliderChange(): void {
        if (!this.slider) return;

        const time = parseInt(this.slider.value);
        this.updateTimeDisplay(time);
        this.emitTimeChanged(time);
    }

    private togglePlayback(): void {
        if (this.isPlaying) {
            this.stopPlayback();
        } else {
            this.startPlayback();
        }
    }

    private startPlayback(): void {
        this.isPlaying = true;
        if (this.playButton) {
            this.playButton.textContent = '⏸';
            this.playButton.title = 'Пауза';
        }
        this.animatePlayback();
    }

    private stopPlayback(): void {
        this.isPlaying = false;
        if (this.playButton) {
            this.playButton.textContent = '▶';
            this.playButton.title = 'Воспроизведение';
        }

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    private animatePlayback(): void {
        if (!this.isPlaying || !this.slider) return;

        const currentValue = parseInt(this.slider.value);
        const maxValue = parseInt(this.slider.max);

        if (currentValue >= maxValue) {
            this.stopPlayback();
            return;
        }

        const newValue = currentValue + 1;
        this.slider.value = newValue.toString();
        this.updateTimeDisplay(newValue);
        this.emitTimeChanged(newValue);

        this.animationFrameId = requestAnimationFrame(() => this.animatePlayback());
    }

    private step(delta: number): void {
        this.stopPlayback();

        if (!this.slider) return;

        const currentValue = parseInt(this.slider.value);
        const newValue = Math.max(0, Math.min(parseInt(this.slider.max), currentValue + delta));

        this.slider.value = newValue.toString();
        this.updateTimeDisplay(newValue);
        this.emitTimeChanged(newValue);
    }

    private reset(): void {
        this.stopPlayback();

        if (this.slider) {
            this.slider.value = '0';
            this.updateTimeDisplay(0);
            this.emitTimeChanged(0);
        }
    }

    private updateTimeDisplay(time: number): void {
        if (!this.timeDisplay) return;

        this.timeDisplay.textContent = this.formatTime(time);
    }

    private emitTimeChanged(time: number): void {
        eventBus.emit(EventTypes.ROUTE_SLIDER.TIME_SLIDER_CHANGED, time);
    }

    // Публичные методы
    public setTimeRange(min: number, max: number): void {
        if (!this.slider || !this.timeStart || !this.timeEnd) return;

        this.minTime = min;
        this.maxTime = max;

        // Обновляем слайдер
        this.slider.min = min.toString();
        this.slider.max = max.toString();

        // ОБНОВЛЕНО: устанавливаем все временные метки
        this.timeStart.textContent = this.formatTime(min);
        this.timeEnd.textContent = this.formatTime(max);

        // Обновляем текущее время если нужно
        this.updateTimeDisplay(parseInt(this.slider.value));
    }

    public setCurrentTime(time: number): void {
        if (!this.slider) return;

        const clampedTime = Math.max(parseInt(this.slider.min), Math.min(parseInt(this.slider.max), time));
        this.slider.value = clampedTime.toString();
        this.updateTimeDisplay(clampedTime);
    }

    public hide(): void {
        if (this.container) {
            this.container.style.display = 'none';
        }
        this.stopPlayback();
    }

    public show(): void {
        if (this.container) {
            this.container.style.display = 'block';
        }
    }

    public isVisible(): boolean {
        return this.container ? this.container.style.display !== 'none' : false;
    }

    public destroy(): void {
        this.stopPlayback();

        // eventBus.off(EventTypes.ROUTE_SLIDER.TIME_RANGE_CHANGED, this.setTimeRange);
        // eventBus.off(EventTypes.ROUTE_SLIDER.TIME_SLIDER_SET, this.setCurrentTime);
        // eventBus.off(EventTypes.MAP.TIME_SLIDER_TOGGLE, this.setupEventListeners);

        if (this.container && this.map) {
            const mapContainer = this.map.getContainer();
            if (mapContainer.contains(this.container)) {
                mapContainer.removeChild(this.container);
            }
        }

        this.map = null;
        this.container = null;
        this.slider = null;
        this.playButton = null;
        this.timeDisplay = null;
        this.timeStart = null;
        this.timeEnd = null;
    }

    private formatTime(timestamp: number): string {
        let hours = '00';
        let minutes = '00';
        let seconds = '00';
        if (timestamp != 0) {
            const date = new Date(timestamp * 1000);
            hours = date.getUTCHours().toString().padStart(2, '0');
            minutes = date.getUTCMinutes().toString().padStart(2, '0');
            seconds = date.getUTCSeconds().toString().padStart(2, '0');
        }
        return `${hours}:${minutes}:${seconds}`;
    }
}

// Фабричный метод для удобного создания
export function timeSlider(map: L.Map): TimeSliderPlugin {
    return new TimeSliderPlugin(map);
}
