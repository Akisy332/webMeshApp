import { eventBus } from '../../core/event-bus.js';
import { EventTypes } from '../../core/constants.js';

export class TimeRangeSlider {
    private container: HTMLElement;
    private slider: HTMLInputElement;
    private timeStart: HTMLElement;
    private timeCurrent: HTMLElement;
    private timeEnd: HTMLElement;
    private playBtn: HTMLElement;
    private prevBtn: HTMLElement;
    private nextBtn: HTMLElement;
    private toggleCheckbox: HTMLInputElement;

    private isPlaying: boolean = false;
    private animationFrameId: number | null = null;
    private currentTime: number = 0;
    private minTime: number = 0;
    private maxTime: number = 1000;
    private playbackSpeed: number = 1.0;

    constructor() {
        this.container = document.getElementById('route-time-slider-container')!;
        this.slider = document.getElementById('route-time-slider') as HTMLInputElement;
        this.timeStart = document.getElementById('route-time-start')!;
        this.timeCurrent = document.getElementById('route-time-current')!;
        this.timeEnd = document.getElementById('route-time-end')!;
        this.playBtn = document.getElementById('route-time-play')!;
        this.prevBtn = document.getElementById('route-time-prev')!;
        this.nextBtn = document.getElementById('route-time-next')!;
        this.toggleCheckbox = document.getElementById('route-time-slider-toggle') as HTMLInputElement;

        this.init();
    }

    private init(): void {
        console.log('TimeRangeSlider initializing...');
        
        this.bindEvents();
        this.setupEventListeners();
        this.updateDisplay();
        
        console.log('TimeRangeSlider initialized');
    }

    private bindEvents(): void {
        // Обработчики слайдера
        this.slider.addEventListener('input', () => {
            this.handleSliderInput();
        });

        this.slider.addEventListener('change', () => {
            this.handleSliderChange();
        });

        // Обработчики кнопок управления
        this.playBtn.addEventListener('click', () => {
            this.togglePlayback();
        });

        this.prevBtn.addEventListener('click', () => {
            this.stepBackward();
        });

        this.nextBtn.addEventListener('click', () => {
            this.stepForward();
        });

        // Обработчик переключателя видимости
        this.toggleCheckbox.addEventListener('change', () => {
            this.handleToggleChange();
        });
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
    }

    private handleSliderInput(): void {
        this.currentTime = parseInt(this.slider.value);
        this.updateDisplay();
    }

    private handleSliderChange(): void {
        this.currentTime = parseInt(this.slider.value);
        this.updateDisplay();
        this.emitTimeChanged();
    }

    private handleToggleChange(): void {
        const isChecked = this.toggleCheckbox.checked;
        
        if (isChecked) {
            this.show();
        } else {
            this.hide();
            this.stopPlayback();
        }

        eventBus.emit(EventTypes.ROUTE_SLIDER.TIME_SLIDER_TOGGLE, isChecked);
    }

    private togglePlayback(): void {
        if (this.isPlaying) {
            this.stopPlayback();
        } else {
            this.startPlayback();
        }
    }

    private startPlayback(): void {
        if (this.isPlaying) return;

        this.isPlaying = true;
        this.updatePlayButton();
        this.animatePlayback();
    }

