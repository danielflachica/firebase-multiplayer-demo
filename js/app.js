// Options for player colors... these are in the same order as the sprite sheet
const playerColors = ["blue", "red", "orange", "yellow", "green", "purple"];
const mapData = {
    minX: 1,
    maxX: 14,
    minY: 4,
    maxY: 12,
    blockedSpaces: {
        "7x4": true,
        "1x11": true,
        "12x10": true,
        "4x7": true,
        "5x7": true,
        "6x7": true,
        "8x6": true,
        "9x6": true,
        "10x6": true,
        "7x9": true,
        "8x9": true,
        "9x9": true,
    },
}

// Misc Helpers
function randomFromArray(array) {
    return array[Math.floor(Math.random() * array.length)];
}
function getKeyString(x, y) {
    return `${x}x${y}`;
}
function createName() {
    const prefix = randomFromArray([
        "COOL",
        "SUPER",
        "HIP",
        "SMUG",
        "SIKLY",
        "GOOD",
        "SAFE",
        "DEAR",
        "DAMP",
        "MOIST",
        "WARM",
        "RICH",
        "LONG",
        "DARK",
        "SOFT",
        "BUFF",
        "DOPE",
    ]);
    const animal = randomFromArray([
        "BEAR",
        "DOG",
        "CAT",
        "FOX",
        "LAMB",
        "LION",
        "BOAR",
        "GOAT",
        "VOLE",
        "SEAL",
        "PUMA",
        "MULE",
        "BULL",
        "BIRD",
        "BUG",
    ]);
    return `${prefix} ${animal}`;
}
function isSolid(x, y) {
    const blockedNextSpace = mapData.blockedSpaces[getKeyString(x, y)];
    return (
        blockedNextSpace ||
        x >= mapData.maxX ||
        x < mapData.minX ||
        y >= mapData.maxY ||
        y < mapData.minY
    );
}
function arrayFromRange(min, max) {
    var len = max - min + 1;
    var arr = new Array(len);
    for (var i=0; i<len; i++) {
      arr[i] = min + i;
    }
    return arr;
}
function getRandomSafeSpot() {
    /* Get coordinates within the map boundaries only */
    const xCoords = arrayFromRange(mapData.minX, mapData.maxX-1);
    const yCoords = arrayFromRange(mapData.minY, mapData.maxY-1);

    var x = randomFromArray(xCoords);
    var y = randomFromArray(yCoords);

    /* Check if blocked space. If yes, get new coordinates */
    while (mapData.blockedSpaces[getKeyString(x, y)]) {
        x = randomFromArray(xCoords);
        y = randomFromArray(yCoords);
    }
    // We don't look up things by key here, so just return an x/y coordinate object
    return { x, y };
}

