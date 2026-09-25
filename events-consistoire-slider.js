// ===================================================================
// 🔧 CONFIGURATION
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
]
// Texte du lien vers tous les événements
const TOUS_LES_EVENEMENTS = 'Tous les événements du consistoire';
// Nombre maximum d'événements à afficher dans le slider (multiple de 3 recommandé)
const EVENTS_IN_SLIDER = 9;
// Nombre de jours dans le futur pour chercher les événements (à partir d'aujourd'hui)
const MAX_DAYS_SLIDER = 90;
// Sites et catégories d'événements à récupérer
const SITES_TO_FETCH_SLIDER = [
    { domaine: 'chartres-beauce-et-perche.epudf.org', chemin: '/evenements', categorie: 'consistoire', paroisse: 'Chartres, Beauce et Perche' },
    { domaine: 'jvvc.epudf.org', chemin: '/evenements', categorie: 'consistoire', paroisse: 'Jouy-en-Josas, Vélizy, Viroflay, Chaville' },
    { domaine: 'saintcloud-lacellesaintcloud.epudf.org', chemin: '/evenements', categorie: 'consistoire', paroisse: 'Saint-Cloud et La Celle-Saint-Cloud' },
    { domaine: 'meudon-sevres-ville-d-avray.epudf.org', chemin: '/evenements', categorie: 'consistoire', paroisse: 'Meudon, Sèvres, Ville-d\'Avray' },
    { domaine: 'sqy.epudf.org', chemin: '/evenements-agenda-calendrier', categorie: 'consistoire', paroisse: 'Saint-Quentin-en-Yvelines' },
    { domaine: 'rambouillet.epudf.org', chemin: '/evenements', categorie: 'consistoire', paroisse: 'Rambouillet' },
    { domaine: 'versailles.epudf.org', chemin: '/evenements', categorie: 'consistoire', paroisse: 'Versailles' }
];
// ===================================================================
// SCRIPT
// ===================================================================
/**
 * Retourne le lien vers tous les événements en fonction du domaine actuel
 */
