// ===================================================================
// 🔧 CONFIGURATION
// ===================================================================
// Nombre de jours dans le futur pour chercher les événements (à partir d'aujourd'hui)
const MAX_DAYS_LISTE = 90;
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

/**
* Script pour récupérer des événements depuis d'autres sites web
* et les afficher dans l'ordre chronologique
*/
class EventFetcherListe {
    constructor() {
        this.allEvents = [];
    }
    /**
     * Fonction modifiée basée sur la fonction fetchEvents existante
     * Ajoute les paramètres domaine et categorie
     */
    async fetchEventsFromSite(domaine, chemin, categorie, currentDate = new Date()) {
        return new Promise((resolve, reject) => {
            const events = [];
            // Calculer la date de fin (currentDate + XX jours)
            const endDate = new Date(currentDate);
            endDate.setDate(endDate.getDate() + MAX_DAYS_LISTE);
            // Formater les dates au format attendu (YYYY-MM-DD)
            const dateFrom = currentDate.toISOString().slice(0, 10);
            const dateTo = endDate.toISOString().slice(0, 10);
            const fetchPage = async (page) => {
                const url = `${domaine}${chemin}/page/${page}/?date-from=${dateFrom}&date-to=${dateTo}&category=${categorie}`;
                try {
                    const proxyUrl = 'https://api.cors.lol/?url=' + encodeURIComponent(url);
                    const response = await fetch(proxyUrl, {
                        method: 'GET',
                        credentials: 'omit',
                        headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
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
                // Modifier le node pour ajouter le nom de la paroisse
                const placeDiv = node.querySelector('.event-informations_place');
                if (placeDiv) {
                    const parishName = SITES_TO_FETCH_LISTE.find(site => node.href.includes(site.domaine))?.paroisse || '';
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
                if (date) {
                    events.push({
                        url,
                        title,
                        node,
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
        for (const { domaine, chemin, categorie } of domaineCategorieList) {
            console.log(`Récupération des événements de ${domaine} pour la catégorie ${categorie}...`);
            promises.push(
                this.fetchEventsFromSite(domaine, chemin, categorie, currentDate)
                    .then(events => {
                        console.log(`${events.length} événements récupérés de ${domaine}`);
                        return events.map(event => ({ ...event, source: domaine, category: categorie }));
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
    const fetcherList = new EventFetcherListe();
    try {
        const events = await fetcherList.fetchEventsFromMultipleSites(SITES_TO_FETCH_LISTE);
        // Afficher les événements dans la page
        const postListDiv = document.querySelector('.post-list');
        // Supprimer le spinner de chargement
        const loadingDiv = document.getElementById('loading-events');
        if (loadingDiv) {
            loadingDiv.remove();
        }
        // Ajouter les événements
        if (events.length > 0) {
            events.forEach(event => {
                if (event.node) {
                    postListDiv.appendChild(event.node);
                }
            });
        } else {
            postListDiv.innerHTML = `</p><div style="text-align: center; padding: 2em; color: #666;">Aucun événement trouvé</div><p>`;
        }
    } catch (error) {
        console.error('❌ Erreur lors du chargement des événements:', error);
        // Afficher un message d'erreur à l'utilisateur
        const postListDiv = document.querySelector('.post-list');
        postListDiv.innerHTML = `</p><div style="text-align: center; padding: 2em; color: #d32f2f;"><strong>Erreur de chargement</strong><br>Impossible de récupérer les événements. Veuillez réessayer plus tard.</div><p>`;
    }
}
// Lancer le chargement des événements

loadAllEvents();
