// ===================================================================
// CONFIGURATION
// ===================================================================

// Nombre de jours dans le futur pour chercher les événements
const MAX_DAYS_LISTE = 90;

// Durée de validité du cache partagé
const EVENTS_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

// Clé du localStorage partagé par les deux scripts
const EVENTS_CACHE_KEY = 'epudf_consistoire_rp_sud_ouest_events';

// Sites et catégories d'événements à récupérer
const SITES_TO_FETCH_LISTE = [
    { domaine: 'chartres-beauce-et-perche.epudf.org', chemin: '/evenements', categorie: 'consistoire', paroisse: 'Chartres, Beauce et Perche' },
    { domaine: 'jvvc.epudf.org', chemin: '/evenements', categorie: 'consistoire', paroisse: 'Jouy-en-Josas, Vélizy, Viroflay, Chaville' },
    { domaine: 'saintcloud-lacellesaintcloud.epudf.org', chemin: '/evenements', categorie: 'consistoire', paroisse: 'Saint-Cloud et La Celle-Saint-Cloud' },
    { domaine: 'meudon-sevres-ville-d-avray.epudf.org', chemin: '/evenements', categorie: 'consistoire', paroisse: 'Meudon, Sèvres, Ville-d\'Avray' },
    { domaine: 'sqy.epudf.org', chemin: '/evenements-agenda-calendrier', categorie: 'consistoire', paroisse: 'Saint-Quentin-en-Yvelines' },
    { domaine: 'rambouillet.epudf.org', chemin: '/evenements', categorie: 'consistoire', paroisse: 'Rambouillet' },
    { domaine: 'versailles.epudf.org', chemin: '/evenements', categorie: 'consistoire', paroisse: 'Versailles' }
];

// ===================================================================
// CACHE PARTAGÉ
// ===================================================================

class EventsCache {
    static get() {
        try {
            const raw = localStorage.getItem(EVENTS_CACHE_KEY);
            if (!raw) return null;

            const cache = JSON.parse(raw);

            if (!cache.fetchedAt || !Array.isArray(cache.events)) {
                localStorage.removeItem(EVENTS_CACHE_KEY);
                return null;
            }

            if (Date.now() - cache.fetchedAt >= EVENTS_CACHE_TTL) {
                localStorage.removeItem(EVENTS_CACHE_KEY);
                return null;
            }

            return cache.events;
        } catch (error) {
            console.error('Erreur lors de la lecture du cache des événements:', error);
            return null;
        }
    }

    static set(events) {
        try {
            localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify({
                fetchedAt: Date.now(),
                events
            }));
        } catch (error) {
            console.error('Erreur lors de l\'écriture du cache des événements:', error);
        }
    }

    static update(events) {
        try {
            const raw = localStorage.getItem(EVENTS_CACHE_KEY);
            let cache = raw ? JSON.parse(raw) : { fetchedAt: Date.now(), events: [] };
            cache.events = events;
            localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(cache));
        } catch (error) {
            console.error('Erreur lors de la mise à jour du cache des événements:', error);
        }
    }
}

// ===================================================================
// SCRIPT
// ===================================================================

class EventFetcherListe {
    constructor() {
        this.allEvents = [];
    }

    async fetchEventsFromSite(domaine, chemin, categorie, currentDate = new Date()) {
        return new Promise((resolve) => {
            const events = [];

            const endDate = new Date(currentDate);
            endDate.setDate(endDate.getDate() + MAX_DAYS_LISTE);

            const dateFrom = currentDate.toISOString().slice(0, 10);
            const dateTo = endDate.toISOString().slice(0, 10);

            const fetchPage = async (page) => {
                const url = `https://${domaine}${chemin}/page/${page}/?date-from=${dateFrom}&date-to=${dateTo}&category=${categorie}`;

                try {
                    // Requête directe pour le site courant, proxy pour les autres
                    const requestUrl = domaine === window.location.hostname
                        ? url
                        : 'https://corsproxy.io/?key=35b9a1a8&url=' + encodeURIComponent(url);

                    const response = await fetch(requestUrl, {
                        method: 'GET',
                        credentials: 'omit',
                        headers: {
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                        }
                    });

                    if (response.ok) {
                        const htmlText = await response.text();
                        const parser = new DOMParser();
                        const eventsHTML = parser.parseFromString(htmlText, 'text/html');

                        if (eventsHTML.querySelectorAll(".alert-error").length !== 0) {
                            resolve(events);
                            return;
                        }

                        const pageEvents = this.extractEventDetails(
                            eventsHTML.querySelectorAll('div.post-list > a.post-item'),
                            domaine
                        );

                        events.push(...pageEvents);

                        await fetchPage(page + 1);
                    } else {
                        console.error(`Erreur HTTP ${response.status} pour ${domaine}, fin de la récupération.`);
                        resolve(events);
                    }
                } catch (error) {
                    console.error(`Erreur pour ${domaine}:`, error);
                    resolve(events);
                }
            };

            fetchPage(1).catch(error => {
                console.error(`Erreur lors du démarrage de la récupération pour ${domaine}:`, error);
                resolve(events);
            });
        });
    }

