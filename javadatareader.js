// Liste des UUIDs stockée dans un Set (évite les doublons)
let uuids = new Set();
let playerContainers = {}; // Stocke les conteneurs par UUID
let usernameCache = {}; // Cache pour éviter les requêtes répétées

async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      throw new Error(`Erreur HTTP: ${response.status}`);
    } catch (error) {
      console.error(`Tentative ${i + 1} échouée pour ${url}:`, error);
      if (i < retries - 1) await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw new Error(`Échec après ${retries} tentatives`);
}

async function loadData(uuid) {
  try {
    const rawUuid = uuid.replace(/\.json$/, "");
    const uuidPrefix = rawUuid.slice(0, 2);
    const url = `http://217.182.69.245:5000/world/cobblemonplayerdata/${uuidPrefix}/${rawUuid}.json`;

    const data = await fetchWithRetry(url);

    if (data) {
      if (!playerContainers[rawUuid]) {
        const container = document.createElement("div");
        container.classList.add("container");
        container.style.display = "none"; // Rend le conteneur invisible
        container.innerHTML = `
          <h2>UUID : ${uuid}</h2>
          <h3 id="capture-${uuid}">Total Capture Count : ${data.advancementData.totalCaptureCount}</h3>
          <p id="username-${uuid}">Nom d'utilisateur : Recherche en cours...</p>
          <p id="winnings-${uuid}">Winnings : 0</p>
          <p id="losses-${uuid}">Losses : 0</p>
        `;
        document.getElementById("data-container").appendChild(container);
        playerContainers[rawUuid] = container;
      }

      playerContainers[rawUuid].querySelector(
        `#capture-${uuid}`
      ).textContent = `Total Capture Count : ${data.advancementData.totalCaptureCount}`;

      const contact = data.extraData?.cobblenavContactData?.contacts?.[0] || {};
      const winnings = contact.winnings || 0;
      const losses = contact.losses || 0;

      playerContainers[rawUuid].querySelector(
        `#winnings-${uuid}`
      ).textContent = `Win : ${winnings}`;
      playerContainers[rawUuid].querySelector(
        `#losses-${uuid}`
      ).textContent = `Loses : ${losses}`;

      await fetchMinecraftUsername(uuid);
    } else {
      console.error("Données invalides pour l'UUID :", uuid);
    }
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des données pour l'UUID",
      uuid,
      error
    );
  }
}

async function fetchMinecraftUsername(uuid) {
  try {
    const cleanUuid = uuid.replace(/\.json$/, "");
    if (usernameCache[cleanUuid]) {
      document.getElementById(
        `username-${uuid}`
      ).textContent = `Nom d'utilisateur : ${usernameCache[cleanUuid]}`;
      return;
    }

    console.log(`Recherche du nom d'utilisateur pour l'UUID : ${uuid}`);
    const response = await fetch(
      `https://api.ashcon.app/mojang/v2/user/${cleanUuid}`
    );
    if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);

    const userData = await response.json();
    usernameCache[cleanUuid] = userData.username || "Inconnu";

    document.getElementById(
      `username-${uuid}`
    ).textContent = `Nom d'utilisateur : ${usernameCache[cleanUuid]}`;
  } catch (error) {
    console.error(
      "Erreur lors de la récupération du nom d'utilisateur :",
      error
    );
    document.getElementById(`username-${uuid}`).textContent =
      "Erreur de récupération";
  }
}

async function checkForNewPlayers() {
  console.log("Vérification des nouveaux joueurs...");
  try {
    const response = await fetch("http://217.182.69.245:5000/get-uuids");
    if (response.ok) {
      const newUuids = await response.json();
      newUuids.forEach((uuid) => {
        if (!uuids.has(uuid)) {
          uuids.add(uuid);
          loadData(uuid.replace(/\.json$/, ""));
        }
      });
    } else {
      console.error("Erreur lors de la récupération des UUIDs du serveur");
    }
  } catch (error) {
    console.error("Erreur lors de la récupération des UUIDs du serveur", error);
  }
}

