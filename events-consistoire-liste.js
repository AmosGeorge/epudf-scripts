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
                const title = node.querySelector('.post-title')?.textContent?.trim() || 'Titre non disponible';

                const dateElement = node.querySelector(
                    'a.post-item > div.post-content.event-content > div.event-informations > div.date > span'
                );
                const date = dateElement?.textContent?.trim() || '';

                const timeElement = node.querySelector(
                    'a.post-item > div.post-content.event-content > div.event-informations > div.time > span'
                );
                const time = timeElement?.textContent?.trim() || '';

                if (date) {
                    events.push({
                        url,
                        title,
                        date,
                        time,
                        datetime: this.parseDateTime(date, time),
                        source: domaine,
                        category: 'consistoire'
                    });
                }
            } catch (error) {
                console.error('Erreur lors de l\'extraction d\'un événement:', error);
            }
        });

        return events;
    }

    parseDateTime(dateStr, timeStr) {
        try {
            const [day, month, year] = dateStr.split('/').map(num => parseInt(num));

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
            this.allEvents = cachedEvents;
            return this.allEvents;
        }

        const promises = [];

        for (const { domaine, chemin, categorie } of domaineCategorieList) {
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

            this.allEvents.sort((a, b) => a.datetime - b.datetime);

            EventsCache.set(this.allEvents);

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

                // Les données en cache ne contiennent plus le node HTML.
                // Le contenu est donc reconstruit à partir des données extraites.
                const node = document.createElement('a');
                node.href = event.url;
                node.className = 'post-item';

                const titleDiv = document.createElement('div');
                titleDiv.className = 'post-title';
                titleDiv.textContent = event.title;

                const infoDiv = document.createElement('div');
                infoDiv.className = 'event-informations';

                const dateDiv = document.createElement('div');
                dateDiv.className = 'date';
                dateDiv.innerHTML = `<span>${event.date}</span>`;

                const timeDiv = document.createElement('div');
                timeDiv.className = 'time';
                timeDiv.innerHTML = `<span>${event.time}</span>`;

                infoDiv.appendChild(dateDiv);
                if (event.time) {
                    infoDiv.appendChild(timeDiv);
                }

                node.appendChild(titleDiv);
                node.appendChild(infoDiv);
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