function getEventLinkForCurrentDomain() {
    const currentDomain = window.location.hostname;
    const siteConfig = LIEN_TOUS_LES_EVENEMENTS.find(site => site.domaine === currentDomain);
    if (siteConfig) {
        return `https://${siteConfig.domaine}${siteConfig.chemin}`;
    }
    // Fallback si le domaine actuel n'est pas trouvé
    return `https://meudon-sevres-ville-d-avray.epudf.org/qui-sommes-nous/consistoire/`;
}
/**
* Script pour récupérer des événements depuis d'autres sites web
* et les afficher dans l'ordre chronologique
*/
class EventFetcherSlider {
    constructor() {
        this.allEvents = [];
    }
    /**
     * Récupère de manière récursive les événements paginés
     * - Parcourt toutes les pages jusqu'à atteindre la fin (détection d'erreur)
     * - Filtre les événements par date (entre currentDate et currentDate + MAX_DAYS_SLIDER)
     * - Filtre par catégorie spécifiée
     * - Extrait les détails de chaque événement (titre, date, heure, URL, node HTML)
     * - Retourne un tableau des événements trouvés triés chronologiquement
     */
    async fetchEventsFromSite(domaine, chemin, categorie, currentDate = new Date()) {
        return new Promise((resolve, reject) => {
            const events = [];
            // Calculer la date de fin (currentDate + XX jours)
            const endDate = new Date(currentDate);
            endDate.setDate(endDate.getDate() + MAX_DAYS_SLIDER);
            // Formater les dates au format attendu (YYYY-MM-DD)
            const dateFrom = currentDate.toISOString().slice(0, 10);
            const dateTo = endDate.toISOString().slice(0, 10);
            const fetchPage = async (page) => {
                const url = `${domaine}${chemin}/page/${page}/?date-from=${dateFrom}&date-to=${dateTo}&category=${categorie}`;
                try {
                    const proxyUrl = 'https://corsproxy.io/?key=35b9a1a8&url=' + encodeURIComponent(url);
                    const response = await fetch(proxyUrl, {
                        method: 'GET',
                        credentials: 'omit',
                        headers: {'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'}
                    });
                    if (response.ok) {
                        const htmlText = await response.text();
                        const parser = new DOMParser();
                        const eventsHTML = parser.parseFromString(htmlText, 'text/html');
                        // Vérifier s'il y a une erreur (pas d'événements)
                        if (eventsHTML.querySelectorAll(".alert-error").length !== 0) {
                            resolve(events); // Terminer si plus d'événements
                            return;
                        }
                        // Extraire les événements de cette page
                        const pageEvents = this.extractEventDetails(eventsHTML.querySelectorAll('div.post-list > a.post-item'));
                        events.push(...pageEvents);
                        // Récupérer la page suivante
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
    /**
     * Extrait les détails des événements depuis les éléments HTML
     */
    extractEventDetails(eventNodes) {
        const events = [];
        eventNodes.forEach(node => {
            try {
                const url = node.getAttribute('href');
                const title = node.querySelector('.post-title')?.textContent?.trim() || 'Titre non disponible';
                // Récupérer la date au format dd/mm/aaaa
                const dateElement = node.querySelector('a.post-item > div.post-content.event-content > div.event-informations > div.date > span');
                const date = dateElement?.textContent?.trim() || '';
                // Récupérer l'heure au format HHhMM
                const timeElement = node.querySelector('a.post-item > div.post-content.event-content > div.event-informations > div.time > span');
                const time = timeElement?.textContent?.trim() || '';
                // Convertir le node au format slider
                const sliderNode = this.convertNodeToSlider(node.cloneNode(true));
                if (date) {
                    events.push({
                        url,
                        title,
                        node: sliderNode,
                        datetime: this.parseDateTime(date, time) // Pour le tri
                    });
                }
            } catch (error) {
                console.error('Erreur lors de l\'extraction d\'un événement:', error);
            }
        });
        return events;
    }
    /**
     * Convertit un élément HTML en un format adapté pour le slider
     */
    convertNodeToSlider(node) {
        try {
            // 1. Modifier la classe de l'élément <a>
            if (node.classList.contains('post-item')) {
                node.classList.remove('post-item');
                node.classList.add('slider-item_link', 'slider-item');
            }
            // 2. Modifier post-image vers slider-image
            const postImage = node.querySelector('.post-image');
            if (postImage) {
                postImage.classList.remove('post-image');
                postImage.classList.add('slider-image');
            }
            // 3. Modifier l'URL de l'image 475x250 -> 392x250
            const img = node.querySelector('img');
            if (img && img.src && img.src.includes('475x250')) {
                img.src = img.src.replace('475x250', '392x250');
            }
            // 4. Modifier post-content event-content vers slider-content
            const postContent = node.querySelector('.post-content.event-content');
            if (postContent) {
                postContent.classList.remove('post-content', 'event-content');
                postContent.classList.add('slider-content');
            }
            // 5. Modifier post-title vers slider-title
            const postTitle = node.querySelector('.post-title');
            if (postTitle) {
                postTitle.classList.remove('post-title');
                postTitle.classList.add('slider-title');
            }
            // 6. Modifier post-text vers slider-text
            const postText = node.querySelector('.post-text');
            if (postText) {
                postText.classList.remove('post-text');
                postText.classList.add('slider-text');
            }
            // 7. Modifier event-informations_place pour ajouter la paroisse
            const placeDiv = node.querySelector('.event-informations_place');
            if (placeDiv) {
                const parishName = SITES_TO_FETCH_SLIDER.find(site => node.href.includes(site.domaine))?.paroisse || '';
                if (parishName) {
                    // Ajouter le style flex-wrap: wrap au div parent
                    placeDiv.style.flexWrap = 'wrap';
                    // Créer un nouveau div pour contenir l'icône et le texte
                    const newDiv = document.createElement('div');
                    newDiv.style.width = '100%';
                    newDiv.style.marginBottom = '5px';
                    // Ajouter l'icône SVG
                    const svgIcon = document.createElement('img'); // style="width: 10.5px;height: 17px;display:inline-block;vertical-align:middle;"
                    svgIcon.className = 'icon';
                    svgIcon.style.width = '10.5px';
                    svgIcon.style.height = '17px';
                    svgIcon.style.display = 'inline-block';
                    svgIcon.style.verticalAlign = 'middle';
                    svgIcon.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 34.12 36.65'><g><g><polygon fill='white' points='0 18.18 17.6 18.89 22.33 36.65 34.13 0 0 18.18'/></g></g></svg>";
                    newDiv.appendChild(svgIcon);
                    // Ajouter le nom de la paroisse
                    const parishSpan = document.createElement('span');
                    parishSpan.textContent = parishName;
                    newDiv.appendChild(parishSpan);
                    // Ajouter le nouveau div au début de placeDiv
                    placeDiv.insertBefore(newDiv, placeDiv.firstChild);
                }
            }
            return node; // Retourner le node modifié
        } catch (error) {
            console.error('Erreur lors de la conversion node vers slider:', error);
            return node; // Retourner le node original en cas d'erreur
        }
    }
    /**
     * Parse la date et l'heure pour créer un objet Date utilisable pour le tri
     */
    parseDateTime(dateStr, timeStr) {
        try {
            // Parser la date dd/mm/aaaa
            const [day, month, year] = dateStr.split('/').map(num => parseInt(num));
            // Parser l'heure HHhMM
            const timeMatch = timeStr.match(/(\d{1,2})h(\d{2})/);
            if (!timeMatch) {
                // Si l'heure n'est pas correcte, retourner la date sans heure
                return new Date(year, month - 1, day);
            }
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            return new Date(year, month - 1, day, hours, minutes);
        } catch (error) {
            console.error('Erreur lors du parsing de la date/heure:', dateStr, timeStr, error);
            return; // Ne rien retourner si erreur
        }
    }
    /**
    * Récupère des événements depuis plusieurs couples domaine/catégorie
    */
    async fetchEventsFromMultipleSites(domaineCategorieList, currentDate = new Date()) {
        this.allEvents = [];
        const promises = [];
        for (const {domaine, chemin, categorie} of domaineCategorieList) {
            console.log(`Récupération des événements de ${domaine} pour la catégorie ${categorie}...`);
            promises.push(
                this.fetchEventsFromSite(domaine, chemin, categorie, currentDate)
                    .then(events => {
                        console.log(`${events.length} événements récupérés de ${domaine}`);
                        return events.map(event => ({...event, source: domaine, category: categorie}));
                    })
                    .catch(error => {
                        console.error(`Erreur pour ${domaine}:`, error);
                        return [];
                    })
            );
        }
        try {
            const allEventArrays = await Promise.all(promises);
            // Fusionner tous les événements
            for (const eventArray of allEventArrays) {
                this.allEvents.push(...eventArray);
            }
            // Trier par ordre chronologique
            this.allEvents.sort((a, b) => a.datetime - b.datetime);
            console.log(`Total: ${this.allEvents.length} événements récupérés et triés`);
            return this.allEvents;
        } catch (error) {
            console.error('Erreur lors de la récupération des événements:', error);
            return [];
        }
    }
    /**
    * Retourne tous les événements récupérés
    */
    getAllEvents() {
        return this.allEvents;
    }
}
// Fonction async pour gérer le chargement des événements
async function loadAllEvents() {
    const fetcherSlider = new EventFetcherSlider();
    try {
        const events = await fetcherSlider.fetchEventsFromMultipleSites(SITES_TO_FETCH_SLIDER);
        // 1. Récupérer l'élément parent block_text-wysiwyg
        const eventsSliderTmp = document.querySelector('.events-slider-tmp');
        const blockTextWysiwyg = eventsSliderTmp?.closest('.block_text-wysiwyg');
        if (!blockTextWysiwyg) {
            console.error('❌ Impossible de trouver l\'élément parent .block_text-wysiwyg');
            return;
        }
        // 2. Récupérer le texte du h2.block-title dans le parent
        const blockTitle = blockTextWysiwyg.querySelector('h2.block-title');
        const titleText = blockTitle?.textContent?.trim() || 'Événements du consistoire';
        console.log(`Titre récupéré: "${titleText}"`);
        // 3. Créer la section HTML avec le bon titre
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
            return sectionHTML.replace(/<\/?p>/gi,'');
        }
        // 4. Remplacer block_text-wysiwyg par la section
        const sectionHTML = createSliderSection(titleText);
        blockTextWysiwyg.outerHTML = sectionHTML;
        // 5. Récupérer la nouvelle slider-list après remplacement
        const sliderListDiv = document.querySelector('.slider-consistoire');
        // Ajouter les événements
        if (events.length > 0) {
            events.slice(0, EVENTS_IN_SLIDER).forEach(event => {
                if (event.node) {
                    sliderListDiv.appendChild(event.node);
                }
            });
            console.log(`✅ ${Math.min(events.length, EVENTS_IN_SLIDER)} événements affichés dans le slider`);
            // 6. Initialiser le slider après chargement des événements
            initializeSlider();
        } else {
            sliderListDiv.innerHTML = `<div style="text-align: center; padding: 2em; color: #666;">Aucun événement trouvé</div>`.replace(/<\/?p>/gi,'');
        }
    } catch (error) {
        console.error('❌ Erreur lors du chargement des événements:', error);
        // Afficher un message d'erreur à l'utilisateur
        const tempDiv = document.querySelector('.events-slider-tmp');
        if (tempDiv) {
            tempDiv.innerHTML = `<div style="text-align: center; padding: 2em; color: #d32f2f;"><strong>Erreur de chargement</strong><br>Impossible de récupérer les événements. Veuillez réessayer plus tard.</div>`.replace(/<\/?p>/gi,'');
        }
    }
}
/**
 * Fonction pour initialiser le slider après le chargement dynamique
 * Adaptée de la fonction jQuery originale
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
    // Fonction de redimensionnement
    const handleResize = () => {
        // Supprimer l'ancienne pagination
        const existingPagination = sliderContainer.querySelector('.slider-pagination');
        if (existingPagination) {
            existingPagination.innerHTML = '';
        }
        if (!window.matchMedia('screen and (min-width: 1024px)').matches) {
            // Mode mobile : 1 slide par frame
            const leftMarginForCenter = (sliderContainer.offsetWidth - (slides[0]?.offsetWidth || 0)) / 2;
            if (slides[0]) {
                slides[0].style.marginLeft = leftMarginForCenter + 'px';
            }
            const slideStyle = window.getComputedStyle(slides[0] || document.createElement('div'));
            offset = (slides[0]?.offsetWidth || 0) + parseInt(slideStyle.marginRight || '0') * 2;
            itemPerFrame = 1;
            frameCount = slides.length;
        } else {
            // Mode desktop : 3 slides par frame
            if (slides[0]) {
                slides[0].style.marginLeft = '';
            }
            const slideStyle = window.getComputedStyle(slides[0] || document.createElement('div'));
            const marginSize = parseInt(slideStyle.marginRight || '0') + parseInt(slideStyle.marginLeft || '0');
            const slideWidth = (sliderContainer.offsetWidth) / 3 - marginSize;
            slides.forEach(slide => {
                slide.style.width = slideWidth + 'px';
            });
            offset = sliderContainer.offsetWidth;
            itemPerFrame = Math.floor(offset / (slides[0]?.offsetWidth || 1));
            frameCount = Math.ceil(slideCount / itemPerFrame);
            // Créer la pagination si nécessaire
            if (frameCount > 1 && existingPagination) {
                for (let i = 0; i < frameCount; i++) {
                    const dot = document.createElement('div');
                    dot.className = 'slider-pagination_button';
                    if (i === 0) dot.classList.add('active');
                    dot.addEventListener('click', () => move(i));
                    existingPagination.appendChild(dot);
                }
            }
        }
    };
    // Fonction pour programmer le slide suivant
    const enqueueNextSlide = () => {
        sliderInterval = setTimeout(() => {
            move();
        }, 5000);
    };
    // Fonction de déplacement
    const move = (frame) => {
        if (frame === undefined || frame === null) {
            frame = (currentFrame + 1);
        } else if (frame < 0) {
            frame = frameCount - 1;
        }
        frame = frame % frameCount;
        currentFrame = frame;
        sliderList.style.transform = `translateX(-${offset * frame}px)`;
        const activeButton = sliderContainer.querySelector('.slider-pagination_button.active');
        if (activeButton) activeButton.classList.remove('active');
        const newActiveButton = sliderContainer.querySelectorAll('.slider-pagination_button')[frame];
        if (newActiveButton) newActiveButton.classList.add('active');
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
    // Événements de pause/reprise au survol
    sliderList.addEventListener('mouseenter', () => {
        clearTimeout(sliderInterval);
    });
    sliderList.addEventListener('mouseleave', () => {
        enqueueNextSlide();
    });
    // Événement de redimensionnement
    window.addEventListener('resize', handleResize);
    // Initialisation
    handleResize();
    enqueueNextSlide();
    console.log('✅ Slider initialisé avec succès');
}
// Lancer le chargement des événements
loadAllEvents();
