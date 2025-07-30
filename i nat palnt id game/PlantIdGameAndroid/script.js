document.addEventListener('DOMContentLoaded', () => {
    const plantImage = document.getElementById('plant-image');
    const optionButtons = document.querySelectorAll('.option-btn');
    const feedbackDiv = document.getElementById('feedback');
    const scoreSpan = document.getElementById('score');
    const studyList = document.getElementById('study-list');
    const studyCount = document.getElementById('study-count');
    const livesHearts = document.getElementById('lives-hearts');
    const gameOverOverlay = document.getElementById('game-over-overlay');
    const finalScore = document.getElementById('final-score');
    const restartBtn = document.getElementById('restart-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const photoCounter = document.getElementById('photo-counter');

    let score = 0;
    let lives = 3;
    let scoreStreak = 0;
    let currentPlant;
    let currentPhotoIndex = 0;
    const studyItems = new Map();
    let plantData = [];
    let allPlantNames = [];

    const userPlantList = [
        'Prairie Clover', 'Caroline ScalyStem', 'Yellow eyed grasses', 'Snakeherb', 'Liatris', 'Sundews', 
        'Butterworts', 'Tarflower', 'Orchids', 'Rattlesnake master', 'Vanillaleaf/chaffheads', 
        'Pink Milkwort', 'Meadowbeauties', 'Heliotrope', 'Goldenrods', 'Iris', 'Royal fern', 'Marsh pinks', 
        'Musky mint', 'Blueberries', 'Hypericum', 'Violets', 'Trees', 'Oaks', 'Pines', 'Myrtles', 'Persimmon', 
        'Dahoon holly', 'Cocoplum', 'Hatpins', 'Pipeworts', 'Eryngyo', 'White top sedge', 'Florida Loosestrife', 
        'Candyroot', 'Water cowbane', 'Bladderworts', 'Climbing aster', 'Bacopa caroliniana', 'Pink buttonbush', 
        'Mallow', 'Mermaidweed', 'Dragonhead', 'Najas'
    ];

    async function fetchPlantData() {
        updateFeedback('Loading plant data...', 'loading');
        
        const promises = userPlantList.map(async (plantName) => {
            try {
                const response = await fetch(`https://api.inaturalist.org/v1/taxa/autocomplete?q=${encodeURIComponent(plantName)}&place_id=21`);
                const data = await response.json();
                
                // Find a result that is a good match
                let taxon = data.results.find(r => {
                    const scientificName = r.name.toLowerCase();
                    const commonName = r.preferred_common_name ? r.preferred_common_name.toLowerCase() : '';
                    const query = plantName.toLowerCase();
                    return scientificName === query || commonName === query || scientificName.includes(query) || commonName.includes(query);
                });

                // If no good match, fall back to the first result if it exists and is a close match
                if (!taxon && data.results && data.results.length > 0) {
                    const firstResult = data.results[0];
                    if (firstResult.name.toLowerCase().includes(plantName.toLowerCase()) || 
                        (firstResult.preferred_common_name && firstResult.preferred_common_name.toLowerCase().includes(plantName.toLowerCase()))) {
                        taxon = firstResult;
                    }
                }

                if (taxon) {
                    // Fetch both taxon photos and observation photos for more variety
                    const [taxonResponse, observationsResponse] = await Promise.all([
                        fetch(`https://api.inaturalist.org/v1/taxa/${taxon.id}`),
                        fetch(`https://api.inaturalist.org/v1/observations?taxon_id=${taxon.id}&quality_grade=research&photo_license=any&per_page=20&order=desc&order_by=votes`)
                    ]);
                    
                    const taxonData = await taxonResponse.json();
                    const observationsData = await observationsResponse.json();

                    let photos = [];
                    
                    // Get taxon photos (usually high quality reference photos)
                    if (taxonData.results && taxonData.results[0] && taxonData.results[0].taxon_photos) {
                        const taxonPhotos = taxonData.results[0].taxon_photos.map(p => ({
                            url: p.photo.medium_url,
                            large_url: p.photo.large_url || p.photo.medium_url,
                            viewType: categorizePhoto(p.photo.medium_url, 'taxon'),
                            source: 'reference'
                        }));
                        photos.push(...taxonPhotos);
                    }
                    
                    // Get observation photos (more variety, different angles)
                    if (observationsData.results) {
                        const observationPhotos = observationsData.results
                            .filter(obs => obs.photos && obs.photos.length > 0)
                            .slice(0, 15) // Limit to prevent too many photos
                            .flatMap(obs => obs.photos.map(photo => ({
                                url: photo.url.replace('square', 'medium'),
                                large_url: photo.url.replace('square', 'large'),
                                viewType: categorizePhoto(photo.url, 'observation'),
                                source: 'observation'
                            })));
                        photos.push(...observationPhotos);
                    }

                    // Remove duplicates and organize by view type
                    const uniquePhotos = Array.from(
                        new Map(photos.map(p => [p.url, p])).values()
                    );
                    
                    // Prioritize diverse view types
                    const organizedPhotos = organizePhotosByViewType(uniquePhotos);

                    if (organizedPhotos.length > 0) {
                        return {
                            id: taxon.id,
                            scientificName: taxon.name,
                            commonName: taxon.preferred_common_name,
                            images: organizedPhotos.slice(0, 12), // Limit to 12 photos max
                        };
                    }
                }
            } catch (error) {
                console.error(`Error fetching data for ${plantName}:`, error);
            }
            return null;
        });

        const results = await Promise.all(promises);
        plantData = results.filter(p => p !== null);
        allPlantNames = plantData.map(p => formatPlantName(p));
        
        if(plantData.length > 0) {
            updateFeedback('Ready to play!', 'success');
            setTimeout(startNewRound, 1000);
        } else {
            updateFeedback('Could not load plant data. Please check your connection.', 'error');
        }
    }

    function categorizePhoto(photoUrl, source) {
        // Simple heuristic to categorize photos based on URL patterns and source
        const url = photoUrl.toLowerCase();
        
        // More sophisticated categorization could be added here
        // For now, we'll use a rotation system with bias toward different types
        const types = ['whole_plant', 'flower', 'leaf', 'bark', 'fruit', 'habitat'];
        const hash = photoUrl.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        
        return types[Math.abs(hash) % types.length];
    }

    function organizePhotosByViewType(photos) {
        // Group photos by view type
        const grouped = photos.reduce((acc, photo) => {
            if (!acc[photo.viewType]) acc[photo.viewType] = [];
            acc[photo.viewType].push(photo);
            return acc;
        }, {});
        
        // Ensure we have a good mix of view types
        const organized = [];
        const viewTypes = ['whole_plant', 'flower', 'leaf', 'bark', 'fruit', 'habitat'];
        
        // Add one photo from each view type first (if available)
        viewTypes.forEach(type => {
            if (grouped[type] && grouped[type].length > 0) {
                organized.push(grouped[type].shift());
            }
        });
        
        // Add remaining photos
        viewTypes.forEach(type => {
            if (grouped[type]) {
                organized.push(...grouped[type]);
            }
        });
        
        return organized;
    }

    function startNewRound() {
        clearFeedback();
        
        // Prioritize plants from the study list
        const studyListItems = Array.from(studyItems.keys());
        if (studyListItems.length > 0 && Math.random() < 0.7) {
            const plantName = studyListItems[Math.floor(Math.random() * studyListItems.length)];
            currentPlant = plantData.find(p => p.scientificName === plantName);
        } else {
            currentPlant = plantData[Math.floor(Math.random() * plantData.length)];
        }

        if (!currentPlant) {
            console.error("Could not select a plant for the new round.");
            updateFeedback('Error: Could not start a new round.', 'error');
            return;
        }
        
        currentPhotoIndex = 0;
        displayCurrentPhoto();

        const options = getOptions(currentPlant);
        optionButtons.forEach((button, index) => {
            button.textContent = `${index + 1}. ${formatPlantName(options[index])}`;
            button.dataset.plantName = options[index].scientificName;
            button.disabled = false;
            button.style.background = '';
            button.style.color = '';
        });
    }

    function displayCurrentPhoto() {
        const currentPhoto = currentPlant.images[currentPhotoIndex];
        plantImage.src = currentPhoto.url || currentPhoto;
        plantImage.onerror = function() {
            // Fallback to large_url if medium fails
            if (currentPhoto.large_url && this.src !== currentPhoto.large_url) {
                this.src = currentPhoto.large_url;
            }
        };
        
        photoCounter.innerHTML = `
            <span class="photo-number">${currentPhotoIndex + 1} / ${currentPlant.images.length}</span>
            ${currentPhoto.viewType ? `<span class="view-type">${formatViewType(currentPhoto.viewType)}</span>` : ''}
        `;
        
        prevBtn.style.display = currentPlant.images.length > 1 ? 'flex' : 'none';
        nextBtn.style.display = currentPlant.images.length > 1 ? 'flex' : 'none';
        photoCounter.style.display = currentPlant.images.length > 1 ? 'block' : 'none';
    }

    function formatViewType(viewType) {
        const typeMap = {
            'whole_plant': '🌿 Whole Plant',
            'flower': '🌸 Flower',
            'leaf': '🍃 Leaf',
            'bark': '🌲 Bark',
            'fruit': '🫐 Fruit',
            'habitat': '🏞️ Habitat'
        };
        return typeMap[viewType] || '📷 View';
    }

    function getOptions(correctPlant) {
        let options = [correctPlant];
        while (options.length < 4) {
            const randomPlant = plantData[Math.floor(Math.random() * plantData.length)];
            if (!options.some(p => p.scientificName === randomPlant.scientificName)) {
                options.push(randomPlant);
            }
        }
        return shuffleArray(options);
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    function handleAnswer(selectedName) {
        optionButtons.forEach(button => button.disabled = true);
        clearFeedback();

        const link = `<a href="https://www.inaturalist.org/taxa/${currentPlant.id}" target="_blank">View on iNaturalist</a>`;

        if (selectedName === currentPlant.scientificName) {
            scoreStreak++;
            const points = 10 + (scoreStreak * 5);
            updateFeedback(`Correct! +${points} 🎉<br>${link}`, 'correct');
            score += points;
            scoreSpan.textContent = score;
            scoreSpan.classList.add('score-update');

            if(studyItems.has(currentPlant.scientificName)) {
                studyItems.delete(currentPlant.scientificName);
                updateStudyList();
            }
        } else {
            scoreStreak = 0;
            lives--;
            updateFeedback(`Wrong! It's ${formatPlantName(currentPlant)}<br>${link}`, 'wrong');
            updateLives();

            if (!studyItems.has(currentPlant.scientificName)) {
                studyItems.set(currentPlant.scientificName, currentPlant);
                updateStudyList();
            }

            if (lives === 0) {
                endGame();
                return;
            }
        }

        setTimeout(() => {
            clearFeedback();
            scoreSpan.classList.remove('score-update');
            startNewRound();
        }, 3000);
    }

    function updateFeedback(message, type) {
        feedbackDiv.innerHTML = message;
        feedbackDiv.className = 'feedback';
        
        if (type === 'correct') {
            feedbackDiv.classList.add('correct-answer');
        } else if (type === 'wrong') {
            feedbackDiv.classList.add('wrong-answer');
        }
    }

    function clearFeedback() {
        feedbackDiv.classList.remove('correct-answer', 'wrong-answer');
    }

    function formatPlantName(plant) {
        if (plant.commonName) {
            return `${plant.commonName} (${plant.scientificName})`;
        }
        return plant.scientificName;
    }

    function updateLives() {
        livesHearts.innerHTML = '';
        for (let i = 0; i < 3; i++) {
            const span = document.createElement('span');
            span.textContent = i < lives ? '❤️' : '🖤';
            livesHearts.appendChild(span);
        }
    }

    function endGame() {
        finalScore.textContent = score;
        gameOverOverlay.classList.add('visible');
    }

    function restartGame() {
        score = 0;
        lives = 3;
        scoreStreak = 0;
        studyItems.clear();
        
        scoreSpan.textContent = score;
        updateLives();
        updateStudyList();
        
        gameOverOverlay.classList.remove('visible');
        startNewRound();
    }

    function updateStudyList() {
        studyList.innerHTML = '';
        const count = studyItems.size;
        
        studyCount.textContent = count === 0 ? 'No plants to review' : 
                                count === 1 ? '1 plant to review' : 
                                `${count} plants to review`;
        
        for (const [name, plant] of studyItems.entries()) {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = `https://www.inaturalist.org/taxa/${plant.id}`;
            link.target = '_blank';
            link.textContent = formatPlantName(plant);
            li.appendChild(link);
            studyList.appendChild(li);
        }
    }

    prevBtn.addEventListener('click', () => {
        if (currentPhotoIndex > 0) {
            currentPhotoIndex--;
            displayCurrentPhoto();
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentPhotoIndex < currentPlant.images.length - 1) {
            currentPhotoIndex++;
            displayCurrentPhoto();
        }
    });

    optionButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            handleAnswer(event.target.dataset.plantName);
        });
    });

    document.addEventListener('keydown', (event) => {
        const key = parseInt(event.key);
        if (key >= 1 && key <= 4) {
            if (!optionButtons[key - 1].disabled) {
                handleAnswer(optionButtons[key - 1].dataset.plantName);
            }
        }
    });

    restartBtn.addEventListener('click', restartGame);

    // Initialize the game
    updateStudyList();
    fetchPlantData();
}); 