/** Main Game function */
(function () {
    let playerId; /* string of logged in user ID in firebase */
    let playerRef; /* firebase refs */
    let players = {}; /* local list of states of all players in game */
    let playerElements = {}; /* list of references to actual DOM player elements */
    let coins = {}; /* local list of states of all coins in games */
    let coinElements = {}; /* list of references to actual DOM coin elements */

    const gameContainer = document.querySelector(".game-container");
    const playerNameInput = document.querySelector("#player-name");
    const playerColorButton = document.querySelector("#player-color");


    function placeCoin() {
        const { x, y } = getRandomSafeSpot();
        // TO-D0: Need to check first if coin is already placed/existing in firebase... avoid duplicates
        const coinRef = firebase.database().ref(`coins/${getKeyString(x, y)}`); // make the coin's position its unique key for firebase
        // Notify firebase about changes
        coinRef.set({
            x,
            y
        });

        // All players will fire this function once initially, but after a random delay fire again for continuous coin generation and placement
        const coinTimeouts = [2000, 3000, 4000, 5000];
        setTimeout(() => {
            placeCoin();
        }, randomFromArray(coinTimeouts));
    }

    function attemptCollectCoin(x, y) {
        const key = getKeyString(x, y);
        if (coins[key]) {
            // Remove this key from data
            firebase.database().ref(`coins/${key}`).remove();
            // Increment player's coin count
            playerRef.update({
                coins: players[playerId].coins + 1  // Note: client can manually inspect element and change this...
            });
        }
    }

    function handleArrowPress(xChange = 0, yChange = 0) {
        const newX = players[playerId].x + xChange;
        const newY = players[playerId].y + yChange;
        if (!isSolid(newX, newY)) {
            // move to next space if move is allowed
            players[playerId].x = newX;
            players[playerId].y = newY;
            // If moving to right or left, update direction
            if (xChange === 1) {
                players[playerId].direction = "right";
            }
            if (xChange === -1) {
                players[playerId].direction = "left";
            }
            // Notify firebase about changes
            playerRef.set(players[playerId]);
            attemptCollectCoin(newX, newY);
        }
    }

    function initGame() {
        // Listeners for moving player on grid - from KeyPressListener.js:
        new KeyPressListener("ArrowUp", () => handleArrowPress(0, -1));
        new KeyPressListener("ArrowDown", () => handleArrowPress(0, 1));
        new KeyPressListener("ArrowLeft", () => handleArrowPress(-1, 0));
        new KeyPressListener("ArrowRight", () => handleArrowPress(1, 0));

        // create reference to read EVERY player in the game (not just logged in user)
        const allPlayersRef = firebase.database().ref(`players`);
        // create reference to read all coins in the game
        const allCoinsRef = firebase.database().ref(`coins`);

        // any time a player is updated, fire this. "value" keyword comes from firebase
        allPlayersRef.on("value", (snapshot) => {
            // Fires whenever ANY change occurs in firebase tree
            players = snapshot.val() || {};  /* if player is disconnected, use empty object {} instead of null */

            /* Iterate through keys of each player and get their state */
            Object.keys(players).forEach((key) => {
                const characterState = players[key];
                let el = playerElements[key];
                // Now update the DOM (re-render)
                el.querySelector(".Character_name").innerText = characterState.name;
                el.querySelector(".Character_coins").innerText = characterState.coins;
                el.setAttribute("data-color", characterState.color);
                el.setAttribute("data-direction", characterState.direction);
                const left = 16 * characterState.x + "px";
                const top = 16 * characterState.y - 4 + "px";
                el.style.transform = `translate3d(${left}, ${top}, 0)`;
            });
        });

        /* When new player joins game */
        allPlayersRef.on("child_added", (snapshot) => {
            // Fires whenever a new node is added to the tree (when a new player joins - i.e. "new to me")
            const addedPlayer = snapshot.val(); // current value of the firebase object
            const characterElement = document.createElement("div");
            characterElement.classList.add("Character", "grid-cell");

            // Only for my character:
            if (addedPlayer.id === playerId) {
                characterElement.classList.add("you");
            }
            // Create HTML for the character
            characterElement.innerHTML = (`
                <div class="Character_shadow grid-cell"></div>
                <div class="Character_sprite grid-cell"></div>
                <div class="Character_name-container">
                    <span class="Character_name"></span>
                    <span class="Character_coins">0</span>
                </div>
                <div class="Character_you-arrow"></div>
            `);

            // Add newly created player to list of all players
            playerElements[addedPlayer.id] = characterElement;

            // Fill in initial state of the player
            characterElement.querySelector(".Character_name").innerText = addedPlayer.name;
            characterElement.querySelector(".Character_coins").innerText = addedPlayer.coins;
            characterElement.setAttribute("data-color", addedPlayer.color);
            characterElement.setAttribute("data-direction", addedPlayer.direction);
            const left = 16 * addedPlayer.x + "px";
            const top = 16 * addedPlayer.y - 4 + "px";  // - 4 to make it not touch the bottom border
            characterElement.style.transform = `translate3d(${left}, ${top}, 0)`;

            // Add newly created player to DOM
            gameContainer.appendChild(characterElement);
        });

        /* When existing player disconnects from game */
        allPlayersRef.on("child_removed", (snapshot) => {
            // Remove disconnected player from DOM after they leave
            const removedKey = snapshot.val().id;
            gameContainer.removeChild(playerElements[removedKey]);
            delete playerElements[removedKey];
        });

        /* When a coin enters the map */
        allCoinsRef.on("child_added", (snapshot) => {
            const coin = snapshot.val();
            const coords = getKeyString(coin.x, coin.y);
            coins[coords] = true;   // update local definition of where the coin is

            // Create the DOM element
            const coinElement = document.createElement("div");
            coinElement.classList.add("Coin", "grid-cell");
            coinElement.innerHTML = `
                <div class="Coin_shadow grid-cell"></div>
                <div class="Coin_sprite grid-cell"></div>
            `;

            // Position the coin according to its x,y coords
            const left = 16 * coin.x + "px";
            const top = 16 * coin.y - 4 + "px";
            coinElement.style.transform = `translate3d(${left}, ${top}, 0)`;

            // Keep a reference to the coin for removal later on and add to DOM
            coinElements[coords] = coinElement; // coords = key
            gameContainer.appendChild(coinElement);
        });

        /* Firebase hook for when coin is collected/removed from map */
        allCoinsRef.on("child_removed", (snapshot) => {
            const {x, y} = snapshot.val(); // snapshot will return the x,y value of the affected coin
            const removedKey = getKeyString(x,y);
            gameContainer.removeChild(coinElements[removedKey]);
            delete coinElements[removedKey];
        });

        /* Sync player name changes from input to firebase */
        playerNameInput.addEventListener("change", (e) => {
            const newName = e.target.value || createName();     // provide default createName() in case newName is blank
            playerNameInput.value = newName;
            // Update firebase (only update, not set entire node attribtues)
            playerRef.update({
                name: newName
            });
        });

        /* Update player color on button click */
        playerColorButton.addEventListener("click", () => {
            const myColorIndex = playerColors.indexOf(players[playerId].color);
            const nextColor = playerColors[myColorIndex + 1] || playerColors[0]; // Go to start of arr if arrIndex outofbounds
            // Update firebase
            playerRef.update({
                color: nextColor
            });
        });

        /* Place first coin. The function handles the rest (random generation after delay) */
        placeCoin();
    }

    // Set up Authentication listener
    firebase.auth().onAuthStateChanged((user) => {
        // console.log(user);
        if (user) {
            // Logged in
            playerId = user.uid;
            playerRef = firebase.database().ref(`players/${playerId}`);     // Ref = how you interact with a Firebase node

            const name = createName();
            /* Sync initial name to name input */
            playerNameInput.value = name;

            const {x, y} = getRandomSafeSpot();

            // Set player attributes
            playerRef.set({
                id: playerId,
                name,                   // You can just write "name," instead of "name: name," since the variable name matches the attribute
                direction: 'right',
                color: randomFromArray(playerColors),
                x,
                y,
                coins: 0,
            });

            // Remove player from Firebase node list once browser/tab is closed/disconnected
            playerRef.onDisconnect().remove();

            // Start game now that user is signed in
            initGame();
        }
        else {
            // Logged out
        }
    });

    // Sign into Firebase without credentials
    firebase.auth().signInAnonymously().catch((error) => {
        var errorCode = error.code;
        var errorMessage = error.message;
        // ...
        console.log(errorCode, errorMessage);
    });

})();
