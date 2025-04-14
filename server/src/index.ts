import http from "http";
import express from "express";
import { Server } from "colyseus";
import { monitor } from "@colyseus/monitor";

// Importer notre logique de Room
import { MyRoom } from "./rooms/MyRoom";

const port = Number(process.env.PORT || 2567);
const app = express();

app.use(express.json());

// Initialiser le serveur de jeu Colyseus
const gameServer = new Server({
  server: http.createServer(app),
});

// Enregistrer notre type de room "my_room"
gameServer.define("my_room", MyRoom);

// Optionnel : Ajouter le panneau de monitoring Colyseus
// Accessible via http://localhost:2567/colyseus
app.use("/colyseus", monitor());

// Démarrer l'écoute du serveur
gameServer.listen(port);
console.log(`[GameServer] Listening on ws://localhost:${port}`);

// Route simple pour vérifier que le serveur express fonctionne
app.get("/", (req, res) => {
    res.send("Serveur Colyseus est en cours d'exécution !");
}); 