    extractEventDetails(eventNodes, domaine) {
        const events = [];

        eventNodes.forEach(node => {
            try {
                const url = node.getAttribute('href');
                const imageUrl = node.querySelector('.post-image > img')?.src?.trim() || '';
                const title = node.querySelector('.post-title')?.textContent?.trim() || 'Titre non disponible';
                const text = node.querySelector('.post-text')?.textContent?.trim() || '';
                const dateElement = node.querySelector(
                    'a.post-item > div.post-content.event-content > div.event-informations > div.date > span'
                );
                const date = dateElement?.textContent?.trim() || '';
                const isDatePeriod = node.querySelector(
                    'a.post-item > div.post-content.event-content > div.event-informations > div.date-period'
                ) !== null;
                const timeElement = node.querySelector(
                    'a.post-item > div.post-content.event-content > div.event-informations > div.time > span'
                );
                let time = '';
                if (isDatePeriod) {
                    const timeMatch = date.match(/(\d{1,2}h\d{2})/);
                    time = timeMatch ? timeMatch[1] : '';
                } else {
                    time = timeElement?.textContent?.trim() || '';    
                }
                const place = node.querySelector('.event-informations_place > span')?.textContent?.trim() || '';
                if (date) {
                    events.push({
                        url,
                        imageUrl,
                        title,
                        text,
                        date,
                        time,
                        isDatePeriod,
                        place,
                        datetime: this.parseDateTime(date, time, isDatePeriod),
                        source: domaine
                    });
                }
            } catch (error) {
                console.error('Erreur lors de l\'extraction d\'un événement:', error);
            }
        });

        return events;
    }

    parseDateTime(dateStr, timeStr, isDatePeriod) {
        try {
            if (isDatePeriod) {
                dateMatch = dateStr.match(/Du (\d{2}\/\d{2}\/\d{4})/);
            } else {
                dateMatch = ['',dateStr];
            }
            
            const [day, month, year] = dateMatch[1].split('/').map(num => parseInt(num));

            const timeMatch = timeStr.match(/(\d{1,2})h(\d{2})/);
            if (!timeMatch) {
                return new Date(year, month - 1, day).getTime();
            }

            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);

            return new Date(year, month - 1, day, hours, minutes).getTime();
        } catch (error) {
            console.error('Erreur lors du parsing de la date/heure:', dateStr, timeStr, error);
            return null;
        }
    }

    async fetchEventsFromMultipleSites(domaineCategorieList, currentDate = new Date()) {
        this.allEvents = [];

        const cachedEvents = EventsCache.get();

        if (cachedEvents) {
            console.log(`Cache des événements utilisé (${cachedEvents.length} événements).`);
        }

        const promises = [];

        for (const { domaine, chemin, categorie } of domaineCategorieList) {
            if (cachedEvents && domaine !== window.location.hostname) {
                continue;
            }

            console.log(`Récupération des événements de ${domaine} pour la catégorie ${categorie}...`);

            promises.push(
                this.fetchEventsFromSite(domaine, chemin, categorie, currentDate)
                    .then(events => {
                        console.log(`${events.length} événements récupérés de ${domaine}`);
                        return events;
                    })
                    .catch(error => {
                        console.error(`Erreur pour ${domaine}:`, error);
                        return [];
                    })
            );
        }

        try {
            const allEventArrays = await Promise.all(promises);

            for (const eventArray of allEventArrays) {
                this.allEvents.push(...eventArray);
            }

            // Fusion des éléments du cache sauf éléments de {domaine: window.location.hostname}
            if (cachedEvents) {
                this.allEvents.push(...cachedEvents.filter(event => event.domaine !== window.location.hostname));
            }

            this.allEvents.sort((a, b) => a.datetime - b.datetime);

            if (cachedEvents) {
                EventsCache.update(this.allEvents);
            } else {
                EventsCache.set(this.allEvents);
            }

            console.log(`Total: ${this.allEvents.length} événements récupérés et mis en cache`);
            return this.allEvents;
        } catch (error) {
            console.error('Erreur lors de la récupération des événements:', error);
            return [];
        }
    }

    getAllEvents() {
        return this.allEvents;
    }
}

