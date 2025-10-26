class RoutePlanner {
    constructor() {
        this.map = null;
        this.objectManager = null;
        this.routePolyline = null;
        this.currentPoints = [];
        this.smartRoute = null;
        this.baselineRoute = null;
        this.geocodedAddresses = [];
        this.currentTab = 'smart';

        this.initElements();
        this.initMap();
        this.initEventListeners();
    }

    initElements() {
        this.fileInput = document.getElementById('file');
        this.drop = document.getElementById('drop');
        this.picked = document.getElementById('picked');
        this.fileStatus = document.getElementById('fileStatus');
        this.optimizeBtn = document.getElementById('optimizeBtn');
        this.baselineBtn = document.getElementById('baselineBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.clearLog = document.getElementById('clearLog');
        this.mockMode = document.getElementById('mockMode');
        this.apiBaseInput = document.getElementById('apiBase');
        this.httpsWarn = document.getElementById('httpsWarn');
        this.dgisApiKeyInput = document.getElementById('dgisApiKey');
        this.apiKeyStatus = document.getElementById('apiKeyStatus');
        this.startTime = document.getElementById('startTime');
        this.lunchBreak = document.getElementById('lunchBreak');
        this.considerTraffic = document.getElementById('considerTraffic');
        this.visitDuration = document.getElementById('visitDuration');
        this.log = document.getElementById('log');
        this.progressContainer = document.getElementById('progressContainer');
        this.progressBar = document.getElementById('progressBar');
        this.progressText = document.getElementById('progressText');
        this.progressDetails = document.getElementById('progressDetails');
        this.resultStatus = document.getElementById('resultStatus');

        this.downloadCsv = document.getElementById('downloadCsv');
        this.downloadIcs = document.getElementById('downloadIcs');

        this.tabs = document.querySelectorAll('.tab');
        this.smartResults = document.getElementById('smartResults');
        this.baselineResults = document.getElementById('baselineResults');
        this.compareResults = document.getElementById('compareResults');
        this.improvementValue = document.getElementById('improvementValue');

        this.apiBaseInput.value = localStorage.getItem('apiBase') || 'https://hackatoon-production.up.railway.app';
        this.dgisApiKeyInput.value = localStorage.getItem('dgisApiKey') || '';
        this.checkHttpsMixed();
        this.validateApiKey();

        this.switchTab('smart');
    }

    initMap() {
        ymaps.ready(() => {
            this.map = new ymaps.Map('map', {
                center: [47.222, 39.718],
                zoom: 11,
                controls: ['zoomControl', 'fullscreenControl', 'typeSelector']
            });

            this.objectManager = new ymaps.ObjectManager({
                clusterize: true,
                gridSize: 32,
                clusterDisableClickZoom: true
            });

            this.objectManager.objects.options.set('preset', 'islands#blueCircleIcon');
            this.objectManager.clusters.options.set('preset', 'islands#blueClusterIcons');
            this.map.geoObjects.add(this.objectManager);

            this.map.controls.add('trafficControl');
            this.logMessage('🗺️ Карта инициализирована (Ростов-на-Дону)', 'success');
        });
    }

    initEventListeners() {
        ['dragenter', 'dragover'].forEach(ev => {
            this.drop.addEventListener(ev, e => {
                e.preventDefault();
                this.drop.classList.add('drag');
            });
        });

        ['dragleave', 'drop'].forEach(ev => {
            this.drop.addEventListener(ev, e => {
                e.preventDefault();
                this.drop.classList.remove('drag');
            });
        });

        this.drop.addEventListener('drop', e => {
            const file = e.dataTransfer.files?.[0];
            if (file) {
                this.fileInput.files = e.dataTransfer.files;
                this.setFileInfo(file);
            }
        });

        this.drop.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', () => {
            this.setFileInfo(this.fileInput.files?.[0]);
        });

        this.optimizeBtn.addEventListener('click', () => this.optimizeRoute('smart'));
        this.baselineBtn.addEventListener('click', () => this.optimizeRoute('baseline'));
        this.clearBtn.addEventListener('click', () => this.clearAll());
        this.clearLog.addEventListener('click', () => this.log.innerHTML = '');

        this.downloadCsv.addEventListener('click', () => this.exportCsv());
        this.downloadIcs.addEventListener('click', () => this.exportIcs());

        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        this.apiBaseInput.addEventListener('change', () => {
            localStorage.setItem('apiBase', this.apiBaseInput.value.trim());
            this.checkHttpsMixed();
        });

        this.dgisApiKeyInput.addEventListener('input', () => {
            localStorage.setItem('dgisApiKey', this.dgisApiKeyInput.value.trim());
            this.validateApiKey();
        });
    }

    switchTab(tabName) {
        this.tabs.forEach(tab => {
            if (tab.dataset.tab === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        this.smartResults.classList.toggle('hidden', tabName !== 'smart');
        this.baselineResults.classList.toggle('hidden', tabName !== 'baseline');
        this.compareResults.classList.toggle('hidden', tabName !== 'compare');

        this.currentTab = tabName;
        this.updateMapForCurrentTab();
    }

    updateMapForCurrentTab() {
        if (!this.map) return;

        if (this.routePolyline) {
            this.map.geoObjects.remove(this.routePolyline);
            this.routePolyline = null;
        }

        switch (this.currentTab) {
            case 'smart':
                if (this.smartRoute) {
                    this.displayRouteOnMap(this.smartRoute.route, 'smart');
                }
                break;
            case 'baseline':
                if (this.baselineRoute) {
                    this.displayRouteOnMap(this.baselineRoute.route, 'baseline');
                }
                break;
            case 'compare':
                if (this.smartRoute && this.baselineRoute) {
                    this.displayBothRoutes();
                } else if (this.smartRoute) {
                    this.displayRouteOnMap(this.smartRoute.route, 'smart');
                } else if (this.baselineRoute) {
                    this.displayRouteOnMap(this.baselineRoute.route, 'baseline');
                }
                break;
        }
    }

    displayBothRoutes() {
        if (!this.map || !this.smartRoute || !this.baselineRoute) return;

        this.objectManager.removeAll();

        this.createRoutePolyline(this.smartRoute.route, 'smart');
        this.createRoutePolyline(this.baselineRoute.route, 'baseline');
        this.addPointsToMap(this.smartRoute.route);
    }

    createRoutePolyline(route, type) {
    const coordinates = route.map(point => [point.lat, point.lon]); // <-- было [lon, lat]
    const polyline = new ymaps.Polyline(
        coordinates,
        {},
        {
        strokeColor: type === 'smart' ? '#5ac8fa' : '#ff6b6b',
        strokeWidth: 4,
        strokeOpacity: 0.7
        }
    );
    this.map.geoObjects.add(polyline);
    if (type === 'smart') this.routePolyline = polyline;
    }

    addPointsToMap(route) {
        this.objectManager.removeAll();
        route.forEach((point, index) => {
            this.objectManager.add({
            id: index,
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [point.lat, point.lon] // <-- было [lon, lat]
            },
            properties: {
                balloonContent: `
                <div style="padding: 8px;">
                    <strong>Точка ${index + 1}</strong><br/>
                    ${point.address}<br/>
                    <small>Время: ${point.arrival_time || 'N/A'}</small>
                </div>
                `,
                clusterCaption: `Точка ${index + 1}`,
                hintContent: point.address
            }
            });
        });
    }

    async optimizeRoute(type) {
        const file = this.fileInput.files?.[0];
        if (!file) {
            this.logMessage('❌ Выберите файл с адресами', 'error');
            return;
        }

        try {
            this.setLoading(true);
            this.resultStatus.textContent = 'Расчет...';
            this.resultStatus.style.background = 'var(--warning-bg)';

            this.logMessage(`🚀 Начинаем оптимизацию (${type === 'smart' ? 'умный маршрут' : 'базовый маршрут'})...`);

            if (this.mockMode.checked) {
                const result = await this.generateMockResult(type);
                this.handleOptimizationResult(result, type);
                
                // ДОБАВЛЕНО: вывод text_report в журнал
                if (result.text_report) {
                    this.logMessage(result.text_report);
                }
            } else {
                await this.processRealOptimization(type, file);
            }
        } catch (error) {
            this.logMessage(`❌ Ошибка: ${error.message}`, 'error');
            this.resultStatus.textContent = 'Ошибка';
            this.resultStatus.style.background = 'var(--error-bg)';
            console.error(error);
        } finally {
            this.setLoading(false);
        }
    }

    async processRealOptimization(type, file) {
        this.logMessage('📖 Отправка файла на сервер для обработки...');
        
        // Проверяем наличие API ключа
        const apiKey = this.dgisApiKeyInput.value.trim();
        if (!apiKey) {
            throw new Error('Необходимо указать ключ API 2ГИС');
        }

        this.logMessage('⚡ Оптимизация маршрута с использованием 2ГИС API...');
        const result = await this.sendToBackendForOptimization(null, null, type);

        this.handleOptimizationResult(result, type);
        
        // ДОБАВЛЕНО: вывод text_report в журнал
        if (result.text_report) {
            this.logMessage(result.text_report);
        }
    }

    async readAddressesFromFile(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                let addresses = [];

                if (file.name.endsWith('.csv')) {
                    addresses = content.split('\n')
                        .filter(line => line.trim())
                        .map(line => {
                            const parts = line.split(',');
                            return parts[0] ? parts[0].trim() : null;
                        })
                        .filter(addr => addr);
                } else {
                    addresses = content.split('\n')
                        .filter(line => line.trim())
                        .map(line => line.trim());
                }

                resolve(addresses.slice(0, 15));
            };
            reader.readAsText(file);
        });
    }

    async geocodeAddresses(addresses) {
        const results = [];
        const total = addresses.length;

        for (let i = 0; i < addresses.length; i++) {
            const address = addresses[i];
            const progress = (i / total) * 50;
            this.updateProgress(progress, `Геокодирование: ${address}`);

            try {
                const geocoded = await this.geocodeWithHttpApi(address);
                if (geocoded) {
                    results.push(geocoded);
                    this.logMessage(`✅ ${address} → ${geocoded.address}`, 'success');
                } else {
                    this.logMessage(`⚠️ Не найден: ${address}`, 'warning');
                }
            } catch (error) {
                this.logMessage(`❌ Ошибка геокодирования: ${address}`, 'error');
            }

            await this.delay(300);
        }
        return results;
    }

    async geocodeWithHttpApi(address) {
        const apiKey = '58c38b72-57f7-4946-bc13-a256d341281a';
        const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${apiKey}&format=json&geocode=${encodeURIComponent(address + ', Ростов-на-Дону')}`;

        try {
            const response = await fetch(url);
            const data = await response.json();

            if (data.response && data.response.GeoObjectCollection) {
                const found = data.response.GeoObjectCollection.featureMember;
                if (found.length > 0) {
                    const firstResult = found[0].GeoObject;
                    const coords = firstResult.Point.pos.split(' ').map(Number);
                    return {
                        address: firstResult.name,
                        original_address: address,
                        lat: coords[1],
                        lon: coords[0]
                    };
                }
            }
        } catch (error) {
            console.error('Ошибка HTTP геокодирования:', error);
            throw error;
        }
        return null;
    }

    async buildTimeMatrix(points) {
        const matrix = [];
        const totalPairs = points.length * points.length;
        let completed = 0;

        for (let i = 0; i < points.length; i++) {
            matrix[i] = [];
            for (let j = 0; j < points.length; j++) {
                if (i === j) {
                    matrix[i][j] = 0;
                    completed++;
                    continue;
                }

                const progress = 50 + (completed / totalPairs) * 50;
                this.updateProgress(progress, `Маршрут ${i+1} → ${j+1}`);

                try {
                    const from = [points[i].lon, points[i].lat];
                    const to = [points[j].lon, points[j].lat];

                    const route = await new Promise((resolve, reject) => {
                        ymaps.route([from, to], {
                            mapStateAutoApply: false,
                            avoidTrafficJams: this.considerTraffic.checked,
                            boundedBy: [
                                [46.8, 39.3],
                                [47.5, 40.2]
                            ]
                        }).then(resolve).catch(reject);
                    });

                    const duration = route.getJamsTime();
                    matrix[i][j] = Math.round(duration / 60);
                    this.logMessage(`🛣️ ${points[i].address} → ${points[j].address}: ${matrix[i][j]} мин`, 'info');

                } catch (error) {
                    this.logMessage(`⚠️ Ошибка маршрута ${i+1}→${j+1}`, 'warning');
                    matrix[i][j] = 999;
                }

                completed++;
                await this.delay(500);
            }
        }
        return matrix;
    }

    async sendToBackendForOptimization(points, timeMatrix, type) {
        const base = this.apiBaseInput.value.trim();
        const apiKey = this.dgisApiKeyInput.value.trim();

        // Проверяем наличие API ключа
        if (!apiKey) {
            throw new Error('Необходимо указать ключ API 2ГИС');
        }

        // Используем новый endpoint с передачей файла и API ключа
        this.logMessage('📡 Отправка данных на сервер (новый API 2ГИС)...');

        // Создаем FormData для отправки файла
        const formData = new FormData();
        const file = this.fileInput.files?.[0];
        if (!file) {
            throw new Error('Файл не найден');
        }
        formData.append('file', file);

        // Параметры запроса
        const params = new URLSearchParams({
            dgis_api_key: apiKey,
            work_start: this.startTime.value,
            work_end: this.getWorkEndTime(),
            meeting_minutes: parseInt(this.visitDuration.value) || 30
        });

        const response = await fetch(`${base}/api/optimize_2gis?${params}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        
        // Преобразуем результат в формат, ожидаемый фронтендом
        return this.convertApiResult(result);
    }

    getWorkEndTime() {
        const startTime = this.startTime.value;
        const [hours, minutes] = startTime.split(':').map(Number);
        const endHours = (hours + 9) % 24; // Добавляем 9 часов к началу работы
        return `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    convertApiResult(apiResult) {
        // Преобразуем результат нового API в формат, ожидаемый фронтендом
        const route = apiResult.route.map((point, index) => ({
            address: point.address,
            lat: point.lat || 0,
            lon: point.lon || 0,
            arrival_time: point.eta,
            duration: point.service_min || 30
        }));

        return {
            route: route,
            summary: {
                total_time_min: apiResult.summary.drive_min,
                visits: apiResult.summary.visits,
                late: apiResult.summary.late,
                late_penalty: apiResult.summary.late_penalty
            }
        };
    }

    handleOptimizationResult(result, type) {
        if (type === 'smart') {
            this.smartRoute = result;
            this.updateResultsDisplay(result, 'smart');
        } else {
            this.baselineRoute = result;
            this.updateResultsDisplay(result, 'baseline');
        }

        this.updateMapForCurrentTab();
        this.updateComparison();

        this.logMessage(`✅ Маршрут построен успешно!`, 'success');
        this.resultStatus.textContent = 'Готово';
        this.resultStatus.style.background = 'var(--success-bg)';

        this.downloadCsv.disabled = false;
        this.downloadIcs.disabled = false;

        if (type === 'smart' && !this.baselineRoute) {
            this.switchTab('smart');
        } else if (type === 'baseline' && !this.smartRoute) {
            this.switchTab('baseline');
        } else if (this.smartRoute && this.baselineRoute) {
            this.switchTab('compare');
        }
    }

    updateResultsDisplay(data, type) {
        const summary = data.summary;
        const prefix = type === 'smart' ? 'smart' : 'base';

        document.getElementById(`${prefix}Time`).textContent = this.formatMinutes(summary.total_time_min);
        document.getElementById(`${prefix}Visits`).textContent = summary.visits;
        document.getElementById(`${prefix}Late`).textContent = summary.late;
        document.getElementById(`${prefix}Penalty`).textContent = summary.late_penalty;
    }

    updateComparison() {
        if (this.smartRoute && this.baselineRoute) {
            const smart = this.smartRoute.summary;
            const base = this.baselineRoute.summary;

            document.getElementById('cmpSmartTime').textContent = this.formatMinutes(smart.total_time_min);
            document.getElementById('cmpSmartLate').textContent = smart.late;
            document.getElementById('cmpSmartPenalty').textContent = smart.late_penalty;

            document.getElementById('cmpBaseTime').textContent = this.formatMinutes(base.total_time_min);
            document.getElementById('cmpBaseLate').textContent = base.late;
            document.getElementById('cmpBasePenalty').textContent = base.late_penalty;

            const improvement = this.calculateImprovement(smart, base);
            document.getElementById('improvementValue').textContent = improvement;
        }
    }

    calculateImprovement(smart, base) {
        if (base.total_time_min === 0) return '+0%';
        const improvement = ((base.total_time_min - smart.total_time_min) / base.total_time_min) * 100;
        const sign = improvement > 0 ? '+' : '';
        return `${sign}${Math.round(improvement)}%`;
    }

    displayRouteOnMap(route, type) {
        if (!this.map) return;
        if (this.routePolyline) {
            this.map.geoObjects.remove(this.routePolyline);
        }
        this.objectManager.removeAll();
        this.createRoutePolyline(route, type);
        this.addPointsToMap(route);
        this.fitMapToBounds(route);
    }

    fitMapToBounds(points) {
        if (!this.map || points.length === 0) return;
        const coordinates = points.map(point => [point.lat, point.lon]);

        const bounds = this.map.geoObjects.getBounds();
        if (bounds) {
            this.map.setBounds(bounds, {
                checkZoomRange: true,
                zoomMargin: 50
            });
        }
    }

    async generateMockResult(type) {
        const mockAddresses = [
            { address: "ул. Большая Садовая, 1", lat: 47.222, lon: 39.718 },
            { address: "пр. Ворошиловский, 10", lat: 47.235, lon: 39.702 },
            { address: "ул. Пушкинская, 100", lat: 47.228, lon: 39.745 },
            { address: "пл. Гагарина, 1", lat: 47.258, lon: 39.682 },
            { address: "ул. Красноармейская, 50", lat: 47.240, lon: 39.728 }
        ];

        const route = mockAddresses.map((point, index) => ({
            ...point,
            arrival_time: `09:${index * 15}`.padStart(5, '0'),
            duration: 30
        }));

        const totalTime = type === 'smart' ? 125 : 180;
        const lateCount = type === 'smart' ? 1 : 3;

        return {
            route: route,
            summary: {
                total_time_min: totalTime,
                visits: mockAddresses.length,
                late: lateCount,
                late_penalty: lateCount * 1000
            }
        };
    }

    clearAll() {
        this.smartRoute = null;
        this.baselineRoute = null;
        this.geocodedAddresses = [];
        this.currentPoints = [];

        if (this.routePolyline) {
            this.map.geoObjects.remove(this.routePolyline);
            this.routePolyline = null;
        }
        this.objectManager.removeAll();

        this.updateResultsDisplay({summary: {total_time_min: 0, visits: 0, late: 0, late_penalty: 0}}, 'smart');
        this.updateResultsDisplay({summary: {total_time_min: 0, visits: 0, late: 0, late_penalty: 0}}, 'baseline');

        this.resultStatus.textContent = '-';
        this.resultStatus.style.background = '#2a2f4a';

        this.downloadCsv.disabled = true;
        this.downloadIcs.disabled = true;

        this.logMessage('🗑️ Все данные очищены', 'info');
    }

    exportCsv() {
        if (!this.smartRoute && !this.baselineRoute) {
            this.logMessage('❌ Нет данных для экспорта', 'error');
            return;
        }

        let csvContent = "Тип;Адрес;Время прибытия;Длительность\n";

        if (this.smartRoute) {
            this.smartRoute.route.forEach((point, index) => {
                csvContent += `Умный;${point.address};${point.arrival_time || 'N/A'};${point.duration || 30}\n`;
            });
        }

        if (this.baselineRoute) {
            csvContent += "\n";
            this.baselineRoute.route.forEach((point, index) => {
                csvContent += `Базовый;${point.address};${point.arrival_time || 'N/A'};${point.duration || 30}\n`;
            });
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `маршруты_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.logMessage('📊 CSV файл экспортирован', 'success');
    }

    exportIcs() {
        if (!this.smartRoute) {
            this.logMessage('❌ Нет данных для экспорта в календарь', 'error');
            return;
        }

        let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//RoutePlanner//RU\n";

        this.smartRoute.route.forEach((point, index) => {
            const startTime = point.arrival_time ? `20240101T${point.arrival_time.replace(':', '')}00` : '20240101T090000';
            const endTime = `20240101T${this.addMinutes(point.arrival_time || '09:00', point.duration || 30).replace(':', '')}00`;

            icsContent += "BEGIN:VEVENT\n";
            icsContent += `DTSTART:${startTime}\n`;
            icsContent += `DTEND:${endTime}\n`;
            icsContent += `SUMMARY:Визит: ${point.address}\n`;
            icsContent += `DESCRIPTION:Точка ${index + 1} маршрута\n`;
            icsContent += "END:VEVENT\n";
        });

        icsContent += "END:VCALENDAR";

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `маршрут_${new Date().toISOString().split('T')[0]}.ics`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.logMessage('📅 Календарь экспортирован', 'success');
    }

    addMinutes(time, minutes) {
        const [hours, mins] = time.split(':').map(Number);
        const totalMinutes = hours * 60 + mins + minutes;
        const newHours = Math.floor(totalMinutes / 60) % 24;
        const newMinutes = totalMinutes % 60;
        return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
    }


    setFileInfo(file) {
        if (file) {
            this.picked.innerHTML = `📄 <b>${this.escapeHtml(file.name)}</b> • ${this.formatBytes(file.size)}`;
            this.fileStatus.textContent = 'Готов';
            this.fileStatus.style.background = 'var(--success-bg)';
        } else {
            this.picked.innerHTML = '';
            this.fileStatus.textContent = 'Ожидание';
            this.fileStatus.style.background = '#2a2f4a';
        }
    }

    logMessage(message, type = 'info') {
        const div = document.createElement('div');
        div.className = type;
        div.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        this.log.appendChild(div);
        this.log.scrollTop = this.log.scrollHeight;
    }

    updateProgress(percent, details = '') {
        this.progressBar.style.width = `${percent}%`;
        this.progressText.textContent = `${Math.round(percent)}%`;
        this.progressDetails.textContent = details;
    }

    setLoading(loading) {
        this.progressContainer.classList.toggle('hidden', !loading);
        this.optimizeBtn.disabled = loading;
        this.baselineBtn.disabled = loading;
    }

    formatMinutes(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return hours > 0 ? `${hours}ч ${mins}м` : `${mins}м`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    checkHttpsMixed() {
        const isHttps = window.location.protocol === 'https:';
        const isHttpBackend = this.apiBaseInput.value.startsWith('http://');
        this.httpsWarn.classList.toggle('hidden', !(isHttps && isHttpBackend));
    }

    async validateApiKey() {
        const apiKey = this.dgisApiKeyInput.value.trim();
        
        if (!apiKey) {
            this.apiKeyStatus.textContent = '';
            this.apiKeyStatus.style.color = '';
            return;
        }

        // Базовая валидация формата UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(apiKey)) {
            this.apiKeyStatus.textContent = '❌ Неверный формат ключа';
            this.apiKeyStatus.style.color = 'var(--err)';
            return;
        }

        this.apiKeyStatus.textContent = '🔄 Проверка ключа...';
        this.apiKeyStatus.style.color = 'var(--warn)';

        try {
            const base = this.apiBaseInput.value.trim();
            const response = await fetch(`${base}/api/validate_dgis_key?dgis_api_key=${encodeURIComponent(apiKey)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const result = await response.json();
            
            if (result.valid) {
                this.apiKeyStatus.textContent = '✅ Ключ валиден';
                this.apiKeyStatus.style.color = 'var(--ok)';
            } else {
                this.apiKeyStatus.textContent = `❌ ${result.error}`;
                this.apiKeyStatus.style.color = 'var(--err)';
            }
        } catch (error) {
            this.apiKeyStatus.textContent = '❌ Ошибка проверки ключа';
            this.apiKeyStatus.style.color = 'var(--err)';
            console.error('Ошибка валидации API ключа:', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new RoutePlanner();
});