function calculateAdjustedPoints(winnerPoints, loserPoints) {
  const factor = Math.max((loserPoints + 1) / (winnerPoints + 1), 1);
  const bonus = Math.min(30, Math.round(20 * (factor - 1)));

  const winnerGain = 20 + bonus; // Maximum 50 points
  const loserLoss = Math.max(Math.round(15 / factor), 1); // Minimum 1 point perdu

  return {
    winnerGain,
    loserLoss: Math.min(loserLoss, loserPoints), // Ne retire pas plus de points que disponibles
  };
}

function updateScoreboard() {
  const scoreboardCaptures = document.getElementById("scoreboard-captures");
  const scoreboardWinningsLosses = document.getElementById(
    "scoreboard-winnings-losses"
  );
  const scoreboardPoints = document.getElementById("scoreboard-points");

  if (!scoreboardCaptures || !scoreboardWinningsLosses || !scoreboardPoints) {
    console.error("Scoreboards introuvables !");
    return;
  }

  const players = Object.entries(playerContainers).map(([uuid, container]) => {
    return {
      uuid,
      username:
        container
          .querySelector(`#username-${uuid}`)
          ?.textContent.split(": ")[1] || "Joueur inconnu",
      captureCount:
        parseInt(
          container
            .querySelector(`#capture-${uuid}`)
            ?.textContent.split(": ")[1]
        ) || 0,
      winnings:
        parseInt(
          container
            .querySelector(`#winnings-${uuid}`)
            ?.textContent.split(": ")[1]
        ) || 0,
      losses:
        parseInt(
          container.querySelector(`#losses-${uuid}`)?.textContent.split(": ")[1]
        ) || 0,
    };
  });

  const sortedByCaptures = [...players].sort(
    (a, b) => b.captureCount - a.captureCount
  );
  const sortedByWinningsLosses = [...players].sort(
    (a, b) => b.winnings - a.winnings
  );

  const sortedByPoints = [...players]
    .map((player) => {
      let points = 0;

      if (player.winnings > 0 || player.losses > 0) {
        players.forEach((opponent) => {
          if (opponent.uuid !== player.uuid && opponent.losses > 0) {
            const { winnerGain, loserLoss } = calculateAdjustedPoints(
              player.winnings,
              opponent.winnings
            );
            points += player.winnings * winnerGain - player.losses * loserLoss;
          }
        });
      }

      return { ...player, score: Math.max(0, points) };
    })
    .sort((a, b) => b.score - a.score);

  function updateScoreboardSection(
    scoreboard,
    title,
    sortedPlayers,
    formatter
  ) {
    scoreboard.innerHTML = `<h2>${title}</h2>`;
    sortedPlayers.forEach((player, index) => {
      const entry = document.createElement("div");
      entry.classList.add("scoreboard-entry");

      // Applique la couleur en fonction de la position dans le classement
      if (index === 0) {
        entry.style.color = "gold"; // Premier : Jaune
      } else if (index === 1) {
        entry.style.color = "gray"; // Deuxième : Gris
      } else if (index === 2) {
        entry.style.color = "#cd7f32"; // Troisième : Bronze clair
      }

      entry.innerHTML = `<p>${index + 1}. ${formatter(player)}</p>`;
      scoreboard.appendChild(entry);
    });
  }

  updateScoreboardSection(
    scoreboardCaptures,
    "Classement Captures",
    sortedByCaptures,
    (p) =>
      `${p.username} <span style="color: black;">/</span> ${p.captureCount} captures`
  );
  updateScoreboardSection(
    scoreboardWinningsLosses,
    "Classement Win / Lost",
    sortedByWinningsLosses,
    (p) =>
      `${p.username} <span style="color: black;">/</span> <span style="color: green;">${p.winnings} W</span>, <span style="color: red;">${p.losses} L</span>`
  );
  updateScoreboardSection(
    scoreboardPoints,
    "Classement PokeLeague Points",
    sortedByPoints,
    (p) => `${p.username} <span style="color: black;">/</span> ${p.score} PoL`
  );
}

// Initialisation et mise à jour automatique
document.addEventListener("DOMContentLoaded", () => {
  loadAllData();
  setInterval(loadAllData, 5000);
  setInterval(checkForNewPlayers, 5000);
  setInterval(updateScoreboard, 5000);
});

async function loadAllData() {
  console.log("Chargement des données pour tous les UUIDs...");
  await Promise.all(
    [...uuids].map((uuid) => loadData(uuid.replace(/\.json$/, "")))
  );
  updateScoreboard();
}
