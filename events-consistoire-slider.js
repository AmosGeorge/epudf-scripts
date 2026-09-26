// ===================================================================
// CONFIGURATION
// ===================================================================

// Lien vers la page de tous les événements du consistoire
const LIEN_TOUS_LES_EVENEMENTS = [
    { domaine: 'chartres-beauce-et-perche.epudf.org', chemin: '/consistoire' },
    { domaine: 'jvvc.epudf.org', chemin: '/evenements-consistoire' },
    { domaine: 'saintcloud-lacellesaintcloud.epudf.org', chemin: '/consistoire' },
    { domaine: 'meudon-sevres-ville-d-avray.epudf.org', chemin: '/qui-sommes-nous/consistoire/' },
    { domaine: 'sqy.epudf.org', chemin: '/consistoire' },
    { domaine: 'rambouillet.epudf.org', chemin: '/consistoire' },
    { domaine: 'versailles.epudf.org', chemin: '/evenements-du-consistoire' }
];

// Texte du lien vers tous les événements
const TOUS_LES_EVENEMENTS = 'Tous les événements du consistoire';

// Nombre maximum d'événements à afficher dans le slider
const EVENTS_IN_SLIDER = 9;

// Nombre de jours dans le futur pour chercher les événements
const MAX_DAYS = 90;

// Clé du localStorage partagé avec events-consistoire-liste.js
const EVENTS_CACHE_KEY = 'epudf_consistoire_rp_sud_ouest_events';

// Durée de validité du cache partagé
const EVENTS_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