    private stopPlayback(): void {
        this.isPlaying = false;
        this.updatePlayButton();
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    private animatePlayback(): void {
        if (!this.isPlaying) return;

        const now = Date.now();
        const deltaTime = (now - (this as any).lastFrameTime || now) / 1000;
        (this as any).lastFrameTime = now;

        // Обновляем время с учетом скорости воспроизведения
        this.currentTime += deltaTime * this.playbackSpeed * (this.maxTime - this.minTime) / 10;

        // Проверяем границы
        if (this.currentTime >= this.maxTime) {
            this.currentTime = this.maxTime;
            this.stopPlayback();
        } else if (this.currentTime <= this.minTime) {
            this.currentTime = this.minTime;
        }

        // Обновляем слайдер и отображение
        this.slider.value = this.currentTime.toString();
        this.updateDisplay();
        this.emitTimeChanged();

        // Продолжаем анимацию
        this.animationFrameId = requestAnimationFrame(() => this.animatePlayback());
    }

    private stepBackward(): void {
        this.stopPlayback();
        
        const step = (this.maxTime - this.minTime) / 100;
        this.currentTime = Math.max(this.minTime, this.currentTime - step);
        
        this.slider.value = this.currentTime.toString();
        this.updateDisplay();
        this.emitTimeChanged();
    }

    private stepForward(): void {
        this.stopPlayback();
        
        const step = (this.maxTime - this.minTime) / 100;
        this.currentTime = Math.min(this.maxTime, this.currentTime + step);
        
        this.slider.value = this.currentTime.toString();
        this.updateDisplay();
        this.emitTimeChanged();
    }

    public setTimeRange(min: number, max: number): void {
        this.minTime = min;
        this.maxTime = max;
        
        // Обновляем слайдер
        this.slider.min = min.toString();
        this.slider.max = max.toString();
        
        // Если текущее время вне нового диапазона, сбрасываем его
        if (this.currentTime < min) {
            this.currentTime = min;
        } else if (this.currentTime > max) {
            this.currentTime = max;
        }
        
        this.slider.value = this.currentTime.toString();
        this.updateDisplay();
    }

    public setCurrentTime(time: number): void {
        this.currentTime = Math.max(this.minTime, Math.min(this.maxTime, time));
        this.slider.value = this.currentTime.toString();
        this.updateDisplay();
        this.emitTimeChanged();
    }

    private updateDisplay(): void {
        // Обновляем текстовое отображение времени
        this.timeStart.textContent = this.formatTime(this.minTime);
        this.timeCurrent.textContent = this.formatTime(this.currentTime);
        this.timeEnd.textContent = this.formatTime(this.maxTime);
    }

    private updatePlayButton(): void {
        if (this.isPlaying) {
            this.playBtn.innerHTML = '<span style="font-size: 0.85em;">⏸</span>';
            this.playBtn.classList.remove('btn-success');
            this.playBtn.classList.add('btn-warning');
        } else {
            this.playBtn.innerHTML = '<span style="font-size: 0.85em; margin-left: 1px;">▶</span>';
            this.playBtn.classList.remove('btn-warning');
            this.playBtn.classList.add('btn-success');
        }
    }

    private emitTimeChanged(): void {
        eventBus.emit(EventTypes.ROUTE_SLIDER.TIME_SLIDER_CHANGED, this.currentTime);
    }

    private formatTime(timestamp: number): string {
        if (timestamp === 0) return '00:00:00';

        const date = new Date(timestamp * 1000);
        const hours = date.getUTCHours().toString().padStart(2, '0');
        const minutes = date.getUTCMinutes().toString().padStart(2, '0');
        const seconds = date.getUTCSeconds().toString().padStart(2, '0');

        return `${hours}:${minutes}:${seconds}`;
    }

    public show(): void {
        this.container.classList.remove('d-none');
    }

    public hide(): void {
        this.container.classList.add('d-none');
    }

    public setPlaybackSpeed(speed: number): void {
        this.playbackSpeed = Math.max(0.1, Math.min(10, speed));
    }

    public getCurrentTime(): number {
        return this.currentTime;
    }

    public getTimeRange(): { min: number; max: number } {
        return { min: this.minTime, max: this.maxTime };
    }

    public isVisible(): boolean {
        return !this.container.classList.contains('d-none');
    }

    public destroy(): void {
        this.stopPlayback();
        
        // Удаляем обработчики событий
        this.slider.removeEventListener('input', this.handleSliderInput);
        this.slider.removeEventListener('change', this.handleSliderChange);
        this.playBtn.removeEventListener('click', this.togglePlayback);
        this.prevBtn.removeEventListener('click', this.stepBackward);
        this.nextBtn.removeEventListener('click', this.stepForward);
        this.toggleCheckbox.removeEventListener('change', this.handleToggleChange);
        
        // Отписываемся от событий EventBus с правильной сигнатурой
        eventBus.off(EventTypes.ROUTE_SLIDER.TIME_RANGE_CHANGED, this.handleTimeRangeChanged.bind(this));
        eventBus.off(EventTypes.ROUTE_SLIDER.TIME_SLIDER_SET, this.handleTimeSliderSet.bind(this));
    }

    private handleTimeRangeChanged(data: any): void {
        this.setTimeRange(data.min, data.max);
    }

    private handleTimeSliderSet(time: number): void {
        this.setCurrentTime(time);
    }
}