// ===================================================================
// AFFICHAGE
// ===================================================================

async function loadAllEvents() {
    const fetcherList = new EventFetcherListe();

    try {
        const events = await fetcherList.fetchEventsFromMultipleSites(SITES_TO_FETCH_LISTE);

        const postListDiv = document.querySelector('.post-list');

        const loadingDiv = document.getElementById('loading-events');
        if (loadingDiv) {
            loadingDiv.remove();
        }

        if (events.length > 0) {
            events.forEach(event => {
                if (!event.url) return;

                const node = document.createElement('a');
                node.href = event.url;
                node.className = 'post-item';

                const imageDiv = document.createElement('div');
                imageDiv.className = 'post-image';

                const image = document.createElement('img');
                image.src = event.imageUrl;
                image.alt = event.title;

                const placeDiv = document.createElement('div');
                placeDiv.className = 'event-informations_place';
                placeDiv.innerHTML = `<i class="icon far fa-map-marker-alt"></i><span>${event.place}</span>`

                const newDiv = document.createElement('div');
                newDiv.style.width = '100%';
                newDiv.style.marginBottom = '5px';

                const svgIcon = document.createElement('img');
                svgIcon.className = 'icon';
                svgIcon.style.width = '10.5px';
                svgIcon.style.height = '17px';
                svgIcon.style.display = 'inline-block';
                svgIcon.style.verticalAlign = 'middle';
                svgIcon.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 34.12 36.65'><g><g><polygon fill='white' points='0 18.18 17.6 18.89 22.33 36.65 34.13 0 0 18.18'/></g></g></svg>";

                newDiv.appendChild(svgIcon);

                const parishSpan = document.createElement('span');
                parishSpan.textContent = SITES_TO_FETCH_SLIDER.find(site => event.source === site.domaine)?.paroisse || '';

                imageDiv.appendChild(image);
                
                newDiv.appendChild(parishSpan);
                placeDiv.appendChild(newDiv);
                imageDiv.appendChild(placeDiv);

                const contentDiv = document.createElement('div');
                contentDiv.className = 'post-content event-content';

                const titleDiv = document.createElement('div');
                titleDiv.className = 'post-title';
                titleDiv.textContent = event.title;

                const infoDiv = document.createElement('div');
                infoDiv.className = 'event-informations';

                const dateDiv = document.createElement('div');
                dateDiv.className = 'date';
                if (event.isDatePeriod) {
                    dateDiv.classList.add('date-period');
                }
                dateDiv.innerHTML = `<i class="icon far fa-calendar"></i><span>${event.date}</span>`;

                infoDiv.appendChild(dateDiv);
                if (event.time && !event.isDatePeriod) {
                    const timeDiv = document.createElement('div');
                    timeDiv.className = 'time';
                    timeDiv.innerHTML = `<i class="icon fal fa-clock"></i><span>${event.time}</span>`;
                    infoDiv.appendChild(timeDiv);
                }

                contentDiv.appendChild(titleDiv);
                contentDiv.appendChild(infoDiv);
                
                if (event.text) {
                    const textDiv = document.createElement('div');
                    textDiv.className = 'post-text';
                    textDiv.textContent = event.text;
                    contentDiv.appendChild(textDiv);
                }

                node.appendChild(imageDiv);
                node.appendChild(contentDiv);

                postListDiv.appendChild(node);
            });
        } else {
            postListDiv.innerHTML = `</p><div style="text-align: center; padding: 2em; color: #666;">Aucun événement trouvé</div><p>`;
        }
    } catch (error) {
        console.error('❌ Erreur lors du chargement des événements:', error);

        const postListDiv = document.querySelector('.post-list');
        postListDiv.innerHTML = `</p><div style="text-align: center; padding: 2em; color: #d32f2f;"><strong>Erreur de chargement</strong><br>Impossible de récupérer les événements. Veuillez réessayer plus tard.</div><p>`;
    }
}

loadAllEvents();