// Sites et catégories d'événements à récupérer
const SITES_TO_FETCH = [
    { domaine: 'chartres-beauce-et-perche.epudf.org', chemin: '/evenements', categorie: 'consistoire', paroisse: 'Chartres, Beauce et Perche' },
    { domaine: 'jvvc.epudf.org', chemin: '/evenements', categorie: 'consistoire', paroisse: 'Jouy-en-Josas, Vélizy, Viroflay, Chaville' },
    { domaine: 'saintcloud-lacellesaintcloud.epudf.org', chemin: '/evenements', categorie: 'consistoire', paroisse: 'Saint-Cloud et La Celle-Saint-Cloud' },
    { domaine: 'meudon-sevres-ville-d-avray.epudf.org', chemin: '/evenements', categorie: 'consistoire', paroisse: 'Meudon, Sèvres, Ville-d\'Avray' },
    { domaine: 'sqy.epudf.org', chemin: '/evenements-agenda-calendrier', categorie: 'consistoire', paroisse: 'Saint-Quentin-en-Yvelines' },
    { domaine: 'rambouillet.epudf.org', chemin: '/vie-paroissiale/evenements', categorie: 'consistoire', paroisse: 'Rambouillet' },
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

function getEventLinkForCurrentDomain() {
    const currentDomain = window.location.hostname;
    const siteConfig = LIEN_TOUS_LES_EVENEMENTS.find(site => site.domaine === currentDomain);

    if (siteConfig) {
        return `https://${siteConfig.domaine}${siteConfig.chemin}`;
    }

    return `https://meudon-sevres-ville-d-avray.epudf.org/qui-sommes-nous/consistoire/`;
}

class EventFetcherSlider {
    constructor() {
        this.allEvents = [];
    }

    async fetchEventsFromSite(domaine, chemin, categorie, currentDate = new Date()) {
        return new Promise((resolve) => {
            const events = [];

            const endDate = new Date(currentDate);
            endDate.setDate(endDate.getDate() + MAX_DAYS);

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
            let dateMatch;
            if (isDatePeriod) {
                dateMatch = dateStr.match(/Du (\d{2}\/\d{2}\/\d{4})/);
            } else {
                dateMatch = ['',dateStr];
            }
            
            const [day, month, year] = dateMatch[1]?.split('/').map(num => parseInt(num)) || [null, null, null];

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
// AFFICHAGE DU SLIDER
// ===================================================================

async function loadAllEvents() {
    const fetcherSlider = new EventFetcherSlider();

    try {
        const events = await fetcherSlider.fetchEventsFromMultipleSites(SITES_TO_FETCH);

        const eventsSliderTmp = document.querySelector('.events-slider-tmp');
        const blockTextWysiwyg = eventsSliderTmp?.closest('.block_text-wysiwyg');

        if (!blockTextWysiwyg) {
            console.error('❌ Impossible de trouver l\'élément parent .block_text-wysiwyg');
            return;
        }

        const blockTitle = blockTextWysiwyg.querySelector('h2.block-title');
        const titleText = blockTitle?.textContent?.trim() || 'Événements du consistoire';

        console.log(`Titre récupéré: "${titleText}"`);

        function createSliderSection(title) {
            const sectionHTML = `
                <section class="section_slider">
                    <div class="container"><h2 class="block-title">${title}</h2></div>
                    <div class="container slider-container">
                        <div class="block_slider block_consistoire">
                            <div class="slider-list slider-consistoire" style="transform: translateX(0px);"></div>
                            <div class="nav-slider">
                                <button class="prev far fa-chevron-left"></button>
                                <button class="next far fa-chevron-right"></button></div>
                            <div class="slider-bottom">
                                <a href="${getEventLinkForCurrentDomain()}" class="slider-link" target="_self">
                                    <span class="text-primary">${TOUS_LES_EVENEMENTS}</span>
                                    <i class="icon far fa-arrow-right text-primary"></i></a>
                                <div class="slider-pagination"></div>
                    </div></div></div></section>`;

            return sectionHTML.replace(/<\/?p>/gi, '');
        }

        const sectionHTML = createSliderSection(titleText);
        blockTextWysiwyg.outerHTML = sectionHTML;

        const sliderListDiv = document.querySelector('.slider-consistoire');

        if (events.length > 0) {
            events.slice(0, EVENTS_IN_SLIDER).forEach(event => {
                if (!event.url) return;

                const node = document.createElement('a');
                node.href = event.url;
                node.className = 'slider-item_link slider-item';

                const imageDiv = document.createElement('div');
                imageDiv.className = 'slider-image';

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
                parishSpan.textContent = SITES_TO_FETCH.find(site => event.source === site.domaine)?.paroisse || '';

                imageDiv.appendChild(image);
                
                newDiv.appendChild(parishSpan);
                placeDiv.appendChild(newDiv);
                imageDiv.appendChild(placeDiv);

                const contentDiv = document.createElement('div');
                contentDiv.className = 'slider-content';
                
                const titleDiv = document.createElement('div');
                titleDiv.className = 'slider-title';
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
                    textDiv.className = 'slider-text';
                    textDiv.textContent = event.text;
                    contentDiv.appendChild(textDiv);
                }

                node.appendChild(imageDiv);
                node.appendChild(contentDiv);

                sliderListDiv.appendChild(node);
            });

            console.log(`✅ ${Math.min(events.length, EVENTS_IN_SLIDER)} événements affichés dans le slider`);

            initializeSlider();
        } else {
            sliderListDiv.innerHTML =
                `<div style="text-align: center; padding: 2em; color: #666;">Aucun événement trouvé>`
                .replace(/<\/?p>/gi, '');
        }
    } catch (error) {
        console.error('❌ Erreur lors du chargement des événements:', error);

        const tempDiv = document.querySelector('.events-slider-tmp');

        if (tempDiv) {
            tempDiv.innerHTML =
                `<div style="text-align: center; padding: 2em; color: #d32f2f;"><strong>Erreur de chargement</strong><br>Impossible de récupérer les événements. Veuillez réessayer plus tard.</div>`
                .replace(/<\/?p>/gi, '');
        }
    }
}

/**
 * Fonction pour initialiser le slider après le chargement dynamique
 */
function initializeSlider() {
    const sliderContainer = document.querySelector('.block_slider.block_consistoire');

    if (!sliderContainer) {
        console.error('❌ Slider container non trouvé');
        return;
    }

    let offset = 0;
    let currentFrame = 0;
    const sliderList = sliderContainer.querySelector('.slider-list');
    const slides = sliderContainer.querySelectorAll('.slider-item');
    const sliderBottom = sliderContainer.querySelector('.slider-bottom');
    const slideCount = slides.length;
    let itemPerFrame = 0;
    let frameCount = 0;
    let sliderInterval = null;

    console.log(`🎠 Initialisation du slider avec ${slideCount} éléments`);

    const handleResize = () => {
        const existingPagination = sliderContainer.querySelector('.slider-pagination');

        if (existingPagination) {
            existingPagination.innerHTML = '';
        }

        if (!window.matchMedia('screen and (min-width: 1024px)').matches) {
            const leftMarginForCenter =
                (sliderContainer.offsetWidth - (slides[0]?.offsetWidth || 0)) / 2;

            if (slides[0]) {
                slides[0].style.marginLeft = leftMarginForCenter + 'px';
            }

            const slideStyle =
                window.getComputedStyle(slides[0] || document.createElement('div'));

            offset =
                (slides[0]?.offsetWidth || 0) +
                parseInt(slideStyle.marginRight || '0') * 2;

            itemPerFrame = 1;
            frameCount = slides.length;
        } else {
            if (slides[0]) {
                slides[0].style.marginLeft = '';
            }

            const slideStyle =
                window.getComputedStyle(slides[0] || document.createElement('div'));

            const marginSize =
                parseInt(slideStyle.marginRight || '0') +
                parseInt(slideStyle.marginLeft || '0');

            const slideWidth =
                (sliderContainer.offsetWidth) / 3 - marginSize;

            slides.forEach(slide => {
                slide.style.width = slideWidth + 'px';
            });

            offset = sliderContainer.offsetWidth;
            itemPerFrame =
                Math.floor(offset / (slides[0]?.offsetWidth || 1));

            frameCount = Math.ceil(slideCount / itemPerFrame);

            if (frameCount > 1 && existingPagination) {
                for (let i = 0; i < frameCount; i++) {
                    const dot = document.createElement('div');
                    dot.className = 'slider-pagination_button';

                    if (i === 0) {
                        dot.classList.add('active');
                    }

                    dot.addEventListener('click', () => move(i));
                    existingPagination.appendChild(dot);
                }
            }
        }
    };

    const enqueueNextSlide = () => {
        sliderInterval = setTimeout(() => {
            move();
        }, 5000);
    };

    const move = (frame) => {
        if (frame === undefined || frame === null) {
            frame = currentFrame + 1;
        } else if (frame < 0) {
            frame = frameCount - 1;
        }

        frame = frame % frameCount;
        currentFrame = frame;

        sliderList.style.transform = `translateX(-${offset * frame}px)`;

        const activeButton =
            sliderContainer.querySelector('.slider-pagination_button.active');

        if (activeButton) {
            activeButton.classList.remove('active');
        }

        const newActiveButton =
            sliderContainer.querySelectorAll('.slider-pagination_button')[frame];

        if (newActiveButton) {
            newActiveButton.classList.add('active');
        }

        clearTimeout(sliderInterval);
        enqueueNextSlide();
    };

    const prevButton = sliderContainer.querySelector('.nav-slider .prev');
    const nextButton = sliderContainer.querySelector('.nav-slider .next');

    if (prevButton) {
        prevButton.addEventListener('click', () => move(currentFrame - 1));
    }

    if (nextButton) {
        nextButton.addEventListener('click', () => move(currentFrame + 1));
    }

    sliderList.addEventListener('mouseenter', () => {
        clearTimeout(sliderInterval);
    });

    sliderList.addEventListener('mouseleave', () => {
        enqueueNextSlide();
    });

    window.addEventListener('resize', handleResize);

    handleResize();
    enqueueNextSlide();

    console.log('✅ Slider initialisé avec succès');
}

loadAllEvents();
